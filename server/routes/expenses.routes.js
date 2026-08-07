const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const { year, month } = req.query;
  let sql = 'SELECT * FROM expenses';
  const clauses = [];
  const params = [];
  if (year) {
    clauses.push("strftime('%Y', expense_date) = ?");
    params.push(String(year));
  }
  if (month) {
    clauses.push("strftime('%m', expense_date) = ?");
    params.push(String(month).padStart(2, '0'));
  }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY expense_date DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { title, category, amount, expense_date, event_id, notes } = req.body || {};
  if (!title || amount === undefined) {
    return res.status(400).json({ error: 'title and amount are required' });
  }
  const info = db
    .prepare(
      `INSERT INTO expenses (title, category, amount, expense_date, event_id, notes)
       VALUES (?, ?, ?, COALESCE(?, date('now')), ?, ?)`
    )
    .run(title, category || null, amount, expense_date || null, event_id || null, notes || null);
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(expense);
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Expense not found' });
  const { title, category, amount, expense_date, event_id, notes } = req.body || {};
  db.prepare(
    `UPDATE expenses SET title = ?, category = ?, amount = ?, expense_date = ?, event_id = ?, notes = ? WHERE id = ?`
  ).run(
    title ?? existing.title,
    category ?? existing.category,
    amount ?? existing.amount,
    expense_date ?? existing.expense_date,
    event_id !== undefined ? event_id : existing.event_id,
    notes ?? existing.notes,
    req.params.id
  );
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  res.json(expense);
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Expense not found' });
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
