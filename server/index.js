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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Sri Balamurugan Nagar Welfare Association app running at http://localhost:${PORT}`);
});
