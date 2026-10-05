const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const whatsapp = require('../utils/whatsappClient');
const { signOff } = require('../utils/memberNotify');
const db = require('../db');

const router = express.Router();

// The Reminder Schedule "Active" toggle in General Settings is a global kill switch for all
// outbound WhatsApp sends from the admin UI, not just the automated monthly-dues reminders.
function remindersEnabled() {
  const row = db.prepare('SELECT reminder_enabled FROM general_settings WHERE id = 1').get();
  return !!row?.reminder_enabled;
}

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
  if (!remindersEnabled()) {
    return res.status(400).json({ error: 'Reminder Schedule is set to Inactive in General Settings - turn it on to send WhatsApp messages' });
  }
  const phone = (req.body?.phone || '').trim();
  if (!phone) return res.status(400).json({ error: 'Enter a phone number' });
  try {
    await whatsapp.sendMessage(phone, `This is a test message from your SBMN app. If you received this, WhatsApp reminders are working correctly.\n\n${signOff()}`);
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

// Sends an ad-hoc message to either a specific WhatsApp group or a specific member, from the
// Send WhatsApp Message admin page - distinct from the automated monthly-dues reminders.
router.post('/send', requireAuth, requireAdmin, async (req, res) => {
  if (!remindersEnabled()) {
    return res.status(400).json({ error: 'Reminder Schedule is set to Inactive in General Settings - turn it on to send WhatsApp messages' });
  }
  const { target, groupId, memberId, text } = req.body || {};
  const message = (text || '').trim();
  if (!message) return res.status(400).json({ error: 'Enter a message' });

  try {
    if (target === 'group') {
      if (!groupId) return res.status(400).json({ error: 'Select a group' });
      await whatsapp.sendToGroup(groupId, message);
    } else if (target === 'member') {
      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
      if (!member) return res.status(404).json({ error: 'Member not found' });
      if (member.status !== 'active') return res.status(400).json({ error: 'This member is not active' });
      if (!member.phone) return res.status(400).json({ error: 'This member has no phone number on file' });
      await whatsapp.sendMessage(member.phone, message);
    } else {
      return res.status(400).json({ error: 'Choose a group or a member to send to' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
