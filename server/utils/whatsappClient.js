// Sends WhatsApp messages by automating a real WhatsApp Web session (via Baileys) instead of the
// official WhatsApp Business API - the association's admin links their own WhatsApp account by
// scanning a QR code once (General Settings), and this process then sends on their behalf.
//
// Note: this is against WhatsApp's Terms of Service for automated/bulk messaging and carries a
// real risk of the linked number being flagged or banned - a deliberate tradeoff to avoid the
// Business API's account-verification and template-approval requirements.

const fs = require('fs');
const path = require('path');
const pino = require('pino');
const QRCode = require('qrcode');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

// Stored next to the sqlite DB so it survives redeploys on whatever volume already persists data.sqlite
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data.sqlite');
const AUTH_DIR = path.join(path.dirname(DB_PATH), 'whatsapp-auth');

let sock = null;
let status = 'disconnected'; // 'disconnected' | 'connecting' | 'qr' | 'connected'
let latestQr = null;
let reconnectTimer = null;

async function connect() {
  status = 'connecting';
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = qr;
      status = 'qr';
    }

    if (connection === 'open') {
      latestQr = null;
      status = 'connected';
      console.log('WhatsApp linked and connected.');
    } else if (connection === 'close') {
      status = 'disconnected';
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log(`WhatsApp connection closed (${statusCode || 'unknown'}).${loggedOut ? ' Logged out - clearing session.' : ' Reconnecting...'}`);
      if (loggedOut) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      } else {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => connect().catch((err) => console.error('WhatsApp reconnect failed:', err.message)), 5000);
      }
    }
  });
}

function getStatus() {
  return status;
}

async function getQrDataUrl() {
  if (!latestQr) return null;
  return QRCode.toDataURL(latestQr);
}

function isConnected() {
  return status === 'connected';
}

function toWhatsAppJids(phone) {
  if (!phone) return [];
  // Some members have more than one number on file (e.g. "9688502997 / 8072006482") -
  // send to every one that looks valid instead of concatenating all the digits together
  const candidates = String(phone).split(/[/,]|\s+(?:or|and)\s+/i);
  const jids = new Set();
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length >= 10) {
      const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
      jids.add(`${withCountryCode}@s.whatsapp.net`);
    }
  }
  return [...jids];
}

async function sendMessage(phone, text) {
  if (!isConnected()) throw new Error('WhatsApp is not connected. Scan the QR code in General Settings.');
  const jids = toWhatsAppJids(phone);
  if (!jids.length) throw new Error('No valid phone number on file');
  for (const jid of jids) {
    await sock.sendMessage(jid, { text });
  }
}

function logout() {
  if (sock) {
    try {
      sock.logout();
    } catch (err) {
      // already disconnected - fine, we're clearing the session below regardless
    }
  }
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  status = 'disconnected';
  latestQr = null;
}

module.exports = { connect, getStatus, getQrDataUrl, isConnected, sendMessage, logout };
