window.DashboardPage = {
  async render(container) {
    container.innerHTML = `<h1>Dashboard</h1><p class="page-sub">Overview of the association's finances and activity</p><div id="alertBox"></div><div id="content">Loading…</div>`;
    const content = document.getElementById('content');
    const user = Api.getUser();

    const [summary, events, donations, notices] = await Promise.all([
      Api.get('/dashboard/summary'),
      Api.get('/events'),
      Api.get('/donations'),
      Api.get('/notices'),
    ]);
    // members and committee (admin) members pay their own maintenance dues from here
    this.myDues = [];
    if (user.member_id) {
      const now = new Date();
      const currentKey = now.getFullYear() * 100 + (now.getMonth() + 1);
      // asking for the current month makes the server generate its dues if they don't exist yet
      await Api.get(`/maintenance/payments?month=${now.getMonth() + 1}&year=${now.getFullYear()}&member_id=${user.member_id}`);
      const all = await Api.get(`/maintenance/payments?member_id=${user.member_id}`);
      this.myDues = all
        .filter((p) => p.status !== 'paid' && p.year * 100 + p.month <= currentKey)
        .sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month));
    }

    const upcoming = events
      .filter((e) => e.event_date >= Util.todayISO())
      .slice(0, 5);
    // latest 5 donations from everyone, newest first: by donation date, then by when it was recorded
    const recentDonations = [...donations]
      .sort(
        (a, b) =>
          String(b.donation_date).localeCompare(String(a.donation_date)) ||
          String(b.created_at || '').localeCompare(String(a.created_at || '')) ||
          b.id - a.id
      )
      .slice(0, 5);
    const recentNotices = notices.slice(0, 5);

    content.innerHTML = `
      ${
        this.myDues.length
          ? `<div class="panel" style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
              <div>
                <strong>Pending maintenance</strong>
                <div class="text-muted" style="margin-top:4px;">${this.myDues
                  .map((p) => `${Util.monthName(p.month)} ${p.year} (${Util.money(Number(p.amount_due) - Number(p.amount_paid))})`)
                  .join(' &middot; ')}</div>
              </div>
              <button id="payAllBtn">Pay ${Util.money(this.myDues.reduce((sum, p) => sum + Number(p.amount_due) - Number(p.amount_paid), 0))}</button>
            </div>`
          : ''
      }

      <h3 class="stat-group-title">Community</h3>
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Active Members</div><div class="value">${summary.memberCount}</div></div>
        <div class="stat-card"><div class="label">Inactive Members</div><div class="value">${summary.inactiveMemberCount}</div></div>
        <div class="stat-card"><div class="label">Core Members</div><div class="value">${summary.coreMemberCount}</div></div>
        <div class="stat-card"><div class="label">Upcoming Events</div><div class="value">${summary.upcomingEvents}</div></div>
        <div class="stat-card"><div class="label">Notices</div><div class="value">${summary.noticeCount}</div></div>
      </div>

      <h3 class="stat-group-title">Finances</h3>
      <div class="stat-grid">
        <div class="stat-card ${summary.balance < 0 ? 'negative' : ''}"><div class="label">Total Balance (Bank + Petty Cash + Donations)</div><div class="value">${Util.money(summary.balance)}</div></div>
        <div class="stat-card"><div class="label">Maintenance Collected (this month)</div><div class="value">${Util.money(summary.maintenanceCollectedThisMonth)}</div></div>
        <div class="stat-card ${summary.totalMaintenanceDue > 0 ? 'negative' : ''}"><div class="label">Maintenance Pending Due (this month)</div><div class="value">${Util.money(summary.totalMaintenanceDue)}</div></div>
        <div class="stat-card"><div class="label">Total Donations</div><div class="value">${Util.money(summary.totalDonations)}</div></div>
        <div class="stat-card"><div class="label">Total Expenses</div><div class="value">${Util.money(summary.totalExpenses)}</div></div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Recent Donations</h3><a href="#/donations" class="btn secondary">View all</a></div>
        <table>
          <thead><tr><th>Date</th><th>Donor</th><th>Amount</th><th>Purpose</th><th>Status</th></tr></thead>
          <tbody id="recentDonationRows">
            ${
              recentDonations.length
                ? recentDonations
                    .map(
                      (d) => `<tr><td>${Util.formatDate(d.donation_date)}</td><td>${Util.escapeHtml(d.member_name || d.donor_name || '-')}</td><td>${Util.money(d.amount)}</td><td>${Util.escapeHtml(d.purpose || '-')}</td><td><span class="badge ${d.status === 'pending' ? 'partial' : 'paid'}">${d.status}</span></td></tr>`
                    )
                    .join('')
                : '<tr class="empty-row"><td colspan="5">No donations yet</td></tr>'
            }
          </tbody>
        </table>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Upcoming Events</h3><a href="#/events" class="btn secondary">View all</a></div>
        <table>
          <thead><tr><th>Title</th><th>Date</th><th>Venue</th></tr></thead>
          <tbody>
            ${
              upcoming.length
                ? upcoming
                    .map(
                      (e) => `<tr><td>${Util.escapeHtml(e.title)}</td><td>${Util.formatDate(e.event_date)}</td><td>${Util.escapeHtml(e.venue || '-')}</td></tr>`
                    )
                    .join('')
                : '<tr class="empty-row"><td colspan="3">No upcoming events</td></tr>'
            }
          </tbody>
        </table>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Notices</h3><a href="#/notices" class="btn secondary">View all</a></div>
        <table>
          <thead><tr><th>Title</th><th>Details</th><th>Posted</th></tr></thead>
          <tbody>
            ${
              recentNotices.length
                ? recentNotices
                    .map(
                      (n) => `<tr><td>${Util.escapeHtml(n.title)}${n.pinned ? ' <span class="badge active">Pinned</span>' : ''}</td><td>${Util.escapeHtml(n.body)}</td><td>${Util.formatDate(n.created_at)}</td></tr>`
                    )
                    .join('')
                : '<tr class="empty-row"><td colspan="3">No notices yet</td></tr>'
            }
          </tbody>
        </table>
      </div>
    `;

    const payAllBtn = document.getElementById('payAllBtn');
    if (payAllBtn) payAllBtn.addEventListener('click', () => this.payDues(this.myDues));
  },

  showAlert(message, type = 'error') {
    const box = document.getElementById('alertBox');
    if (box) box.innerHTML = `<div class="alert ${type}">${Util.escapeHtml(message)}</div>`;
  },

  async payDues(dues) {
    const remaining = dues.reduce((sum, d) => sum + Number(d.amount_due) - Number(d.amount_paid), 0);
    const label = dues.map((d) => `${Util.monthName(d.month)} ${d.year}`).join(', ');
    try {
      const config = await Api.get('/payments/razorpay/config');
      if (!config.configured) return this.showQr(label, remaining);
      const paymentIds = dues.map((d) => d.id);
      const order = await Api.post('/payments/razorpay/order', { payment_ids: paymentIds });
      const rzp = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: order.payeeName,
        description: `Maintenance ${label}`,
        order_id: order.orderId,
        handler: async (response) => {
          try {
            await Api.post('/payments/razorpay/verify', {
              payment_ids: paymentIds,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            await this.render(document.getElementById('content').parentElement);
            this.showAlert('Thank you! Your payment has been received.', 'success');
          } catch (err) {
            this.showAlert(err.message);
          }
        },
        theme: { color: '#2f6f4e' },
      });
      rzp.open();
    } catch (err) {
      this.showAlert(err.message);
    }
  },

  async showQr(label, remaining) {
    try {
      const note = `Maintenance ${label} - ${Api.getUser().username}`;
      const data = await Api.get(`/payment-settings/qr?amount=${remaining}&note=${encodeURIComponent(note)}`);
      Util.openModal(`
        <h3>Pay ${Util.money(remaining)}</h3>
        <p class="text-muted">Maintenance: ${Util.escapeHtml(label)}</p>
        <img src="${data.qrDataUrl}" alt="UPI QR code" width="220" height="220" />
        <p class="text-muted mt-16">Scan with any UPI app, or on your phone <a href="${Util.escapeHtml(data.upiUri)}">tap here to pay</a>.</p>
        <p class="text-muted" style="font-size:0.78rem;">After paying, let a core member know so they can record your payment.</p>
        <div class="toolbar mt-16"><button class="secondary" onclick="Util.closeModal()">Close</button></div>
      `);
    } catch (err) {
      this.showAlert(err.message);
    }
  },
};
