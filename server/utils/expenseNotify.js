const db = require('../db');
const whatsapp = require('./whatsappClient');
const { signOff } = require('./memberNotify');

function expenseMessage(expense) {
  const amount = Number(expense.amount).toLocaleString('en-IN');
  const dateText = new Date(expense.expense_date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const categoryBit = expense.category ? ` (${expense.category})` : '';
  return `New expense recorded: *${expense.title}*${categoryBit} - ₹${amount} on ${dateText}.\n\n${signOff()}`;
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

// Notifies every active core member and every super admin over WhatsApp whenever an expense is
// recorded (bank or petty cash). Never throws - a notification failure must not break the expense
// create request that triggered it. Silently does nothing if WhatsApp isn't linked.
async function notifyExpenseAdded(expense) {
  try {
    if (!whatsapp.isConnected()) return;
    const phones = new Set([...activeCoreMemberPhones(), ...superAdminPhones()]);
    if (!phones.size) return;

    const text = expenseMessage(expense);
    for (const phone of phones) {
      whatsapp.sendMessage(phone, text).catch((err) => console.error('Expense WhatsApp notification failed:', err.message));
    }
  } catch (err) {
    console.error('Expense WhatsApp notification failed:', err.message);
  }
}

module.exports = { notifyExpenseAdded };
