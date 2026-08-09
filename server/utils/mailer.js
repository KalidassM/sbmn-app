const nodemailer = require('nodemailer');
const db = require('../db');

function getSettings() {
  return db.prepare('SELECT smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_email FROM general_settings WHERE id = 1').get();
}

function isConfigured() {
  const s = getSettings();
  return !!(s && s.smtp_host && s.smtp_user && s.smtp_password);
}

async function sendMail({ to, subject, html }) {
  const s = getSettings();
  if (!s || !s.smtp_host || !s.smtp_user || !s.smtp_password) {
    throw new Error('SMTP is not configured yet. Set it up in General Settings.');
  }
  const transporter = nodemailer.createTransport({
    host: s.smtp_host,
    port: s.smtp_port || 587,
    secure: Number(s.smtp_port) === 465,
    auth: { user: s.smtp_user, pass: s.smtp_password },
  });
  await transporter.sendMail({
    from: s.smtp_from_email || s.smtp_user,
    to,
    subject,
    html,
  });
}

module.exports = { sendMail, isConfigured };
