const crypto = require('crypto');
const express = require('express');
const Razorpay = require('razorpay');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getGatewaySettings() {
  return db.prepare('SELECT razorpay_key_id, razorpay_key_secret, payee_name FROM payment_settings WHERE id = 1').get();
}

function getRazorpayClient() {
  const settings = getGatewaySettings();
  if (!settings.razorpay_key_id || !settings.razorpay_key_secret) return null;
  return new Razorpay({ key_id: settings.razorpay_key_id, key_secret: settings.razorpay_key_secret });
}

function loadDue(paymentId, user) {
  const due = db.prepare('SELECT * FROM maintenance_payments WHERE id = ?').get(paymentId);
  if (!due) return { error: 404, message: 'Due record not found' };
  if (user.role !== 'admin' && due.member_id !== user.member_id) {
    return { error: 403, message: 'You can only pay your own dues' };
  }
  if (due.status === 'paid') {
    return { error: 400, message: 'This due is already fully paid' };
  }
  return { due };
}

router.get('/config', requireAuth, (req, res) => {
  const settings = getGatewaySettings();
  res.json({
    configured: !!(settings.razorpay_key_id && settings.razorpay_key_secret),
    keyId: settings.razorpay_key_id || null,
  });
});

router.post('/order', requireAuth, async (req, res) => {
  const { payment_id } = req.body || {};
  if (!payment_id) return res.status(400).json({ error: 'payment_id is required' });

  const client = getRazorpayClient();
  if (!client) {
    return res.status(400).json({ error: 'Online payments are not configured yet. Ask an admin to set up Razorpay in Payment Settings.' });
  }

  const { due, error, message } = loadDue(payment_id, req.user);
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
    res.status(502).json({ error: 'Could not reach Razorpay to create the order. Check the API keys in Payment Settings.' });
  }
});

router.post('/verify', requireAuth, (req, res) => {
  const { payment_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!payment_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  const settings = getGatewaySettings();
  if (!settings.razorpay_key_secret) {
    return res.status(400).json({ error: 'Online payments are not configured' });
  }

  const { due, error, message } = loadDue(payment_id, req.user);
  if (error) return res.status(error).json({ error: message });

  if (due.razorpay_order_id !== razorpay_order_id) {
    return res.status(400).json({ error: 'Order does not match this due' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', settings.razorpay_key_secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: 'Payment signature verification failed' });
  }

  db.prepare(
    `UPDATE maintenance_payments
     SET amount_paid = amount_due, status = 'paid', paid_date = date('now'), razorpay_payment_id = ?
     WHERE id = ?`
  ).run(razorpay_payment_id, due.id);

  const updated = db.prepare('SELECT * FROM maintenance_payments WHERE id = ?').get(due.id);
  res.json({ ok: true, payment: updated });
});

module.exports = router;
