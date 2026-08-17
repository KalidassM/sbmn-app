const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const { notifyMember, welcomeMessage } = require('../utils/memberNotify');

const router = express.Router();

// Phone numbers are only for admin/super_admin eyes - a plain member can see the directory but
// not everyone's contact number.
function redactPhone(member, req) {
  if (['admin', 'super_admin'].includes(req.user.role)) return member;
  const { phone, ...rest } = member;
  return rest;
}

router.get('/', requireAuth, (req, res) => {
  const members = db.prepare('SELECT * FROM members ORDER BY CAST(site_no AS INTEGER), site_no').all();
  res.json(members.map((m) => redactPhone(m, req)));
});

// Self-service profile - must be registered before GET/PUT /:id, otherwise "me" would be captured
// as an :id value (same route-ordering pitfall as bulk-status below).
router.get('/me', requireAuth, (req, res) => {
  if (!req.user.member_id) return res.json(null);
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.user.member_id);
  res.json(member || null);
});

// Lets a logged-in user update their own contact details. Deliberately narrower than the
// admin-only PUT /:id: no site_no, join_date, status, or inactive_date - those stay
// admin-managed regardless of what the request body contains.
router.put('/me', requireAuth, (req, res) => {
  if (!req.user.member_id) return res.status(400).json({ error: 'No member profile is linked to this account' });
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(req.user.member_id);
  if (!existing) return res.status(404).json({ error: 'Member not found' });
  const { phone, email, address } = req.body || {};
  db.prepare('UPDATE members SET phone = ?, email = ?, address = ? WHERE id = ?').run(
    phone ?? existing.phone,
    email ?? existing.email,
    address ?? existing.address,
    existing.id
  );
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(existing.id);
  logActivity({
    actor: req.user?.username,
    action: 'update',
    entityType: 'member',
    entityId: member.id,
    description: `${member.name} updated their own profile`,
  });
  res.json(member);
});

router.get('/:id', requireAuth, (req, res) => {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json(redactPhone(member, req));
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, site_no, address, phone, email, join_date, status } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const info = db
    .prepare(
      `INSERT INTO members (name, site_no, address, phone, email, join_date, status)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, date('now')), COALESCE(?, 'active'))`
    )
    .run(name, site_no || null, address || null, phone || null, email || null, join_date || null, status || null);
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(info.lastInsertRowid);
  logActivity({
    actor: req.user?.username,
    action: 'create',
    entityType: 'member',
    entityId: member.id,
    description: `Added member ${member.name} (Site No ${member.site_no || '-'})`,
  });
  await notifyMember(member, welcomeMessage(member));
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

  logActivity({
    actor: req.user?.username,
    action: 'bulk_upload',
    entityType: 'member',
    description: `Bulk upload: ${inserted} added, ${updated} updated, ${skipped.length} skipped`,
  });
  res.json({ inserted, updated, skipped });
});

// Must be registered before PUT /:id, otherwise "bulk-status" would be captured as an :id value.
router.put('/bulk-status', requireAuth, requireAdmin, (req, res) => {
  const { ids, status } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array is required' });
  if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'status must be active or inactive' });

  const today = new Date().toISOString().slice(0, 10);
  const getMember = db.prepare('SELECT * FROM members WHERE id = ?');
  const update = db.prepare(
    `UPDATE members SET status = ?, inactive_date = ? WHERE id = ?`
  );
  let updated = 0;
  const changedMembers = [];
  db.transaction((rowIds) => {
    rowIds.forEach((id) => {
      const existing = getMember.get(id);
      if (!existing) return;
      const result = update.run(status, status === 'inactive' ? today : null, id);
      updated += result.changes;
      if (result.changes && existing.status !== status) changedMembers.push(existing);
    });
  })(ids);

  logActivity({
    actor: req.user?.username,
    action: 'status_change',
    entityType: 'member',
    description: `Bulk status change: ${changedMembers.length} member(s) set to ${status} (${changedMembers.map((m) => m.name).join(', ') || 'none'})`,
  });
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
  logActivity({
    actor: req.user?.username,
    action: finalStatus !== existing.status ? 'status_change' : 'update',
    entityType: 'member',
    entityId: member.id,
    description:
      finalStatus !== existing.status
        ? `Set ${member.name} (Site No ${member.site_no || '-'}) to ${finalStatus}`
        : `Updated member ${member.name} (Site No ${member.site_no || '-'})`,
  });
  res.json(member);
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Member not found' });
  db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  logActivity({
    actor: req.user?.username,
    action: 'delete',
    entityType: 'member',
    entityId: existing.id,
    description: `Deleted member ${existing.name} (Site No ${existing.site_no || '-'})`,
  });
  res.json({ ok: true });
});

module.exports = router;
