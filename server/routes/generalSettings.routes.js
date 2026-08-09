const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM general_settings WHERE id = 1').get();
  res.json(row);
});

router.put('/', requireAuth, requireAdmin, (req, res) => {
  const { maintenance_amount } = req.body || {};
  if (maintenance_amount === undefined || Number(maintenance_amount) <= 0) {
    return res.status(400).json({ error: 'A valid maintenance amount is required' });
  }
  db.prepare("UPDATE general_settings SET maintenance_amount = ?, updated_at = datetime('now') WHERE id = 1").run(
    Number(maintenance_amount)
  );
  const row = db.prepare('SELECT * FROM general_settings WHERE id = 1').get();
  res.json(row);
});

module.exports = router;
