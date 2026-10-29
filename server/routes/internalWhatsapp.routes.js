// Internal-only HTTP bridge so the sbmn-app-laravel backend (which can't run Baileys itself, since
// shared hosting has no persistent Node process) can drive this app's existing WhatsApp Web session
// over HTTP instead. Guarded by a shared secret rather than the normal admin JWT, since the caller
// is another backend service, not a logged-in browser. Purely additive: the existing JWT-protected
// /api/whatsapp/* admin routes and the automatic reminder loop in index.js are untouched, so this
// app keeps working exactly as before until the Laravel app actually takes over at cutover time.
const express = require('express');
const whatsapp = require('../utils/whatsappClient');

const router = express.Router();

function requireInternalSecret(req, res, next) {
  const expected = process.env.WHATSAPP_BRIDGE_SECRET;
  if (!expected) {
    return res.status(503).json({ ok: false, error: 'WHATSAPP_BRIDGE_SECRET is not configured on this server' });
  }
  if (req.headers['x-internal-secret'] !== expected) {
    return res.status(401).json({ ok: false, error: 'Invalid internal secret' });
  }
  next();
}

router.use(requireInternalSecret);

router.get('/status', async (req, res) => {
  const status = whatsapp.getStatus();
  const qr = status === 'qr' ? await whatsapp.getQrDataUrl() : null;
  res.json({ status, qr });
});

router.post('/send', async (req, res) => {
  const { phone, message } = req.body || {};
  if (!phone || !message) {
    return res.status(400).json({ ok: false, error: 'phone and message are required' });
  }
  try {
    await whatsapp.sendMessage(phone, message);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

router.post('/logout', (req, res) => {
  whatsapp.logout();
  whatsapp.connect().catch((err) => console.error('WhatsApp reconnect after logout failed:', err.message));
  res.json({ ok: true });
});

module.exports = router;
