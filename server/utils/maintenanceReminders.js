const db = require('../db');
const { ensureDuesGenerated } = require('./maintenanceDues');
const { sendTemplateMessage, isConfigured } = require('./whatsapp');

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function baseUrl() {
  return (process.env.APP_PUBLIC_URL || 'https://sbmn-app.up.railway.app').replace(/\/$/, '');
}

// Sends a WhatsApp reminder to every member with an unpaid/partial due for the current month.
// Idempotent per calendar month via general_settings.reminders_last_sent, so it's safe to call
// from both the scheduler and the manual "Send Reminders Now" admin action without double-sending.
async function sendMonthlyReminders({ force = false } = {}) {
  if (!isConfigured()) {
    return { skipped: true, notConfigured: true, reason: 'WhatsApp is not configured yet. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.' };
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  const settings = db.prepare('SELECT reminders_last_sent FROM general_settings WHERE id = 1').get();
  if (!force && settings?.reminders_last_sent === monthKey) {
    return { skipped: true, reason: `Reminders already sent for ${monthKey}` };
  }

  ensureDuesGenerated(month, year);

  const dues = db
    .prepare(
      `SELECT mp.id, mp.amount_due, mp.amount_paid, mp.month, mp.year, m.name, m.phone, m.site_no
       FROM maintenance_payments mp
       JOIN members m ON m.id = mp.member_id
       WHERE mp.month = ? AND mp.year = ? AND mp.status != 'paid'`
    )
    .all(month, year);

  const sent = [];
  const failed = [];

  for (const due of dues) {
    const remaining = Number(due.amount_due) - Number(due.amount_paid);
    const link = `${baseUrl()}/pay-monthly-maintenance?q=${encodeURIComponent(due.site_no || due.name)}`;
    try {
      await sendTemplateMessage(due.phone, [due.name, `₹${remaining}`, `${MONTH_NAMES[due.month]} ${due.year}`, link]);
      sent.push({ name: due.name, site_no: due.site_no });
    } catch (err) {
      failed.push({ name: due.name, site_no: due.site_no, error: err.message });
    }
  }

  db.prepare("UPDATE general_settings SET reminders_last_sent = ? WHERE id = 1").run(monthKey);

  return { skipped: false, monthKey, totalDue: dues.length, sent, failed };
}

module.exports = { sendMonthlyReminders, isWhatsAppConfigured: isConfigured };
