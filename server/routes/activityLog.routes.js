const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const rows = db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?').all(limit);
  res.json(rows);
});

module.exports = router;
