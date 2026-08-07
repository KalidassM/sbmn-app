const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function computeSummary() {
  const totalTopups = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM petty_cash_transactions WHERE type = 'topup'")
    .get().s;
  const totalExpenses = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM petty_cash_transactions WHERE type = 'expense'")
    .get().s;
  return { totalTopups, totalExpenses, balance: totalTopups - totalExpenses };
}

router.get('/', requireAuth, (req, res) => {
  const transactions = db.prepare('SELECT * FROM petty_cash_transactions ORDER BY txn_date DESC, id DESC').all();
  res.json({ transactions, summary: computeSummary() });
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { type, amount, txn_date, description, category } = req.body || {};
  if (!['topup', 'expense'].includes(type)) {
    return res.status(400).json({ error: "type must be 'topup' or 'expense'" });
  }
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'A valid amount is required' });
  }
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Description is required' });
  }
  const date = txn_date || new Date().toISOString().slice(0, 10);

  const tx = db.transaction(() => {
    let expenseId = null;
    if (type === 'expense') {
      const expenseInfo = db
        .prepare(
          `INSERT INTO expenses (title, category, amount, expense_date, source, notes)
           VALUES (?, ?, ?, ?, 'petty_cash', 'Paid from petty cash')`
        )
        .run(description.trim(), category || 'Petty Cash', amount, date);
      expenseId = expenseInfo.lastInsertRowid;
    }
    const info = db
      .prepare(
        `INSERT INTO petty_cash_transactions (type, amount, txn_date, description, category, expense_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(type, amount, date, description.trim(), category || null, expenseId);
    return info.lastInsertRowid;
  });

  const id = tx();
  const row = db.prepare('SELECT * FROM petty_cash_transactions WHERE id = ?').get(id);
  res.status(201).json({ transaction: row, summary: computeSummary() });
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM petty_cash_transactions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Transaction not found' });

  const tx = db.transaction(() => {
    if (existing.expense_id) {
      db.prepare('DELETE FROM expenses WHERE id = ?').run(existing.expense_id);
    }
    db.prepare('DELETE FROM petty_cash_transactions WHERE id = ?').run(req.params.id);
  });
  tx();

  res.json({ ok: true, summary: computeSummary() });
});

module.exports = router;
