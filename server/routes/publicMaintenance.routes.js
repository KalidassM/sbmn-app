const express = require('express');
const db = require('../db');
const { getGatewaySettings, getRazorpayClient, verifySignature } = require('../utils/razorpay');
const { buildUpiQr } = require('../utils/upiQr');

const router = express.Router();

// An exact Site No match is unambiguous; otherwise fall back to a name search (min 3 chars, capped) to avoid scraping the member list
function findMembers(query) {
  const q = (query || '').toString().trim();
  if (!q) return [];
  const bySiteNo = db.prepare('SELECT id, name, site_no FROM members WHERE site_no = ? COLLATE NOCASE').get(q);
  if (bySiteNo) return [bySiteNo];
  if (q.length < 3) return [];
  return db.prepare('SELECT id, name, site_no FROM members WHERE name LIKE ? LIMIT 10').all(`%${q}%`);
}

router.get('/dues', (req, res) => {
  const members = findMembers(req.query.q);
  const results = members.map((m) => {
    const dues = db
      .prepare(
        `SELECT id, month, year, amount_due, amount_paid, status FROM maintenance_payments
         WHERE member_id = ? AND status != 'paid' ORDER BY year, month`
      )
      .all(m.id);
    return { member_id: m.id, name: m.name, site_no: m.site_no, dues };
  });
  res.json(results);
});

function loadPendingDue(dueId) {
  const due = db.prepare('SELECT * FROM maintenance_payments WHERE id = ?').get(dueId);
  if (!due) return { error: 404, message: 'Due record not found' };
  if (due.status === 'paid') return { error: 400, message: 'This due is already fully paid' };
  return { due };
}

router.get('/razorpay-config', (req, res) => {
  const settings = getGatewaySettings();
  res.json({
    configured: !!(settings.razorpay_key_id && settings.razorpay_key_secret),
    keyId: settings.razorpay_key_id || null,
  });
});

router.get('/qr', async (req, res) => {
  try {
    const result = await buildUpiQr(Number(req.query.amount), req.query.note);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/order', async (req, res) => {
  const client = getRazorpayClient();
  if (!client) {
    return res.status(400).json({ error: 'Online payments are not configured yet. Please use the UPI QR code instead.' });
  }
  const { due, error, message } = loadPendingDue(req.params.id);
  if (error) return res.status(error).json({ error: message });

  const remaining = Number(due.amount_due) - Number(due.amount_paid);
  const amountPaise = Math.round(remaining * 100);
  try {
    const order = await client.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `due_${due.id}`,
      notes: { maintenance_payment_id: String(due.id), member_id: String(due.member_id) },
    });
    db.prepare('UPDATE maintenance_payments SET razorpay_order_id = ? WHERE id = ?').run(order.id, due.id);
    const settings = getGatewaySettings();
    res.json({
      orderId: order.id,
      amount: amountPaise,
      currency: order.currency,
      keyId: settings.razorpay_key_id,
      payeeName: settings.payee_name || 'Sri Balamurugan Nagar Welfare Association',
    });
  } catch (err) {
    console.error('Razorpay order creation failed (public maintenance):', err.error || err.message || err);
    res.status(502).json({ error: 'Could not reach Razorpay to create the order. Please try the UPI QR code instead.' });
  }
});

router.post('/:id/verify', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  const settings = getGatewaySettings();
  if (!settings.razorpay_key_secret) {
    return res.status(400).json({ error: 'Online payments are not configured' });
  }

  const { due, error, message } = loadPendingDue(req.params.id);
  if (error) return res.status(error).json({ error: message });

  if (due.razorpay_order_id !== razorpay_order_id) {
    return res.status(400).json({ error: 'Order does not match this due' });
  }
  if (!verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, settings.razorpay_key_secret)) {
    return res.status(400).json({ error: 'Payment signature verification failed' });
  }

  db.prepare(
    `UPDATE maintenance_payments
     SET amount_paid = amount_due, status = 'paid', paid_date = date('now'), razorpay_payment_id = ?
     WHERE id = ?`
  ).run(razorpay_payment_id, due.id);

  res.json({ ok: true });
});

module.exports = router;
