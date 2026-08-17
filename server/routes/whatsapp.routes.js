const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const whatsapp = require('../utils/whatsappClient');
const { signOff } = require('../utils/memberNotify');

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
    await whatsapp.sendMessage(phone, `This is a test message from your SBMN app. If you received this, WhatsApp reminders are working correctly.\n\n${signOff()}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
