const db = require('../db');
const { sendMail, isConfigured } = require('./mailer');

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Emails the association's contact address whenever a maintenance due gets a payment recorded
// against it (full or partial), by any path: manual entry, Razorpay from the portal, or the
// public pay-maintenance page. Never throws - a notification failure must not break the payment.
async function notifyAdminOfPayment(due) {
  try {
    if (!isConfigured()) return;
    const settings = db.prepare('SELECT contact_email FROM general_settings WHERE id = 1').get();
    const to = settings?.contact_email;
    if (!to) return;

    const member = db.prepare('SELECT name, site_no FROM members WHERE id = ?').get(due.member_id);
    const html = `
      <p>A maintenance payment was recorded.</p>
      <table cellpadding="4">
        <tr><td><strong>Member</strong></td><td>${member?.name || 'Unknown'} (Site No ${member?.site_no || '-'})</td></tr>
        <tr><td><strong>Month</strong></td><td>${MONTH_NAMES[due.month]} ${due.year}</td></tr>
        <tr><td><strong>Amount Paid</strong></td><td>₹${due.amount_paid} of ₹${due.amount_due}</td></tr>
        <tr><td><strong>Status</strong></td><td>${due.status}</td></tr>
        <tr><td><strong>Mode</strong></td><td>${due.payment_mode || '-'}</td></tr>
        <tr><td><strong>Reference</strong></td><td>${due.reference_no || '-'}</td></tr>
        <tr><td><strong>Paid Date</strong></td><td>${due.paid_date || '-'}</td></tr>
      </table>
    `;
    await sendMail({ to, subject: `Maintenance payment received - ${member?.name || 'member'}`, html });
  } catch (err) {
    console.error('Payment notification email failed:', err.message);
  }
}

module.exports = { notifyAdminOfPayment };
