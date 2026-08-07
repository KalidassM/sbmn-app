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
  const totalDonations = db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM donations').get().s;
  const totalMaintenanceCollected = db
    .prepare('SELECT COALESCE(SUM(amount_paid), 0) AS s FROM maintenance_payments')
    .get().s;
  const totalMaintenanceDue = db
    .prepare("SELECT COALESCE(SUM(amount_due - amount_paid), 0) AS s FROM maintenance_payments WHERE status != 'paid'")
    .get().s;
  const balance = totalMaintenanceCollected + totalDonations - totalExpenses;

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
