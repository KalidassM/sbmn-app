const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const SELECT_JOIN = `
  SELECT d.*, m.name AS member_name, e.title AS event_title
  FROM donations d
  LEFT JOIN members m ON m.id = d.member_id
  LEFT JOIN events e ON e.id = d.event_id
`;

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`${SELECT_JOIN} ORDER BY d.donation_date DESC`).all();
  res.json(rows);
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { member_id, donor_name, amount, donation_date, purpose, event_id } = req.body || {};
  if (amount === undefined || (!member_id && !donor_name)) {
    return res.status(400).json({ error: 'amount and either member_id or donor_name are required' });
  }
  const info = db
    .prepare(
      `INSERT INTO donations (member_id, donor_name, amount, donation_date, purpose, event_id)
       VALUES (?, ?, ?, COALESCE(?, date('now')), ?, ?)`
    )
    .run(member_id || null, donor_name || null, amount, donation_date || null, purpose || null, event_id || null);
  const row = db.prepare(`${SELECT_JOIN} WHERE d.id = ?`).get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM donations WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Donation not found' });
  const { member_id, donor_name, amount, donation_date, purpose, event_id } = req.body || {};
  db.prepare(
    `UPDATE donations SET member_id = ?, donor_name = ?, amount = ?, donation_date = ?, purpose = ?, event_id = ?
     WHERE id = ?`
  ).run(
    member_id !== undefined ? member_id : existing.member_id,
    donor_name !== undefined ? donor_name : existing.donor_name,
    amount ?? existing.amount,
    donation_date ?? existing.donation_date,
    purpose ?? existing.purpose,
    event_id !== undefined ? event_id : existing.event_id,
    req.params.id
  );
  const row = db.prepare(`${SELECT_JOIN} WHERE d.id = ?`).get(req.params.id);
  res.json(row);
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM donations WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Donation not found' });
  db.prepare('DELETE FROM donations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
