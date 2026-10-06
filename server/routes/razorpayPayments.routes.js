const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const { getGatewaySettings, getRazorpayClient, verifySignature } = require('../utils/razorpay');
const { notifyAdminOfPayment, notifyPaymentWhatsApp } = require('../utils/paymentNotify');

const router = express.Router();

function loadDue(paymentId, user) {
  const due = db.prepare('SELECT * FROM maintenance_payments WHERE id = ?').get(paymentId);
  if (!due) return { error: 404, message: 'Due record not found' };
  if (!['admin', 'super_admin'].includes(user.role) && due.member_id !== user.member_id) {
    return { error: 403, message: 'You can only pay your own dues' };
  }
  if (due.status === 'paid') {
    return { error: 400, message: 'This due is already fully paid' };
  }
  return { due };
}

// Accepts payment_ids (several dues paid in one go) or the older single payment_id
function loadDues(body, user) {
  const raw = Array.isArray(body.payment_ids) ? body.payment_ids : body.payment_id ? [body.payment_id] : [];
  const ids = [...new Set(raw.map(Number).filter(Boolean))];
  if (!ids.length) return { error: 400, message: 'payment_id is required' };
  const dues = [];
  for (const id of ids) {
    const { due, error, message } = loadDue(id, user);
    if (error) return { error, message };
    dues.push(due);
  }
  if (new Set(dues.map((d) => d.member_id)).size > 1) {
    return { error: 400, message: 'Dues for different members cannot be paid together' };
  }
  return { dues };
}

router.get('/config', requireAuth, (req, res) => {
  const settings = getGatewaySettings();
  res.json({
    configured: !!(settings.razorpay_key_id && settings.razorpay_key_secret),
    keyId: settings.razorpay_key_id || null,
  });
});

router.post('/order', requireAuth, async (req, res) => {
  const client = getRazorpayClient();
  if (!client) {
    return res.status(400).json({ error: 'Online payments are not configured yet. Ask an admin to set up Razorpay in Payment Settings.' });
  }

  const { dues, error, message } = loadDues(req.body || {}, req.user);
  if (error) return res.status(error).json({ error: message });

  const remaining = dues.reduce((sum, d) => sum + (Number(d.amount_due) - Number(d.amount_paid)), 0);
  const amountPaise = Math.round(remaining * 100);

  try {
    const order = await client.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `due_${dues[0].id}_x${dues.length}`,
      notes: { maintenance_payment_ids: dues.map((d) => d.id).join(','), member_id: String(dues[0].member_id) },
    });
    const setOrder = db.prepare('UPDATE maintenance_payments SET razorpay_order_id = ? WHERE id = ?');
    dues.forEach((d) => setOrder.run(order.id, d.id));
    const settings = getGatewaySettings();
    res.json({
      orderId: order.id,
      amount: amountPaise,
      currency: order.currency,
      keyId: settings.razorpay_key_id,
      payeeName: settings.payee_name || 'Sri Balamurugan Nagar Welfare Association',
    });
  } catch (err) {
    console.error('Razorpay order creation failed (maintenance due):', err.error || err.message || err);
    res.status(502).json({ error: 'Could not reach Razorpay to create the order. Check the API keys in Payment Settings.' });
  }
});

router.post('/verify', requireAuth, (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  const settings = getGatewaySettings();
  if (!settings.razorpay_key_secret) {
    return res.status(400).json({ error: 'Online payments are not configured' });
  }

  const { dues, error, message } = loadDues(req.body || {}, req.user);
  if (error) return res.status(error).json({ error: message });

  if (dues.some((d) => d.razorpay_order_id !== razorpay_order_id)) {
    return res.status(400).json({ error: 'Order does not match this due' });
  }

  if (!verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, settings.razorpay_key_secret)) {
    return res.status(400).json({ error: 'Payment signature verification failed' });
  }

  const markPaid = db.prepare(
    `UPDATE maintenance_payments
     SET amount_paid = amount_due, status = 'paid', paid_date = date('now'), paid_at = datetime('now'), razorpay_payment_id = ?,
         payment_mode = 'Razorpay', reference_no = ?
     WHERE id = ?`
  );
  const updatedDues = db.transaction(() =>
    dues.map((d) => {
      markPaid.run(razorpay_payment_id, razorpay_payment_id, d.id);
      return db.prepare('SELECT * FROM maintenance_payments WHERE id = ?').get(d.id);
    })
  )();

  const member = db.prepare('SELECT name, site_no FROM members WHERE id = ?').get(updatedDues[0].member_id);
  updatedDues.forEach((updated) => {
    notifyAdminOfPayment(updated);
    logActivity({
      actor: req.user?.username,
      action: 'payment',
      entityType: 'maintenance_payment',
      entityId: updated.id,
      description: `${member?.name || 'Member'} (Site No ${member?.site_no || '-'}) paid ₹${updated.amount_paid} online for ${updated.month}/${updated.year}`,
    });
  });
  notifyPaymentWhatsApp(updatedDues);
  res.json({ ok: true, payments: updatedDues, payment: updatedDues[0] });
});

module.exports = router;
