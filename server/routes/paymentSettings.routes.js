const express = require('express');
const db = require('../db');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { buildUpiQr } = require('../utils/upiQr');
const { logActivity } = require('../utils/activityLog'); 

const router = express.Router();

// razorpay_key_secret must never leave the server — only expose the publishable key_id
function toPublicSettings(row) {
  const { razorpay_key_secret, ...safe } = row;
  return { ...safe, razorpay_configured: !!(row.razorpay_key_id && razorpay_key_secret) };
}

router.get('/', requireAuth, requireSuperAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM payment_settings WHERE id = 1').get();
  res.json(toPublicSettings(row));
});

router.put('/', requireAuth, requireSuperAdmin, (req, res) => {
  const { upi_id, payee_name, bank_name, account_no, ifsc_code, razorpay_key_id, razorpay_key_secret, gateway_fee_percent, gateway_settlement_fee_percent, gateway_gst_percent, gateway_fee_free_until } = req.body || {};
  const existing = db.prepare('SELECT * FROM payment_settings WHERE id = 1').get();
  // optional; blank/omitted keeps the existing rate. Bounded so a typo can't make the fee formula blow up.
  const parseRate = (value, max) => {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : NaN;
  };
  const feePercent = parseRate(gateway_fee_percent, 20);
  const settlementFeePercent = parseRate(gateway_settlement_fee_percent, 5);
  const gstPercent = parseRate(gateway_gst_percent, 50);
  // YYYY-MM-DD, or blank to switch the free offer off; omitted keeps the existing date
  let freeUntil = existing.gateway_fee_free_until || null;
  if (gateway_fee_free_until !== undefined) {
    const value = (gateway_fee_free_until || '').toString().trim();
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return res.status(400).json({ error: 'Free offer end date must be a valid date' });
    freeUntil = value || null;
  }
  if (Number.isNaN(feePercent)) return res.status(400).json({ error: 'Gateway fee must be a number between 0 and 20' });
  if (Number.isNaN(settlementFeePercent)) return res.status(400).json({ error: 'Same-day settlement fee must be a number between 0 and 5' });
  if (Number.isNaN(gstPercent)) return res.status(400).json({ error: 'GST must be a number between 0 and 50' });
  db.prepare(
    `UPDATE payment_settings
     SET upi_id = ?, payee_name = ?, bank_name = ?, account_no = ?, ifsc_code = ?,
         razorpay_key_id = ?, razorpay_key_secret = ?, gateway_fee_percent = ?, gateway_settlement_fee_percent = ?, gateway_gst_percent = ?, gateway_fee_free_until = ?, updated_at = datetime('now')
     WHERE id = 1`
  ).run(
    // each field falls back to its existing value when omitted, so partial saves (e.g. the gateway-keys
    // form, which doesn't send upi_id/bank fields) don't blank out settings saved from another form
    upi_id !== undefined ? upi_id || null : existing.upi_id,
    payee_name !== undefined ? payee_name || null : existing.payee_name,
    bank_name !== undefined ? bank_name || null : existing.bank_name,
    account_no !== undefined ? account_no || null : existing.account_no,
    ifsc_code !== undefined ? ifsc_code || null : existing.ifsc_code,
    razorpay_key_id !== undefined ? razorpay_key_id || null : existing.razorpay_key_id,
    // blank/omitted secret keeps the existing one, so admins don't have to re-enter it every save
    razorpay_key_secret ? razorpay_key_secret : existing.razorpay_key_secret,
    feePercent ?? existing.gateway_fee_percent ?? 2,
    settlementFeePercent ?? existing.gateway_settlement_fee_percent ?? 0,
    gstPercent ?? existing.gateway_gst_percent ?? 18,
    freeUntil
  );
  const row = db.prepare('SELECT * FROM payment_settings WHERE id = 1').get();
  logActivity({
    actor: req.user?.username,
    action: 'update',
    entityType: 'payment_settings',
    description: 'Updated payment settings',
  });
  res.json(toPublicSettings(row));
});

// Builds a UPI deep link for the configured account and renders it as a scannable QR code
router.get('/qr', requireAuth, async (req, res) => {
  try {
    const result = await buildUpiQr(Number(req.query.amount), req.query.note);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
