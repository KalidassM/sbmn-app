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
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, generateWAMessageFromContent, prepareWAMessageMedia, proto } = require('@whiskeysockets/baileys');
const db = require('../db');
const { sendMail, isConfigured: isEmailConfigured } = require('./mailer');
const { baseUrl } = require('./appUrl');

// Stored next to the sqlite DB so it survives redeploys on whatever volume already persists data.sqlite
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data.sqlite');
const AUTH_DIR = path.join(path.dirname(DB_PATH), 'whatsapp-auth');

let sock = null;
let status = 'disconnected'; // 'disconnected' | 'connecting' | 'qr' | 'connected'
let latestQr = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let outageAlerted = false; // true once a "disconnected" email went out for the current outage
const MAX_RECONNECT_DELAY_MS = 5 * 60 * 1000;

// Recently sent messages, kept in memory so Baileys can re-send one when the recipient's phone
// asks for it (it does so after failing to decrypt - otherwise the recipient is stuck on
// "Waiting for this message. This may take a while"). Bounded so it can't grow forever.
const sentMessages = new Map();
const MAX_SENT_MESSAGES = 500;

function rememberSent(sent) {
  if (!sent?.key?.id || !sent.message) return;
  sentMessages.set(sent.key.id, sent.message);
  if (sentMessages.size > MAX_SENT_MESSAGES) sentMessages.delete(sentMessages.keys().next().value);
}

// Outgoing messages are sent one at a time with a short gap. Firing a burst to many numbers at
// once (e.g. notifying every core member) makes encryption-session setup fail more often.
const SEND_GAP_MS = 1500;
let sendQueue = Promise.resolve();

function enqueueSend(task) {
  const run = sendQueue.then(task);
  sendQueue = run.catch(() => {}).then(() => new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS)));
  return run;
}

// Emails the association's contact address the moment the linked WhatsApp session drops - the
// admin might otherwise only find out because reminders/notifications quietly stopped going out.
// Never throws, and is only called once per outage (see call sites below), not on every retry.
async function notifyAdminOfDisconnect(reason) {
  try {
    if (!isEmailConfigured()) return;
    const settings = db.prepare('SELECT contact_email, app_name FROM general_settings WHERE id = 1').get();
    const to = settings?.contact_email;
    if (!to) return;
    const appName = settings?.app_name || 'the Association';
    await sendMail({
      to,
      subject: `${appName} - WhatsApp disconnected in ${baseUrl()}`,
      html: `<p>The WhatsApp connection used for reminders and notifications on the ${appName} portal has ${reason}.</p>
             <p>Go to General Settings &rarr; WhatsApp Reminders to check the status${
               reason.includes('unlinked') ? ' and re-link it by scanning a new QR code.' : ' - it will keep retrying automatically.'
             }</p>`,
    });
  } catch (err) {
    console.error('WhatsApp disconnect email failed:', err.message);
  }
}

// Emails the association's contact address once the session is back after an outage, so the
// "disconnected" alert above is followed by a clear all-clear. Never throws.
async function notifyAdminOfReconnect() {
  try {
    if (!isEmailConfigured()) return;
    const settings = db.prepare('SELECT contact_email, app_name FROM general_settings WHERE id = 1').get();
    const to = settings?.contact_email;
    if (!to) return;
    const appName = settings?.app_name || 'the Association';
    await sendMail({
      to,
      subject: `${appName} - WhatsApp reconnected in ${baseUrl()}`,
      html: `<p>The WhatsApp connection used for reminders and notifications on the ${appName} portal has reconnected automatically and is working again.</p>
             <p>No action is needed.</p>`,
    });
  } catch (err) {
    console.error('WhatsApp reconnect email failed:', err.message);
  }
}

async function connect() {
  status = 'connecting';
  let sawQr = false;
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    getMessage: async (key) => sentMessages.get(key.id),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = qr;
      status = 'qr';
      sawQr = true;
    }

    if (connection === 'open') {
      latestQr = null;
      status = 'connected';
      reconnectAttempts = 0;
      console.log('WhatsApp linked and connected.');
      if (outageAlerted) {
        outageAlerted = false;
        notifyAdminOfReconnect();
      }
    } else if (connection === 'close') {
      status = 'disconnected';
      latestQr = null;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      if (loggedOut) {
        console.log(`WhatsApp connection closed (${statusCode}). Logged out - clearing session.`);
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        reconnectAttempts = 0;
        outageAlerted = false;
        notifyAdminOfDisconnect('been unlinked (logged out) - a fresh QR code scan is needed');
      } else if (sawQr || statusCode === DisconnectReason.restartRequired) {
        // Not a real outage: an unscanned QR session times out (408) after about a minute, and
        // right after a successful scan WhatsApp asks for a restart (515). Retry quickly with a
        // fresh QR instead of growing the backoff, otherwise the page sits on "Connecting..."
        // for up to 5 minutes between QR codes.
        reconnectAttempts = 0;
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => connect().catch((err) => console.error('WhatsApp reconnect failed:', err.message)), 1000);
      } else {
        // Only alert on the first failure of a new outage, not on every retry - reconnectAttempts
        // is still 0 here the first time (it resets to 0 on a successful connect), so this fires
        // once per outage rather than spamming an email every few seconds while it keeps retrying.
        if (reconnectAttempts === 0) {
          outageAlerted = true;
          notifyAdminOfDisconnect('disconnected unexpectedly and is attempting to reconnect automatically');
        }
        // Exponential backoff (5s, 10s, 20s... capped at 5min) - a fixed 5s retry would hammer
        // WhatsApp's servers indefinitely on a persistent failure (e.g. a temporary rate-limit on
        // repeated device-link attempts), which likely only prolongs the block instead of letting
        // it expire.
        const delay = Math.min(5000 * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
        reconnectAttempts++;
        console.log(`WhatsApp connection closed (${statusCode || 'unknown'}). Retrying in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})...`);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => connect().catch((err) => console.error('WhatsApp reconnect failed:', err.message)), delay);
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

// Every outbound message carries a banner image, with the text as its caption. Each kind of message
// has its own banner in public/assets/banners/<name>.png (welcome, account, reset, test, payment,
// donation, expense, general - generate them with scripts/make-banners.js); a missing one falls back to
// the reminder banner, and a missing/bad image falls back to plain text, so a banner problem never
// stops a message (e.g. a password reset code) from being delivered.
const ASSETS_DIR = path.join(__dirname, '..', '..', 'public', 'assets');
const FALLBACK_BANNER = path.join(ASSETS_DIR, 'reminder-banner.png');
const MAX_CAPTION = 1000;
const bannerCache = new Map();

function readBanner(name) {
  const file = path.join(ASSETS_DIR, 'banners', `${String(name || 'general').replace(/[^a-z-]/gi, '')}.png`);
  if (bannerCache.has(file)) return bannerCache.get(file);
  let image = null;
  for (const candidate of [file, FALLBACK_BANNER]) {
    try {
      image = fs.readFileSync(candidate);
      break;
    } catch (err) {
      /* try the next one */
    }
  }
  if (!image) console.error(`WhatsApp banner "${name}" unreadable, sending without it`);
  bannerCache.set(file, image);
  return image;
}

// WhatsApp trims blank lines, so spacing is made with a line holding one invisible character
// (Braille blank), which it keeps.
// No gap above the text; one invisible-character line below it so the bubble's bottom isn't cramped.
const pad = (t) => `${t}\n\u2800`;

async function sendWithBanner(jid, text, banner, customImage) {
  // an image attached by the sender replaces the banner, and a failure to send it is reported
  // rather than silently downgraded to text
  if (customImage) {
    if (text.length <= MAX_CAPTION) return rememberSent(await sock.sendMessage(jid, { image: customImage, caption: pad(text) }));
    rememberSent(await sock.sendMessage(jid, { image: customImage }));
    return rememberSent(await sock.sendMessage(jid, { text: pad(text) }));
  }
  const image = readBanner(banner);
  if (!image) return rememberSent(await sock.sendMessage(jid, { text: pad(text) }));
  try {
    if (text.length <= MAX_CAPTION) return rememberSent(await sock.sendMessage(jid, { image, caption: pad(text) }));
    // too long for a caption: banner on its own, then the full text
    rememberSent(await sock.sendMessage(jid, { image }));
  } catch (err) {
    console.error('WhatsApp banner message failed, falling back to plain text:', err.message);
  }
  return rememberSent(await sock.sendMessage(jid, { text: pad(text) }));
}

async function sendMessage(phone, text, { banner = 'general', image } = {}) {
  if (!isConnected()) throw new Error('WhatsApp is not connected. Scan the QR code in General Settings.');
  const jids = toWhatsAppJids(phone);
  if (!jids.length) throw new Error('No valid phone number on file');
  for (const jid of jids) {
    await enqueueSend(() => sendWithBanner(jid, text, banner, image));
  }
}

// Sends `text` with a tappable call-to-action button (like the green "Website"/"Pay" button on
// Business messages). Baileys has to build this "interactive" message by hand, and WhatsApp may
// not render it for a non-Business linked account - so if the relay throws we fall back to plain
// text with the link inline. (A silent drop on WhatsApp's side can't be detected from here.)
async function sendMessageWithButton(phone, text, { buttonText, url, imagePath }) {
  if (!isConnected()) throw new Error('WhatsApp is not connected. Scan the QR code in General Settings.');
  const jids = toWhatsAppJids(phone);
  if (!jids.length) throw new Error('No valid phone number on file');
  let image = null;
  if (imagePath) {
    try {
      image = fs.readFileSync(imagePath);
    } catch (err) {
      console.error('WhatsApp banner image unreadable, sending without it:', err.message);
    }
  }
  for (const jid of jids) {
    await enqueueSend(async () => {
      try {
        // Banner shown above the message body, like Business "payment reminder" messages.
        const header = image
          ? { hasMediaAttachment: true, ...(await prepareWAMessageMedia({ image }, { upload: sock.waUploadToServer })) }
          : undefined;
        const msg = generateWAMessageFromContent(
          jid,
          {
            viewOnceMessage: {
              message: {
                messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                interactiveMessage: proto.Message.InteractiveMessage.create({
                  header,
                  body: { text: pad(text) },
                  nativeFlowMessage: {
                    buttons: [{ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: buttonText, url, merchant_url: url }) }],
                  },
                }),
              },
            },
          },
          { userJid: sock.user.id }
        );
        await sock.relayMessage(jid, msg.message, {
          messageId: msg.key.id,
          additionalNodes: [
            { tag: 'biz', attrs: {}, content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }] },
          ],
        });
        rememberSent(msg);
      } catch (err) {
        console.error('WhatsApp button message failed, falling back to plain text:', err.message);
        const plain = text.includes(url) ? text : `${text}\n\n${buttonText}: ${url}`;
        rememberSent(await sock.sendMessage(jid, image ? { image, caption: pad(plain) } : { text: pad(plain) }));
      }
    });
  }
}

// Groups the linked admin account participates in - used to let the admin pick a specific
// WhatsApp group to message from the portal, rather than only individual members.
async function listGroups() {
  if (!isConnected()) throw new Error('WhatsApp is not connected. Scan the QR code in General Settings.');
  const groups = await sock.groupFetchAllParticipating();
  return Object.values(groups)
    .map((g) => ({ id: g.id, name: g.subject }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// groupId is a full "...@g.us" JID, as returned by listGroups() - unlike sendMessage() this
// doesn't go through toWhatsAppJids() since a group JID isn't a phone number.
async function sendToGroup(groupId, text, { banner = 'general', image } = {}) {
  if (!isConnected()) throw new Error('WhatsApp is not connected. Scan the QR code in General Settings.');
  if (!groupId) throw new Error('No group selected');
  await enqueueSend(() => sendWithBanner(groupId, text, banner, image));
}

function logout() {
  if (sock) {
    // sock.logout() is async - a broken/already-invalid connection rejects the returned promise
    // rather than throwing synchronously, so a plain try/catch here would not catch it and the
    // rejection would go unhandled and crash the process. We're clearing the session below
    // regardless of whether the logout message actually made it to WhatsApp's servers.
    sock.logout().catch(() => {});
  }
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  status = 'disconnected';
  latestQr = null;
  reconnectAttempts = 0;
  clearTimeout(reconnectTimer);
}

module.exports = { connect, getStatus, getQrDataUrl, isConnected, sendMessage, sendMessageWithButton, listGroups, sendToGroup, logout };
