require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

require('./db'); // ensures schema + seed admin exist

const authRoutes = require('./routes/auth.routes');
const memberRoutes = require('./routes/members.routes');
const coreMemberRoutes = require('./routes/coreMembers.routes');
const eventRoutes = require('./routes/events.routes');
const expenseRoutes = require('./routes/expenses.routes');
const maintenanceRoutes = require('./routes/maintenance.routes');
const donationRoutes = require('./routes/donations.routes');
const userRoutes = require('./routes/users.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const paymentSettingsRoutes = require('./routes/paymentSettings.routes');
const razorpayPaymentsRoutes = require('./routes/razorpayPayments.routes');
const pettyCashRoutes = require('./routes/pettyCash.routes');
const publicDonationsRoutes = require('./routes/publicDonations.routes');
const noticeRoutes = require('./routes/notices.routes');
const contactMessageRoutes = require('./routes/contactMessages.routes');
const publicSiteRoutes = require('./routes/publicSite.routes');
const publicMaintenanceRoutes = require('./routes/publicMaintenance.routes');
const generalSettingsRoutes = require('./routes/generalSettings.routes');
const { sendMonthlyReminders } = require('./utils/maintenanceReminders');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' })); // raised to fit base64 committee-photo uploads

app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/core-members', coreMemberRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/payment-settings', paymentSettingsRoutes);
app.use('/api/payments/razorpay', razorpayPaymentsRoutes);
app.use('/api/petty-cash', pettyCashRoutes);
app.use('/api/public/donations', publicDonationsRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/contact-messages', contactMessageRoutes);
app.use('/api/public/site', publicSiteRoutes);
app.use('/api/public/maintenance', publicMaintenanceRoutes);
app.use('/api/general-settings', generalSettingsRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/donate', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'donate.html'));
});

app.get('/pay-monthly-maintenance', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'pay-maintenance.html'));
});

// The member/admin portal (hash-routed SPA) lives at /portal; "/" is the public marketing site
app.get('/portal', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'portal.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Sri Balamurugan Nagar Welfare Association app running at http://localhost:${PORT}`);
});

// On the 1st of each month (India time), send WhatsApp reminders to anyone with a due that month.
// sendMonthlyReminders() is idempotent (guards on general_settings.reminders_last_sent), so an
// hourly check is enough - no cron dependency needed, and it self-heals if the server restarts.
function isFirstOfMonthInIndia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', day: '2-digit' }).format(new Date()) === '01';
}

async function checkMonthlyReminders() {
  if (!isFirstOfMonthInIndia()) return;
  try {
    const result = await sendMonthlyReminders();
    if (!result.skipped) {
      console.log(`Monthly maintenance reminders: sent ${result.sent.length}, failed ${result.failed.length}`);
    }
  } catch (err) {
    console.error('Monthly reminder check failed:', err.message);
  }
}

setInterval(checkMonthlyReminders, 60 * 60 * 1000);
checkMonthlyReminders();
