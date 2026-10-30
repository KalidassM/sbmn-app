const express = require('express');
const { requireAuth, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const whatsapp = require('../utils/whatsappClient');
const { signOff } = require('../utils/memberNotify');
const db = require('../db');
const { firstPhoneDigits } = require('../utils/phone');
const { transliterate, translate } = require('../utils/tamil');

const router = express.Router();

// Polled by the General Settings page while the admin links their WhatsApp account - returns a QR
// code to scan (Linked Devices) until status flips to 'connected'.
router.get('/status', requireAuth, requireAdmin, async (req, res) => {
  const status = whatsapp.getStatus();
  const qr = status === 'qr' ? await whatsapp.getQrDataUrl() : null;
  res.json({ status, qr });
});

// Unlinks the current session so a fresh QR code can be scanned (e.g. to link a different phone).
router.post('/logout', requireAuth, requireAdmin, (req, res) => {
  whatsapp.logout();
  whatsapp.connect().catch((err) => console.error('WhatsApp reconnect after logout failed:', err.message));
  res.json({ ok: true });
});

// Sends a single one-off message to a phone number of the admin's choosing - lets them confirm
// delivery actually works before the automatic monthly-dues reminder ever touches real members.
router.post('/test', requireAuth, requireAdmin, async (req, res) => {
  const phone = (req.body?.phone || '').trim();
  if (!phone) return res.status(400).json({ error: 'Enter a phone number' });
  try {
    await whatsapp.sendMessage(phone, `🧪 *Test message*\n\nThis is a test message from your SBMN app. If you received this, WhatsApp reminders are working correctly. ✅\n\n${signOff()}`, { banner: 'test' });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Groups the linked WhatsApp account belongs to - populates the group picker on the Send Message page.
router.get('/groups', requireAuth, requireAdmin, async (req, res) => {
  try {
    const groups = await whatsapp.listGroups();
    res.json(groups);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Appends "Regards," plus the sender: super admins sign with their own member name (or as a core member they pick; just the association name if no member is linked),
// core members as their name and current designation. Other admins without a core-member role get
// just their member name. A message containing Tamil is signed in Tamil: the saved Tamil name/
// designation if set, else converted automatically (English if that fails). English messages are
// signed in English.
const TAMIL = /[\u0B80-\u0BFF]/;

async function withRegards(text, user, signAs) {
  const cmSelect = `SELECT m.name, cm.name_ta, cm.designation, cm.designation_ta
    FROM core_members cm JOIN members m ON m.id = cm.member_id`;
  let row = null;
  // member_id in the login token goes stale if the account is linked/unlinked later, so read it fresh
  const memberId = db.prepare('SELECT member_id FROM users WHERE id = ?').get(user.id)?.member_id || null;
  if (user.role === 'super_admin') {
    if (signAs) row = db.prepare(`${cmSelect} WHERE cm.id = ? AND cm.end_date IS NULL`).get(signAs);
    // otherwise sign with the super admin's own member name, "Admin" only if none is linked
    if (!row && memberId) row = db.prepare('SELECT name FROM members WHERE id = ?').get(memberId);
  } else if (memberId) {
    row =
      db.prepare(`${cmSelect} WHERE cm.member_id = ? AND cm.end_date IS NULL ORDER BY cm.start_date DESC LIMIT 1`).get(memberId) ||
      db.prepare('SELECT name FROM members WHERE id = ?').get(memberId);
  }
  const tamil = TAMIL.test(text);
  let who = `*${tamil ? 'நிர்வாகி' : 'Admin'}*`;
  if (row) {
    // saved Tamil value first, then an automatic conversion, then the English as entered
    let name = row.name;
    let designation = row.designation;
    if (tamil) {
      name = row.name_ta || (await transliterate(row.name)) || row.name;
      if (row.designation) designation = row.designation_ta || (await translate(row.designation)) || row.designation;
    }
    who = designation ? `*${name},*\n*${designation},*` : `*${name},*`;
  }
  const sig = `${tamil ? 'அன்புடன்,' : 'Regards,'}\n${who}`;
  const ass_text =`*${tamil ? 'ஸ்ரீ பாலமுருகன் நகர் குடியிருப்போர் நலச்சங்கம்' : 'Sri Balamurugan Nagar Welfare Association'}*`;
  // A super admin with no linked member and no core member picked has no name to sign with: just the association.
  if (!row && user.role === 'super_admin') return text ? `${text}\n\n${ass_text}` : ass_text;
  return text ? `${text}\n\n${sig}\n${ass_text}` : `${sig}\n${ass_text}`;
}

// Returns the exact text that /send would deliver (body plus the Regards signature) so the admin
// can review it before confirming.
router.post('/preview', requireAuth, requireAdmin, async (req, res) => {
  const { text, signAs } = req.body || {};
  res.json({ message: await withRegards((text || '').trim(), req.user, signAs) });
});

// Sends an ad-hoc message to either a specific WhatsApp group or a specific member, from the
// Send WhatsApp Message admin page - distinct from the automated monthly-dues reminders.
router.post('/send', requireAuth, requireAdmin, async (req, res) => {
  const { target, groupId, groupName, memberId, guestName, guestPhone, text, image: imageData, signAs } = req.body || {};
  const body = (text || '').trim();
  let image;
  if (imageData) {
    const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(imageData);
    if (!m) return res.status(400).json({ error: 'Attach a JPG, PNG or WebP image' });
    image = Buffer.from(m[1], 'base64');
  }
  if (!body && !image) return res.status(400).json({ error: 'Enter a message' });
  const message = await withRegards(body, req.user, signAs);

  let recipientName;
  let recipientRef;
  try {
    if (target === 'group') {
      if (!groupId) return res.status(400).json({ error: 'Select a group' });
      await whatsapp.sendToGroup(groupId, message, { image });
      recipientName = String(groupName || 'WhatsApp group').slice(0, 200);
      recipientRef = String(groupId);
    } else if (target === 'member') {
      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
      if (!member) return res.status(404).json({ error: 'Member not found' });
      if (member.status !== 'active') return res.status(400).json({ error: 'This member is not active' });
      if (!member.phone) return res.status(400).json({ error: 'This member has no phone number on file' });
      await whatsapp.sendMessage(member.phone, message, { image });
      recipientName = member.name;
      recipientRef = String(member.id);
    } else if (target === 'guest') {
      const digits = firstPhoneDigits(guestPhone);
      if (!digits) return res.status(400).json({ error: 'Enter a valid 10-digit phone number for the guest' });
      await whatsapp.sendMessage(digits, message, { image });
      recipientName = String(guestName || '').trim().slice(0, 200) || `Guest (${digits})`;
      recipientRef = digits;
    } else {
      return res.status(400).json({ error: 'Choose a group, a member or a guest to send to' });
    }
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
  // The message has already gone out, so a history-logging failure must not turn it into an error.
  try {
    db.prepare(
      'INSERT INTO whatsapp_sent_messages (target, recipient_name, recipient_ref, message, has_image, sent_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(target, recipientName, recipientRef, message, image ? 1 : 0, req.user.username || null);
  } catch (err) {
    console.error('Saving WhatsApp message history failed:', err.message);
  }
  res.json({ ok: true });
});

// History of messages sent from the Send WhatsApp page (individual and group), newest first.
router.get('/history', requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare('SELECT id, target, recipient_name, message, has_image, sent_by, sent_at FROM whatsapp_sent_messages ORDER BY id DESC LIMIT 200')
    .all();
  res.json(rows);
});

router.delete('/history/:id', requireAuth, requireSuperAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM whatsapp_sent_messages WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Message not found' });
  res.json({ ok: true });
});

module.exports = router;
