const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const db = new Database(process.env.DB_PATH || path.join(__dirname, '..', 'data.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  site_no TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  join_date TEXT DEFAULT (date('now')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS core_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  designation TEXT NOT NULL,
  start_date TEXT NOT NULL DEFAULT (date('now')),
  end_date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  event_date TEXT NOT NULL,
  venue TEXT,
  budget REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT,
  amount REAL NOT NULL,
  expense_date TEXT NOT NULL DEFAULT (date('now')),
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'bank' CHECK(source IN ('bank','petty_cash')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS petty_cash_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('topup','expense')),
  amount REAL NOT NULL,
  txn_date TEXT NOT NULL DEFAULT (date('now')),
  description TEXT NOT NULL,
  category TEXT,
  expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS maintenance_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  amount REAL NOT NULL,
  UNIQUE(month, year)
);

CREATE TABLE IF NOT EXISTS maintenance_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  amount_due REAL NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  paid_date TEXT,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','paid','partial')),
  UNIQUE(member_id, month, year)
);

CREATE TABLE IF NOT EXISTS donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  donor_name TEXT,
  amount REAL NOT NULL,
  donation_date TEXT NOT NULL DEFAULT (date('now')),
  purpose TEXT,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  house_no TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  upi_id TEXT,
  payee_name TEXT,
  bank_name TEXT,
  account_no TEXT,
  ifsc_code TEXT,
  razorpay_key_id TEXT,
  razorpay_key_secret TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS general_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  maintenance_amount REAL,
  updated_at TEXT DEFAULT (datetime('now'))
);
`);

db.prepare('INSERT OR IGNORE INTO payment_settings (id) VALUES (1)').run();
db.prepare('INSERT OR IGNORE INTO general_settings (id) VALUES (1)').run();

// Migration: opening balances that predate digital tracking (bank account + petty cash box)
const generalSettingsColumns = db.prepare('PRAGMA table_info(general_settings)').all().map((c) => c.name);
if (!generalSettingsColumns.includes('opening_bank_balance')) {
  db.exec('ALTER TABLE general_settings ADD COLUMN opening_bank_balance REAL NOT NULL DEFAULT 0');
}
if (!generalSettingsColumns.includes('opening_petty_cash_balance')) {
  db.exec('ALTER TABLE general_settings ADD COLUMN opening_petty_cash_balance REAL NOT NULL DEFAULT 0');
}

// Migration: add site_no to members if the table pre-dates this column
const memberColumns = db.prepare('PRAGMA table_info(members)').all().map((c) => c.name);
if (!memberColumns.includes('site_no')) {
  db.exec('ALTER TABLE members ADD COLUMN site_no TEXT');
}

// Migration: add Razorpay key columns if payment_settings pre-dates them
const paymentSettingsColumns = db.prepare('PRAGMA table_info(payment_settings)').all().map((c) => c.name);
if (!paymentSettingsColumns.includes('razorpay_key_id')) {
  db.exec('ALTER TABLE payment_settings ADD COLUMN razorpay_key_id TEXT');
}
if (!paymentSettingsColumns.includes('razorpay_key_secret')) {
  db.exec('ALTER TABLE payment_settings ADD COLUMN razorpay_key_secret TEXT');
}

// Migration: track the Razorpay order/payment tied to each due once paid online
const maintenancePaymentColumns = db.prepare('PRAGMA table_info(maintenance_payments)').all().map((c) => c.name);
if (!maintenancePaymentColumns.includes('razorpay_order_id')) {
  db.exec('ALTER TABLE maintenance_payments ADD COLUMN razorpay_order_id TEXT');
}
if (!maintenancePaymentColumns.includes('razorpay_payment_id')) {
  db.exec('ALTER TABLE maintenance_payments ADD COLUMN razorpay_payment_id TEXT');
}
if (!maintenancePaymentColumns.includes('payment_mode')) {
  db.exec('ALTER TABLE maintenance_payments ADD COLUMN payment_mode TEXT');
}
if (!maintenancePaymentColumns.includes('reference_no')) {
  db.exec('ALTER TABLE maintenance_payments ADD COLUMN reference_no TEXT');
}

// Migration: mark existing expenses as bank-sourced now that petty cash is a second source
const expenseColumns = db.prepare('PRAGMA table_info(expenses)').all().map((c) => c.name);
if (!expenseColumns.includes('source')) {
  db.exec("ALTER TABLE expenses ADD COLUMN source TEXT NOT NULL DEFAULT 'bank'");
}

// Migration: support self-service online donations (by members and by well-wishers with no account)
const donationColumns = db.prepare('PRAGMA table_info(donations)').all().map((c) => c.name);
if (!donationColumns.includes('status')) {
  db.exec("ALTER TABLE donations ADD COLUMN status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending','completed'))");
}
if (!donationColumns.includes('source')) {
  db.exec("ALTER TABLE donations ADD COLUMN source TEXT NOT NULL DEFAULT 'admin' CHECK(source IN ('admin','member','public'))");
}
if (!donationColumns.includes('donor_email')) {
  db.exec('ALTER TABLE donations ADD COLUMN donor_email TEXT');
}
if (!donationColumns.includes('donor_phone')) {
  db.exec('ALTER TABLE donations ADD COLUMN donor_phone TEXT');
}
if (!donationColumns.includes('razorpay_order_id')) {
  db.exec('ALTER TABLE donations ADD COLUMN razorpay_order_id TEXT');
}
if (!donationColumns.includes('razorpay_payment_id')) {
  db.exec('ALTER TABLE donations ADD COLUMN razorpay_payment_id TEXT');
}

// Migration: committee directory photos on the public site (stored as base64 data URLs, no file storage needed)
const coreMemberColumns = db.prepare('PRAGMA table_info(core_members)').all().map((c) => c.name);
if (!coreMemberColumns.includes('photo')) {
  db.exec('ALTER TABLE core_members ADD COLUMN photo TEXT');
}

// Seed a default admin account on first run
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const passwordHash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
  ).run('admin', passwordHash, 'admin');
  console.log('Seeded default admin user -> username: admin / password: admin123 (please change this)');
}

module.exports = db;
