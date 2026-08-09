const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { ensureDuesGenerated } = require('../utils/maintenanceDues');
const { sendMonthlyReminders } = require('../utils/maintenanceReminders');

const router = express.Router();

// Manual trigger for the same reminder logic the 1st-of-month scheduler runs - lets an admin test
// or re-run it without waiting. force:true bypasses the "already sent this month" guard.
router.post('/send-reminders', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await sendMonthlyReminders({ force: !!(req.body && req.body.force) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/payments', requireAuth, (req, res) => {
  const { month, year, member_id } = req.query;
  if (month && year) {
    ensureDuesGenerated(Number(month), Number(year));
  }

  let sql = `SELECT mp.*, m.name AS member_name, m.site_no FROM maintenance_payments mp
             JOIN members m ON m.id = mp.member_id`;
  const clauses = [];
  const params = [];
  if (month) {
    clauses.push('mp.month = ?');
    params.push(Number(month));
  }
  if (year) {
    clauses.push('mp.year = ?');
    params.push(Number(year));
  }
  if (member_id) {
    clauses.push('mp.member_id = ?');
    params.push(Number(member_id));
  }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY mp.year DESC, mp.month DESC, m.name';
  res.json(db.prepare(sql).all(...params));
});

router.put('/payments/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM maintenance_payments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Payment record not found' });
  const { amount_due, amount_paid, paid_date, status, payment_mode, reference_no } = req.body || {};
  const finalAmountDue = amount_due ?? existing.amount_due;
  const finalAmountPaid = amount_paid ?? existing.amount_paid;
  let finalStatus = status;
  if (!finalStatus) {
    if (finalAmountPaid <= 0) finalStatus = 'unpaid';
    else if (finalAmountPaid >= finalAmountDue) finalStatus = 'paid';
    else finalStatus = 'partial';
  }
  db.prepare(
    `UPDATE maintenance_payments SET amount_due = ?, amount_paid = ?, paid_date = ?, status = ?, payment_mode = ?, reference_no = ? WHERE id = ?`
  ).run(
    finalAmountDue,
    finalAmountPaid,
    paid_date ?? (finalStatus === 'paid' ? new Date().toISOString().slice(0, 10) : existing.paid_date),
    finalStatus,
    payment_mode !== undefined ? payment_mode || null : existing.payment_mode,
    reference_no !== undefined ? reference_no || null : existing.reference_no,
    req.params.id
  );
  const row = db.prepare('SELECT * FROM maintenance_payments WHERE id = ?').get(req.params.id);
  res.json(row);
});

router.delete('/payments/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM maintenance_payments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Payment record not found' });
  db.prepare('DELETE FROM maintenance_payments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
