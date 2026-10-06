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

    const upcoming = events
      .filter((e) => e.event_date >= Util.todayISO())
      .slice(0, 5);
    // newest first: by donation date, then by when it was recorded
    const myDonations = user.member_id
      ? donations
          .filter((d) => d.member_id === user.member_id)
          .sort(
            (a, b) =>
              String(b.donation_date).localeCompare(String(a.donation_date)) ||
              String(b.created_at || '').localeCompare(String(a.created_at || '')) ||
              b.id - a.id
          )
          .slice(0, 5)
      : [];
    const recentNotices = notices.slice(0, 5);

    content.innerHTML = `
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

      ${
        user.member_id
          ? `
      <div class="panel">
        <div class="panel-header"><h3>My Recent Donations</h3><a href="#/donations" class="btn secondary">View all</a></div>
        <table>
          <thead><tr><th>Date</th><th>Amount</th><th>Purpose</th><th>Status</th></tr></thead>
          <tbody id="myDonationRows">
            ${
              myDonations.length
                ? myDonations
                    .map(
                      (d) => `<tr><td>${Util.formatDate(d.donation_date)}</td><td>${Util.money(d.amount)}</td><td>${Util.escapeHtml(d.purpose || '-')}</td><td><span class="badge ${d.status === 'pending' ? 'partial' : 'paid'}">${d.status}</span></td></tr>`
                    )
                    .join('')
                : '<tr class="empty-row"><td colspan="4">You haven\'t made a donation yet</td></tr>'
            }
          </tbody>
        </table>
      </div>`
          : ''
      }

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
  },

  showAlert(message, type = 'error') {
    const box = document.getElementById('alertBox');
    if (box) box.innerHTML = `<div class="alert ${type}">${Util.escapeHtml(message)}</div>`;
  },
};
