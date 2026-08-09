const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');

const router = express.Router();

// smtp_password must never leave the server - only expose whether SMTP is set up
function toPublicSettings(row) {
  const { smtp_password, ...safe } = row;
  return { ...safe, smtp_configured: !!(row.smtp_host && row.smtp_user && smtp_password) };
}

router.get('/', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM general_settings WHERE id = 1').get();
  res.json(toPublicSettings(row));
});

router.put('/', requireAuth, requireAdmin, (req, res) => {
  const {
    maintenance_amount,
    opening_bank_balance,
    opening_petty_cash_balance,
    app_name,
    contact_email,
    office_address,
    office_hours,
    phone_number,
    smtp_host,
    smtp_port,
    smtp_user,
    smtp_password,
    smtp_from_email,
  } = req.body || {};
  if (maintenance_amount === undefined || Number(maintenance_amount) <= 0) {
    return res.status(400).json({ error: 'A valid maintenance amount is required' });
  }
  const existing = db.prepare('SELECT * FROM general_settings WHERE id = 1').get();
  db.prepare(
    `UPDATE general_settings SET
       maintenance_amount = ?, opening_bank_balance = ?, opening_petty_cash_balance = ?,
       app_name = ?, contact_email = ?, office_address = ?, office_hours = ?, phone_number = ?,
       smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_password = ?, smtp_from_email = ?,
       updated_at = datetime('now')
     WHERE id = 1`
  ).run(
    Number(maintenance_amount),
    opening_bank_balance !== undefined ? Number(opening_bank_balance) : existing.opening_bank_balance,
    opening_petty_cash_balance !== undefined ? Number(opening_petty_cash_balance) : existing.opening_petty_cash_balance,
    app_name !== undefined ? app_name || null : existing.app_name,
    contact_email !== undefined ? contact_email || null : existing.contact_email,
    office_address !== undefined ? office_address || null : existing.office_address,
    office_hours !== undefined ? office_hours || null : existing.office_hours,
    phone_number !== undefined ? phone_number || null : existing.phone_number,
    smtp_host !== undefined ? smtp_host || null : existing.smtp_host,
    smtp_port !== undefined ? Number(smtp_port) || null : existing.smtp_port,
    smtp_user !== undefined ? smtp_user || null : existing.smtp_user,
    // blank/omitted password keeps the existing one, so admins don't have to re-enter it every save
    smtp_password ? smtp_password : existing.smtp_password,
    smtp_from_email !== undefined ? smtp_from_email || null : existing.smtp_from_email
  );
  const row = db.prepare('SELECT * FROM general_settings WHERE id = 1').get();
  res.json(toPublicSettings(row));
});

router.post('/test-email', requireAuth, requireAdmin, async (req, res) => {
  const settings = db.prepare('SELECT contact_email FROM general_settings WHERE id = 1').get();
  const to = settings?.contact_email;
  if (!to) return res.status(400).json({ error: 'Set a Contact Email in General Settings first' });
  try {
    await sendMail({
      to,
      subject: 'SBMN App - Test Email',
      html: '<p>This is a test email from your SBMN app\'s General Settings. If you received this, SMTP is working correctly.</p>',
    });
    res.json({ ok: true, to });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
