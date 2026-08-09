const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Monthly maintenance amount setting (one amount per month/year, applied to all active members)
router.get('/settings', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM maintenance_settings ORDER BY year DESC, month DESC').all();
  res.json(rows);
});

router.post('/settings', requireAuth, requireAdmin, (req, res) => {
  const { month, year, amount } = req.body || {};
  if (!month || !year || amount === undefined) {
    return res.status(400).json({ error: 'month, year and amount are required' });
  }
  db.prepare(
    `INSERT INTO maintenance_settings (month, year, amount) VALUES (?, ?, ?)
     ON CONFLICT(month, year) DO UPDATE SET amount = excluded.amount`
  ).run(month, year, amount);
  const row = db.prepare('SELECT * FROM maintenance_settings WHERE month = ? AND year = ?').get(month, year);
  res.json(row);
});

// Generate/refresh due records for every active member for a given month/year using the configured amount
router.post('/generate', requireAuth, requireAdmin, (req, res) => {
  const { month, year } = req.body || {};
  if (!month || !year) return res.status(400).json({ error: 'month and year are required' });
  const setting = db.prepare('SELECT * FROM maintenance_settings WHERE month = ? AND year = ?').get(month, year);
  if (!setting) return res.status(400).json({ error: 'No maintenance amount configured for this month/year yet' });

  const members = db.prepare("SELECT * FROM members WHERE status = 'active'").all();
  const insert = db.prepare(
    `INSERT INTO maintenance_payments (member_id, month, year, amount_due, amount_paid, status)
     VALUES (?, ?, ?, ?, 0, 'unpaid')
     ON CONFLICT(member_id, month, year) DO UPDATE SET amount_due = excluded.amount_due`
  );
  const tx = db.transaction((rows) => {
    for (const m of rows) insert.run(m.id, month, year, setting.amount);
  });
  tx(members);

  const payments = db
    .prepare(
      `SELECT mp.*, m.name AS member_name FROM maintenance_payments mp
       JOIN members m ON m.id = mp.member_id
       WHERE mp.month = ? AND mp.year = ? ORDER BY m.name`
    )
    .all(month, year);
  res.json(payments);
});

router.get('/payments', requireAuth, (req, res) => {
  const { month, year, member_id } = req.query;
  let sql = `SELECT mp.*, m.name AS member_name FROM maintenance_payments mp
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
  const { amount_paid, paid_date, status, payment_mode, reference_no } = req.body || {};
  const finalAmountPaid = amount_paid ?? existing.amount_paid;
  let finalStatus = status;
  if (!finalStatus) {
    if (finalAmountPaid <= 0) finalStatus = 'unpaid';
    else if (finalAmountPaid >= existing.amount_due) finalStatus = 'paid';
    else finalStatus = 'partial';
  }
  db.prepare(
    `UPDATE maintenance_payments SET amount_paid = ?, paid_date = ?, status = ?, payment_mode = ?, reference_no = ? WHERE id = ?`
  ).run(
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

module.exports = router;
