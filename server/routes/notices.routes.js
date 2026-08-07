const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { title, body, pinned } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }
  const info = db
    .prepare('INSERT INTO notices (title, body, pinned) VALUES (?, ?, ?)')
    .run(title.trim().slice(0, 80), body.trim().slice(0, 400), pinned ? 1 : 0);
  const row = db.prepare('SELECT * FROM notices WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM notices WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Notice not found' });
  const { title, body, pinned } = req.body || {};
  db.prepare('UPDATE notices SET title = ?, body = ?, pinned = ? WHERE id = ?').run(
    title !== undefined ? title.trim().slice(0, 80) : existing.title,
    body !== undefined ? body.trim().slice(0, 400) : existing.body,
    pinned !== undefined ? (pinned ? 1 : 0) : existing.pinned,
    req.params.id
  );
  const row = db.prepare('SELECT * FROM notices WHERE id = ?').get(req.params.id);
  res.json(row);
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM notices WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Notice not found' });
  db.prepare('DELETE FROM notices WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
