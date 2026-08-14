const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const members = db.prepare('SELECT * FROM members ORDER BY CAST(site_no AS INTEGER), site_no').all();
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

// Upsert by site_no: rows whose site_no matches an existing member update that member, others are inserted
router.post('/bulk', requireAuth, requireAdmin, (req, res) => {
  const { members } = req.body || {};
  if (!Array.isArray(members) || !members.length) {
    return res.status(400).json({ error: 'members array is required' });
  }

  const insertStmt = db.prepare(
    `INSERT INTO members (name, site_no, address, phone, email, join_date, status)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, date('now')), COALESCE(?, 'active'))`
  );
  const updateStmt = db.prepare(
    `UPDATE members SET name = ?, address = COALESCE(?, address), phone = COALESCE(?, phone), email = COALESCE(?, email),
       join_date = COALESCE(?, join_date), status = COALESCE(?, status)
     WHERE id = ?`
  );
  const findBySiteNo = db.prepare('SELECT id FROM members WHERE site_no = ?');

  let inserted = 0;
  let updated = 0;
  const skipped = [];

  db.transaction((rows) => {
    rows.forEach((row, idx) => {
      const name = (row.name || '').toString().trim();
      const siteNo = (row.site_no || '').toString().trim() || null;
      if (!name) {
        skipped.push({ row: idx + 2, reason: 'Missing name' });
        return;
      }
      const existing = siteNo ? findBySiteNo.get(siteNo) : null;
      if (existing) {
        updateStmt.run(
          name,
          row.address || null,
          row.phone || null,
          row.email || null,
          row.join_date || null,
          row.status || null,
          existing.id
        );
        updated++;
      } else {
        insertStmt.run(name, siteNo, row.address || null, row.phone || null, row.email || null, row.join_date || null, row.status || null);
        inserted++;
      }
    });
  })(members);

  res.json({ inserted, updated, skipped });
});

// Must be registered before PUT /:id, otherwise "bulk-status" would be captured as an :id value.
router.put('/bulk-status', requireAuth, requireAdmin, (req, res) => {
  const { ids, status } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array is required' });
  if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'status must be active or inactive' });

  const today = new Date().toISOString().slice(0, 10);
  const update = db.prepare(
    `UPDATE members SET status = ?, inactive_date = ? WHERE id = ?`
  );
  let updated = 0;
  db.transaction((rowIds) => {
    rowIds.forEach((id) => {
      updated += update.run(status, status === 'inactive' ? today : null, id).changes;
    });
  })(ids);
  res.json({ updated });
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Member not found' });
  const { name, site_no, address, phone, email, join_date, status, inactive_date } = req.body || {};
  const finalStatus = status ?? existing.status;
  let inactiveDate = existing.inactive_date;
  if (finalStatus === 'inactive') {
    if (inactive_date) {
      inactiveDate = inactive_date;
    } else if (existing.status !== 'inactive') {
      inactiveDate = new Date().toISOString().slice(0, 10);
    }
  } else if (finalStatus === 'active') {
    inactiveDate = null;
  }
  db.prepare(
    `UPDATE members SET name = ?, site_no = ?, address = ?, phone = ?, email = ?, join_date = ?, status = ?, inactive_date = ?
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    site_no ?? existing.site_no,
    address ?? existing.address,
    phone ?? existing.phone,
    email ?? existing.email,
    join_date ?? existing.join_date,
    finalStatus,
    inactiveDate,
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
