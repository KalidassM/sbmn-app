const db = require('../db');
const { sendMail, isConfigured } = require('./mailer');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Emails the association's contact address whenever someone submits the public "Contact Us" form.
// Never throws - a notification failure must not break the form submission that triggered it.
async function notifyAdminOfContactMessage(msg) {
  try {
    if (!isConfigured()) return;
    const settings = db.prepare('SELECT contact_email FROM general_settings WHERE id = 1').get();
    const to = settings?.contact_email;
    if (!to) return;

    const html = `
      <p>A new message was submitted via the Contact Us form.</p>
      <table cellpadding="4">
        <tr><td><strong>Name</strong></td><td>${esc(msg.name)}</td></tr>
        <tr><td><strong>House No</strong></td><td>${esc(msg.house_no || '-')}</td></tr>
        <tr><td><strong>Phone</strong></td><td>${esc(msg.phone)}</td></tr>
        <tr><td><strong>Email</strong></td><td>${esc(msg.email || '-')}</td></tr>
        <tr><td><strong>Type</strong></td><td>${esc(msg.message_type)}</td></tr>
        <tr><td><strong>Message</strong></td><td>${esc(msg.message)}</td></tr>
      </table>
    `;
    await sendMail({ to, subject: `New ${msg.message_type.toLowerCase()} from ${msg.name}`, html });
  } catch (err) {
    console.error('Contact message notification email failed:', err.message);
  }
}

module.exports = { notifyAdminOfContactMessage };
