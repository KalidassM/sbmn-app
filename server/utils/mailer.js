// Sends email via Resend's HTTPS API (https://api.resend.com) rather than raw SMTP - Railway
// blocks outbound SMTP ports (465/587) on the Hobby plan, but a normal HTTPS call is unaffected.

const db = require('../db');

const DEFAULT_FROM = 'onboarding@resend.dev'; // Resend's shared sandbox sender - works with no domain verification

function getSettings() {
  return db.prepare('SELECT resend_api_key, resend_from_email FROM general_settings WHERE id = 1').get();
}

function isConfigured() {
  const s = getSettings();
  return !!(s && s.resend_api_key);
}

async function sendMail({ to, subject, html }) {
  const s = getSettings();
  if (!s || !s.resend_api_key) {
    throw new Error('Email sending is not configured yet. Add a Resend API key in General Settings.');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${s.resend_api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: s.resend_from_email || DEFAULT_FROM,
      to,
      subject,
      html,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || `Resend API request failed (${res.status})`);
  }
  return data;
}

module.exports = { sendMail, isConfigured };
