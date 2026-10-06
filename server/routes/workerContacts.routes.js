const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');

const router = express.Router();

function clean(body) {
  const { name, mobile, profession } = body || {};
  return {
    name: (name || '').toString().trim().slice(0, 80),
    mobile: (mobile || '').toString().trim().slice(0, 20),
    profession: (profession || '').toString().trim().slice(0, 60),
  };
}

router.get('/', requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM worker_contacts ORDER BY profession COLLATE NOCASE, name COLLATE NOCASE')
    .all();
  res.json(rows);
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, mobile, profession } = clean(req.body);
  if (!name || !mobile || !profession) {
    return res.status(400).json({ error: 'name, mobile and profession are required' });
  }
  const info = db
    .prepare('INSERT INTO worker_contacts (name, mobile, profession) VALUES (?, ?, ?)')
    .run(name, mobile, profession);
  const row = db.prepare('SELECT * FROM worker_contacts WHERE id = ?').get(info.lastInsertRowid);
  logActivity({
    actor: req.user?.username,
    action: 'create',
    entityType: 'worker_contact',
    entityId: row.id,
    description: `Added worker contact ${row.name} (${row.profession})`,
  });
  res.status(201).json(row);
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM worker_contacts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Worker contact not found' });
  const { name, mobile, profession } = clean(req.body);
  if (!name || !mobile || !profession) {
    return res.status(400).json({ error: 'name, mobile and profession are required' });
  }
  db.prepare('UPDATE worker_contacts SET name = ?, mobile = ?, profession = ? WHERE id = ?').run(
    name,
    mobile,
    profession,
    req.params.id
  );
  const row = db.prepare('SELECT * FROM worker_contacts WHERE id = ?').get(req.params.id);
  logActivity({
    actor: req.user?.username,
    action: 'update',
    entityType: 'worker_contact',
    entityId: row.id,
    description: `Updated worker contact ${row.name} (${row.profession})`,
  });
  res.json(row);
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM worker_contacts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Worker contact not found' });
  db.prepare('DELETE FROM worker_contacts WHERE id = ?').run(req.params.id);
  logActivity({
    actor: req.user?.username,
    action: 'delete',
    entityType: 'worker_contact',
    entityId: existing.id,
    description: `Deleted worker contact ${existing.name} (${existing.profession})`,
  });
  res.json({ ok: true });
});

module.exports = router;
