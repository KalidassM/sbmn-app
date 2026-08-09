const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM general_settings WHERE id = 1').get();
  res.json(row);
});

router.put('/', requireAuth, requireAdmin, (req, res) => {
  const { maintenance_amount, opening_bank_balance, opening_petty_cash_balance } = req.body || {};
  if (maintenance_amount === undefined || Number(maintenance_amount) <= 0) {
    return res.status(400).json({ error: 'A valid maintenance amount is required' });
  }
  const existing = db.prepare('SELECT * FROM general_settings WHERE id = 1').get();
  db.prepare(
    "UPDATE general_settings SET maintenance_amount = ?, opening_bank_balance = ?, opening_petty_cash_balance = ?, updated_at = datetime('now') WHERE id = 1"
  ).run(
    Number(maintenance_amount),
    opening_bank_balance !== undefined ? Number(opening_bank_balance) : existing.opening_bank_balance,
    opening_petty_cash_balance !== undefined ? Number(opening_petty_cash_balance) : existing.opening_petty_cash_balance
  );
  const row = db.prepare('SELECT * FROM general_settings WHERE id = 1').get();
  res.json(row);
});

module.exports = router;
