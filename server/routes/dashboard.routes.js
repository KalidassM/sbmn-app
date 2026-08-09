const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/summary', requireAuth, (req, res) => {
  const memberCount = db.prepare("SELECT COUNT(*) AS c FROM members WHERE status = 'active'").get().c;
  const coreMemberCount = db
    .prepare('SELECT COUNT(*) AS c FROM core_members WHERE end_date IS NULL')
    .get().c;
  const upcomingEvents = db
    .prepare("SELECT COUNT(*) AS c FROM events WHERE event_date >= date('now')")
    .get().c;
  const totalExpenses = db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM expenses').get().s;
  const totalDonations = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM donations WHERE status = 'completed'")
    .get().s;
  const totalMaintenanceCollected = db
    .prepare('SELECT COALESCE(SUM(amount_paid), 0) AS s FROM maintenance_payments')
    .get().s;

  const now = new Date();
  const totalMaintenanceDue = db
    .prepare(
      `SELECT COALESCE(SUM(amount_due - amount_paid), 0) AS s FROM maintenance_payments
       WHERE status != 'paid' AND month = ? AND year = ?`
    )
    .get(now.getMonth() + 1, now.getFullYear()).s;

  const generalSettings = db.prepare('SELECT opening_bank_balance, opening_petty_cash_balance FROM general_settings WHERE id = 1').get();
  const openingBalance = (generalSettings?.opening_bank_balance || 0) + (generalSettings?.opening_petty_cash_balance || 0);
  const balance = openingBalance + totalMaintenanceCollected + totalDonations - totalExpenses;

  res.json({
    memberCount,
    coreMemberCount,
    upcomingEvents,
    totalExpenses,
    totalDonations,
    totalMaintenanceCollected,
    totalMaintenanceDue,
    balance,
  });
});

module.exports = router;
