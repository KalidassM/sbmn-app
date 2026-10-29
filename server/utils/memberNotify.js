const db = require('../db');
const whatsapp = require('./whatsappClient');
const { portalUrl } = require('./appUrl');

function appName() {
  const settings = db.prepare('SELECT app_name FROM general_settings WHERE id = 1').get();
  return settings?.app_name || 'the Association';
}

// Appended to every outbound WhatsApp message as a consistent branded sign-off.
function signOff() {
  return `~ *${appName()}* ~`;
}

// WhatsApp can't set fonts or line height, so message style comes from its formatting marks:
// *bold* for headings/labels, _italic_ for notes, ```monospace``` for values to copy (codes,
// usernames, passwords), and blank lines between sections for breathing room.
const bold = (v) => `*${v}*`;
const mono = (v) => `\`\`\`${v}\`\`\``;
const field = (label, value) => `*${label}:* ${value}`;

function welcomeMessage(member) {
  const siteBit = member.site_no ? ` (Site No ${member.site_no})` : '';
  return `*Welcome, ${member.name}!*\n\nYou've been added as a member of *${appName()}*${siteBit}. We're glad to have you with us.\n\n*Visit the portal:*\n${portalUrl()}\n\n${signOff()}`;
}

// Login details sent when an account is created (single, bulk and core-member flows)
function accountMessage({ name, username, password, coreMember = false }) {
  const intro = coreMember
    ? `You've been added as a Core Member of *${appName()}* with admin portal access.`
    : `Your login account for *${appName()}* has been created.`;
  return `*Hi ${name},*\n\n${intro}\n\n${field('Username', mono(username))}\n${field('Password', mono(password))}\n\nPlease log in and change your password:\n${portalUrl()}\n\n${signOff()}`;
}

// Sends a WhatsApp message to a member via the linked admin session (server/utils/whatsappClient.js).
// Never throws - a notification failure (WhatsApp not linked, no/bad phone on file, etc.) must not
// break the member create/status-change request that triggered it.
async function notifyMember(member, text, banner) {
  try {
    if (!member?.phone) return;
    if (!whatsapp.isConnected()) return;
    await whatsapp.sendMessage(member.phone, text, { banner });
  } catch (err) {
    console.error('Member WhatsApp notification failed:', err.message);
  }
}

module.exports = { notifyMember, welcomeMessage, accountMessage, appName, signOff, bold, mono, field };
