const db = require('../db');
const whatsapp = require('./whatsappClient');
const { signOff } = require('./memberNotify');

function formatAmount(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pettyCashBalance() {
  const sum = (type) =>
    db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM petty_cash_transactions WHERE type = ?').get(type).s;
  return sum('topup') - sum('expense');
}

function expenseMessage(expense, actor) {
  const fromPettyCash = expense.source === 'petty_cash';
  const lines = [
    `*New ${fromPettyCash ? 'Petty Cash Expense' : 'Bank Expense'} Recorded*`,
    `Title: ${expense.title}`,
    expense.category ? `Category: ${expense.category}` : null,
    `Amount: ${formatAmount(expense.amount)}`,
    `Date: ${formatDate(expense.expense_date)}`,
    `Paid from: ${fromPettyCash ? 'Petty cash' : 'Bank'}`,
    expense.notes && !fromPettyCash ? `Notes: ${expense.notes}` : null,
    fromPettyCash ? `Petty cash balance: ${formatAmount(pettyCashBalance())}` : null,
    actor ? `Recorded by: ${actor}` : null,
  ].filter(Boolean);
  return `${lines.join('\n')}\n\n${signOff()}`;
}

function topupMessage(txn, actor) {
  const lines = [
    '*New Petty Cash Top-up Recorded*',
    `Amount: ${formatAmount(txn.amount)}`,
    `Date: ${formatDate(txn.txn_date)}`,
    `Details: ${txn.description}`,
    txn.category ? `Category: ${txn.category}` : null,
    `Petty cash balance: ${formatAmount(pettyCashBalance())}`,
    actor ? `Recorded by: ${actor}` : null,
  ].filter(Boolean);
  return `${lines.join('\n')}\n\n${signOff()}`;
}

function activeCoreMemberPhones() {
  return db
    .prepare(
      `SELECT m.phone FROM core_members cm
       JOIN members m ON m.id = cm.member_id
       WHERE cm.end_date IS NULL AND m.status = 'active'`
    )
    .all()
    .map((r) => r.phone)
    .filter(Boolean);
}

// A super admin's WhatsApp number: their linked member's phone, or - for accounts created without
// a member link (e.g. the default admin) - the username itself if it looks like a phone number,
// matching the "username = phone number" convention used elsewhere in this app.
function superAdminPhones() {
  return db
    .prepare(
      `SELECT u.username, m.phone AS member_phone FROM users u
       LEFT JOIN members m ON m.id = u.member_id
       WHERE u.role = 'super_admin'`
    )
    .all()
    .map((u) => u.member_phone || (/^\d{10}$/.test(u.username) ? u.username : null))
    .filter(Boolean);
}

// Sends a WhatsApp message to every active core member and every super admin. Never throws -
// a notification failure must not break the request that triggered it. Silently does nothing if
// WhatsApp isn't linked.
async function broadcast(text, label) {
  try {
    if (!whatsapp.isConnected()) return;
    const phones = new Set([...activeCoreMemberPhones(), ...superAdminPhones()]);
    for (const phone of phones) {
      whatsapp.sendMessage(phone, text).catch((err) => console.error(`${label} WhatsApp notification failed:`, err.message));
    }
  } catch (err) {
    console.error(`${label} WhatsApp notification failed:`, err.message);
  }
}

// Called whenever an expense is recorded (bank or petty cash).
function notifyExpenseAdded(expense, actor) {
  return broadcast(expenseMessage(expense, actor), 'Expense');
}

// Called whenever money is added to the petty cash box.
function notifyPettyCashTopup(txn, actor) {
  return broadcast(topupMessage(txn, actor), 'Petty cash top-up');
}

module.exports = { notifyExpenseAdded, notifyPettyCashTopup };
