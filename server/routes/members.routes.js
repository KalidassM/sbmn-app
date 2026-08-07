const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const members = db.prepare('SELECT * FROM members ORDER BY name').all();
  res.json(members);
});

router.get('/:id', requireAuth, (req, res) => {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json(member);
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, site_no, address, phone, email, join_date, status } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const info = db
    .prepare(
      `INSERT INTO members (name, site_no, address, phone, email, join_date, status)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, date('now')), COALESCE(?, 'active'))`
    )
    .run(name, site_no || null, address || null, phone || null, email || null, join_date || null, status || null);
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(member);
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Member not found' });
  const { name, site_no, address, phone, email, join_date, status } = req.body || {};
  db.prepare(
    `UPDATE members SET name = ?, site_no = ?, address = ?, phone = ?, email = ?, join_date = ?, status = ?
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    site_no ?? existing.site_no,
    address ?? existing.address,
    phone ?? existing.phone,
    email ?? existing.email,
    join_date ?? existing.join_date,
    status ?? existing.status,
    req.params.id
  );
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  res.json(member);
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Member not found' });
  db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
