const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireAdmin, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.role, u.member_id, m.name AS member_name, u.created_at
       FROM users u LEFT JOIN members m ON m.id = u.member_id ORDER BY u.username`
    )
    .all();
  res.json(rows);
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role, member_id } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
  if (role === 'super_admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only a Super Admin can create another Super Admin account' });
  }
  const finalRole = ['admin', 'super_admin'].includes(role) ? role : 'member';
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db
      .prepare('INSERT INTO users (username, password_hash, role, member_id) VALUES (?, ?, ?, ?)')
      .run(username, hash, finalRole, member_id || null);
    const row = db.prepare('SELECT id, username, role, member_id FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

router.put('/:id/reset-password', requireAuth, requireSuperAdmin, (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password is required' });
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  if (existing.username === 'admin') return res.status(400).json({ error: 'Cannot delete the default admin account' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
