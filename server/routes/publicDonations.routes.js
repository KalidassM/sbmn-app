const express = require('express');
const db = require('../db');
const { logActivity } = require('../utils/activityLog');
const { notifyDonationWhatsApp } = require('../utils/paymentNotify');
const { getGatewaySettings, getRazorpayClient, verifySignature, computeCheckout } = require('../utils/razorpay');
const { buildUpiQr } = require('../utils/upiQr');

const router = express.Router();

const MAX_AMOUNT = 1000000;

function clean(value, max) {
  return (value || '').toString().trim().slice(0, max);
}

// No requireAuth on this router — well-wishers have no account. Only exposes what's needed to pay a donation.
// Nothing is written to the donations table until the payment is verified, so an abandoned payment leaves no entry.
router.get('/razorpay-config', (req, res) => {
  const settings = getGatewaySettings();
  res.json({
    configured: !!(settings.razorpay_key_id && settings.razorpay_key_secret),
    keyId: settings.razorpay_key_id || null,
  });
});

// Fee breakdown shown before paying: what the donor is charged so the association receives `amount`
router.get('/quote', (req, res) => {
  const amount = Number(req.query.amount);
  if (!(amount > 0) || amount > MAX_AMOUNT) return res.status(400).json({ error: 'A valid amount is required' });
  res.json(computeCheckout(amount));
});

router.get('/qr', async (req, res) => {
  try {
    const result = await buildUpiQr(Number(req.query.amount), req.query.note);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/order', async (req, res) => {
  const client = getRazorpayClient();
  if (!client) {
    return res.status(400).json({ error: 'Online payments are not configured yet. Please use the UPI QR code instead.' });
  }
  const { donor_name, donor_email, donor_phone, amount, purpose } = req.body || {};
  const name = clean(donor_name, 120);
  if (!name) return res.status(400).json({ error: 'Your name is required' });
  if (!amount || Number(amount) <= 0 || Number(amount) > MAX_AMOUNT) {
    return res.status(400).json({ error: 'A valid amount is required' });
  }

  const checkout = computeCheckout(Number(amount));
  const amountPaise = checkout.totalPaise;
  try {
    // the donor details travel in the order notes; /verify reads them back from Razorpay
    const order = await client.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `donation_${Date.now()}`,
      notes: {
        donor_name: name,
        donation_amount: String(checkout.net), // the donation itself; the order total also covers the gateway charges
        donor_email: clean(donor_email, 160),
        donor_phone: clean(donor_phone, 32),
        purpose: clean(purpose, 200),
      },
    });
    const settings = getGatewaySettings();
    res.json({
      orderId: order.id,
      checkout,
      amount: amountPaise,
      currency: order.currency,
      keyId: settings.razorpay_key_id,
      payeeName: settings.payee_name || 'Sri Balamurugan Nagar Welfare Association',
    });
  } catch (err) {
    console.error('Razorpay order creation failed (public donation):', err.error || err.message || err);
    res.status(502).json({ error: 'Could not reach Razorpay to create the order. Please try the UPI QR code instead.' });
  }
});

router.post('/verify', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  const settings = getGatewaySettings();
  const client = getRazorpayClient();
  if (!client) return res.status(400).json({ error: 'Online payments are not configured' });

  if (!verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, settings.razorpay_key_secret)) {
    return res.status(400).json({ error: 'Payment signature verification failed' });
  }

  // already recorded (e.g. the verify call was retried)
  const existing = db.prepare('SELECT id FROM donations WHERE razorpay_payment_id = ?').get(razorpay_payment_id);
  if (existing) return res.json({ ok: true });

  let order;
  try {
    order = await client.orders.fetch(razorpay_order_id);
  } catch (err) {
    console.error('Razorpay order fetch failed (public donation):', err.error || err.message || err);
    return res.status(502).json({ error: 'Payment was received but could not be confirmed yet. Please contact a core member.' });
  }
  const notes = order.notes || {};
  const name = clean(notes.donor_name, 120) || 'Well-wisher';
  // the order total includes the gateway charges the donor covered; the donation is the base amount
  const amount = Number(notes.donation_amount) > 0 ? Number(notes.donation_amount) : Number(order.amount) / 100;

  const info = db
    .prepare(
      `INSERT INTO donations (donor_name, donor_email, donor_phone, amount, purpose, status, gateway_status, source, razorpay_order_id, razorpay_payment_id)
       VALUES (?, ?, ?, ?, ?, 'pending', 'unsettled', 'public', ?, ?)`
    )
    .run(
      name,
      clean(notes.donor_email, 160) || null,
      clean(notes.donor_phone, 32) || null,
      amount,
      clean(notes.purpose, 200) || null,
      razorpay_order_id,
      razorpay_payment_id
    );
  const donation = db.prepare('SELECT * FROM donations WHERE id = ?').get(info.lastInsertRowid);

  notifyDonationWhatsApp(donation);
  logActivity({
    actor: 'public',
    action: 'payment',
    entityType: 'donation',
    entityId: donation.id,
    description: `${donation.donor_name} paid ₹${donation.amount} donation online${donation.purpose ? ` for ${donation.purpose}` : ''} - settlement pending`,
  });
  res.json({ ok: true });
});

module.exports = router;
