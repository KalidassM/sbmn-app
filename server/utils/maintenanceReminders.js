const path = require('path');
const db = require('../db');
const { ensureDuesGenerated } = require('./maintenanceDues');
const whatsapp = require('./whatsappClient');
const { baseUrl } = require('./appUrl');
const { signOff } = require('./memberNotify');

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const BANNER_PATH = path.join(__dirname, '..', '..', 'public', 'assets', 'reminder-banner.png');

const DEFAULT_REMINDER_DAYS = '1,2,3,4,5,7,10';
const DEFAULT_REMINDER_TIME = '10:00';

function nowIST() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day), hour: Number(map.hour), minute: Number(map.minute) };
}

function reminderLink(due) {
  return `${baseUrl()}/p/${encodeURIComponent(due.site_no || due.name)}`;
}

function buildReminderMessage(due) {
  const remaining = Number(due.amount_due) - Number(due.amount_paid);
  return (
    `*Hi ${due.name},*\n\nThis is a reminder that your maintenance due is still pending.\n\n` +
    `*Amount:* ₹${remaining}\n*Month:* ${MONTH_NAMES[due.month]} ${due.year}\n*Site No:* ${due.site_no || '-'}\n\n` +
    `*Tap to pay online:*\n${reminderLink(due)}\n\n` +
    signOff()
  );
}

// The pay link goes out both as a tappable button (phone) and inline in the text, because
// WhatsApp Web/desktop can't render the button and would otherwise show no link at all.
function sendReminder(due) {
  return whatsapp.sendMessageWithButton(due.phone, buildReminderMessage(due), { buttonText: 'Pay Now', url: reminderLink(due), imagePath: BANNER_PATH });
}

// Sends the reminder for one due right now (admin's per-member button). Throws an Error with a
// user-facing message when it can't be sent; records the outcome on the due like the daily run does.
// `err.status` tells the route which HTTP status to use: 400 for a request that can't be sent as
// asked, 503 when WhatsApp isn't linked/connected, 502 when WhatsApp itself failed or timed out.
function reminderError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function sendReminderForPayment(paymentId) {
  if (!whatsapp.isConnected()) throw reminderError('WhatsApp is not connected on this server. Open General Settings and link it (scan the QR code).', 503);
  const due = db
    .prepare(
      `SELECT mp.id, mp.amount_due, mp.amount_paid, mp.month, mp.year, mp.status, mp.gateway_status, m.name, m.phone, m.site_no, m.status AS member_status
       FROM maintenance_payments mp JOIN members m ON m.id = mp.member_id WHERE mp.id = ?`
    )
    .get(paymentId);
  if (!due) throw reminderError('Due record not found', 404);
  if (due.status === 'paid') throw reminderError('This due is already paid', 400);
  if (due.gateway_status === 'unsettled') throw reminderError('This due was paid online and is awaiting bank settlement', 400);
  if (due.member_status !== 'active') throw reminderError('This member is not active', 400);
  if (!due.phone || !due.phone.replace(/\D/g, '')) {
    db.prepare('UPDATE maintenance_payments SET last_reminder_error = ? WHERE id = ?').run('No phone number on file', due.id);
    throw reminderError('No phone number on file for this member', 400);
  }
  try {
    await sendReminder(due);
  } catch (err) {
    db.prepare('UPDATE maintenance_payments SET last_reminder_error = ? WHERE id = ?').run(err.message, due.id);
    console.error(`Reminder to ${due.name} (${due.phone}) failed:`, err.message);
    throw reminderError(`Could not send: ${err.message}. Check that WhatsApp is still linked in General Settings.`, 502);
  }
  db.prepare("UPDATE maintenance_payments SET last_reminder_sent_at = datetime('now'), last_reminder_error = NULL WHERE id = ?").run(due.id);
  return { name: due.name };
}

async function sendDailyReminders({ force = false } = {}) {
  if (!whatsapp.isConnected()) {
    return { skipped: true, reason: 'WhatsApp is not linked yet. Scan the QR code in General Settings.' };
  }

  const settings = db
    .prepare('SELECT reminders_last_sent_date, app_name, reminder_days, reminder_time, reminder_enabled FROM general_settings WHERE id = 1')
    .get();

  if (!force && !settings?.reminder_enabled) {
    return { skipped: true, reason: 'Automatic reminders are turned off in General Settings.' };
  }

  const reminderDays = (settings?.reminder_days || DEFAULT_REMINDER_DAYS)
    .split(',')
    .map((d) => Number(d.trim()))
    .filter((d) => d >= 1 && d <= 31);
  const [reminderHour, reminderMinute] = (settings?.reminder_time || DEFAULT_REMINDER_TIME).split(':').map(Number);

  const { year, month, day, hour, minute } = nowIST();
  if (!force && !reminderDays.includes(day)) {
    return { skipped: true, reason: 'Not a scheduled reminder day' };
  }
  if (!force && hour * 60 + minute < reminderHour * 60 + reminderMinute) {
    return { skipped: true, reason: `Scheduled for ${settings.reminder_time} IST today - not yet time` };
  }

  const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!force && settings?.reminders_last_sent_date === dateKey) {
    return { skipped: true, reason: `Already sent today (${dateKey})` };
  }

  ensureDuesGenerated(month, year);

  const dues = db
    .prepare(
      `SELECT mp.id, mp.amount_due, mp.amount_paid, mp.month, mp.year, m.name, m.phone, m.site_no
       FROM maintenance_payments mp
       JOIN members m ON m.id = mp.member_id
       WHERE mp.month = ? AND mp.year = ? AND mp.status != 'paid' AND mp.gateway_status IS NOT 'unsettled' AND m.status = 'active'`
    )
    .all(month, year);

  const markSent = db.prepare(
    "UPDATE maintenance_payments SET last_reminder_sent_at = datetime('now'), last_reminder_error = NULL WHERE id = ?"
  );
  const markFailed = db.prepare('UPDATE maintenance_payments SET last_reminder_error = ? WHERE id = ?');

  const sent = [];
  const failed = [];
  const skippedNoPhone = [];

  for (const due of dues) {
    if (!due.phone || !due.phone.replace(/\D/g, '')) {
      skippedNoPhone.push(due.name);
      markFailed.run('No phone number on file', due.id);
      continue;
    }
    try {
      await sendReminder(due);
      sent.push(due.name);
      markSent.run(due.id);
    } catch (err) {
      failed.push({ name: due.name, error: err.message });
      markFailed.run(err.message, due.id);
    }
  }

  db.prepare('UPDATE general_settings SET reminders_last_sent_date = ? WHERE id = 1').run(dateKey);

  return { skipped: false, dateKey, totalDue: dues.length, sent, failed, skippedNoPhone };
}

module.exports = { sendDailyReminders, sendReminderForPayment };
