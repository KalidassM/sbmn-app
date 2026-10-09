const crypto = require('crypto');
const Razorpay = require('razorpay');
const db = require('../db');

function getGatewaySettings() {
  return db.prepare('SELECT razorpay_key_id, razorpay_key_secret, payee_name FROM payment_settings WHERE id = 1').get();
}

function getRazorpayClient() {
  const settings = getGatewaySettings();
  if (!settings.razorpay_key_id || !settings.razorpay_key_secret) return null;
  return new Razorpay({ key_id: settings.razorpay_key_id, key_secret: settings.razorpay_key_secret });
}

function verifySignature(orderId, paymentId, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return expected === signature;
}



function getFeeConfig() {
  const s =
    db
      .prepare('SELECT gateway_fee_percent, gateway_settlement_fee_percent, gateway_gst_percent, gateway_fee_free_until FROM payment_settings WHERE id = 1')
      .get() || {};
  return {
    feePercent: s.gateway_fee_percent ?? 2,
    settlementFeePercent: s.gateway_settlement_fee_percent ?? 0,
    gstPercent: s.gateway_gst_percent ?? 18,
    feeFreeUntil: s.gateway_fee_free_until || null,
  };
}

// Today's date in India, as YYYY-MM-DD (the server itself may run in UTC)
function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Grosses the amount up so that after Razorpay deducts its fees (the gateway fee and the same-day
// settlement fee, each a % of the amount charged, plus GST on both) the association nets exactly
// `netRupees`. All maths is in whole paise.
function computeCheckout(netRupees) {
  const config = getFeeConfig();
  const { settlementFeePercent, gstPercent } = config;
  // Razorpay's free-credits offer: while it runs the gateway fee isn't charged to the association,
  // so it isn't passed on to members either (the same-day settlement fee still is)
  const feeWaived = !!config.feeFreeUntil && todayIST() <= config.feeFreeUntil;
  const feePercent = feeWaived ? 0 : config.feePercent;
  const rate = (feePercent + settlementFeePercent) / 100;
  const gst = gstPercent / 100;
  const netPaise = Math.round(Number(netRupees) * 100);
  const totalPaise = Math.round(netPaise / (1 - rate * (1 + gst)));
  const chargesPaise = totalPaise - netPaise;
  const gstPaise = Math.round((chargesPaise * gst) / (1 + gst));
  const preGstPaise = chargesPaise - gstPaise;
  const settlementFeePaise = feePercent + settlementFeePercent ? Math.round((preGstPaise * settlementFeePercent) / (feePercent + settlementFeePercent)) : 0;
  const feePaise = preGstPaise - settlementFeePaise;
  return {
    feePercent: config.feePercent,
    feeWaived,
    feeFreeUntil: config.feeFreeUntil,
    settlementFeePercent,
    gstPercent,
    netPaise,
    feePaise,
    settlementFeePaise,
    gstPaise,
    totalPaise,
    net: netPaise / 100,
    fee: feePaise / 100,
    settlementFee: settlementFeePaise / 100,
    gst: gstPaise / 100,
    total: totalPaise / 100,
  };
}

const outstanding = (d) => Number(d.amount_due) - Number(d.amount_paid);

// Called once a Razorpay payment's signature has been verified. The dues are NOT marked paid yet -
// the money hasn't reached the bank - they're flagged 'unsettled' until syncSettlements() sees
// Razorpay settle the payment. Re-checks the amount with Razorpay itself when it can be reached.
async function recordGatewayPayment(dues, orderId, paymentId) {
  const net = dues.reduce((sum, d) => sum + outstanding(d), 0);
  const checkout = computeCheckout(net);

  const client = getRazorpayClient();
  if (client) {
    try {
      const payment = await client.payments.fetch(paymentId);
      if (payment.order_id !== orderId) return { error: 'Payment does not belong to this order' };
      if (!['captured', 'authorized'].includes(payment.status)) return { error: `Payment is ${payment.status}, not completed` };
      // Compare with the order as it was created (the fee rates or free-offer date may have changed
      // since), and make sure it covers at least the dues being paid
      const order = await client.orders.fetch(orderId);
      if (Number(payment.amount) !== Number(order.amount)) return { error: 'Payment amount does not match the order' };
      if (Number(order.amount) < checkout.netPaise) return { error: 'Payment amount is less than the amount due' };
      checkout.totalPaise = Number(order.amount);
    } catch (err) {
      // The signature already proved the payment is genuine - don't fail the member's payment
      // just because the confirmation lookup couldn't reach Razorpay.
      console.error('Razorpay payment lookup failed (continuing on signature alone):', err.error || err.message || err);
    }
  }

  const mark = db.prepare(
    `UPDATE maintenance_payments
     SET gateway_status = 'unsettled', gateway_fee = ?, paid_at = datetime('now'), paid_date = date('now'),
         razorpay_payment_id = ?, payment_mode = 'Razorpay', reference_no = ?
     WHERE id = ?`
  );
  const charges = (checkout.totalPaise - checkout.netPaise) / 100;
  db.transaction(() =>
    dues.forEach((d) => mark.run(net ? Math.round((charges * outstanding(d)) / net * 100) / 100 : 0, paymentId, paymentId, d.id))
  )();
  return { dues: dues.map((d) => db.prepare('SELECT * FROM maintenance_payments WHERE id = ?').get(d.id)), checkout };
}

async function fetchReconDay(keyId, keySecret, date) {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const items = [];
  for (let skip = 0; ; skip += 100) {
    const url = `https://api.razorpay.com/v1/settlements/recon/combined?year=${date.getFullYear()}&month=${date.getMonth() + 1}&day=${date.getDate()}&count=100&skip=${skip}`;
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) throw new Error(`Razorpay settlement report returned ${res.status}`);
    const page = (await res.json()).items || [];
    items.push(...page);
    if (page.length < 100) return items;
  }
}

// Looks at Razorpay's settlement report for every day since the oldest unsettled online payment
// and marks each due paid once its payment shows up in a settlement. Returns how many were settled.
async function syncSettlements() {
  const pending = [
    ...db
      .prepare("SELECT id, razorpay_payment_id, paid_date FROM maintenance_payments WHERE gateway_status = 'unsettled' AND razorpay_payment_id IS NOT NULL")
      .all(),
    ...db
      .prepare("SELECT id, razorpay_payment_id, donation_date AS paid_date FROM donations WHERE gateway_status = 'unsettled' AND razorpay_payment_id IS NOT NULL")
      .all(),
  ];
  if (!pending.length) return { checked: 0, settled: 0 };
  const settings = getGatewaySettings();
  if (!settings.razorpay_key_id || !settings.razorpay_key_secret) return { checked: pending.length, settled: 0 };

  const wanted = new Set(pending.map((d) => d.razorpay_payment_id));
  const oldest = new Date(pending.map((d) => d.paid_date).filter(Boolean).sort()[0] || Date.now());
  const today = new Date();
  const settledByPayment = new Map();
  for (let day = new Date(oldest); day <= today && settledByPayment.size < wanted.size; day.setDate(day.getDate() + 1)) {
    const items = await fetchReconDay(settings.razorpay_key_id, settings.razorpay_key_secret, day);
    items.forEach((i) => {
      if (i.type === 'payment' && wanted.has(i.entity_id)) settledByPayment.set(i.entity_id, i);
    });
  }

  const settle = db.prepare(
    `UPDATE maintenance_payments
     SET gateway_status = 'settled', status = 'paid', amount_paid = amount_due, settled_at = datetime('now'), settlement_id = ?
     WHERE razorpay_payment_id = ? AND gateway_status = 'unsettled'`
  );
  const settleDonation = db.prepare(
    `UPDATE donations
     SET gateway_status = 'settled', status = 'completed', settled_at = datetime('now'), settlement_id = ?
     WHERE razorpay_payment_id = ? AND gateway_status = 'unsettled'`
  );
  let settled = 0;
  db.transaction(() =>
    settledByPayment.forEach((item, paymentId) => {
      settled += settle.run(item.settlement_id || null, paymentId).changes;
      settled += settleDonation.run(item.settlement_id || null, paymentId).changes;
    })
  )();
  return { checked: pending.length, settled };
}

module.exports = {
  getGatewaySettings,
  getRazorpayClient,
  verifySignature,
  getFeeConfig,
  computeCheckout,
  recordGatewayPayment,
  syncSettlements,
};
