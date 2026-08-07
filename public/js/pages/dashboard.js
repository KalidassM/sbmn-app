window.DashboardPage = {
  async render(container) {
    container.innerHTML = `<h1>Dashboard</h1><p class="page-sub">Overview of the association's finances and activity</p><div id="content">Loading…</div>`;
    const content = document.getElementById('content');

    const [summary, events] = await Promise.all([
      Api.get('/dashboard/summary'),
      Api.get('/events'),
    ]);

    const upcoming = events
      .filter((e) => e.event_date >= Util.todayISO())
      .slice(0, 5);

    content.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Active Members</div><div class="value">${summary.memberCount}</div></div>
        <div class="stat-card"><div class="label">Core Members</div><div class="value">${summary.coreMemberCount}</div></div>
        <div class="stat-card"><div class="label">Upcoming Events</div><div class="value">${summary.upcomingEvents}</div></div>
        <div class="stat-card"><div class="label">Maintenance Collected</div><div class="value">${Util.money(summary.totalMaintenanceCollected)}</div></div>
        <div class="stat-card ${summary.totalMaintenanceDue > 0 ? 'negative' : ''}"><div class="label">Maintenance Due</div><div class="value">${Util.money(summary.totalMaintenanceDue)}</div></div>
        <div class="stat-card"><div class="label">Total Donations</div><div class="value">${Util.money(summary.totalDonations)}</div></div>
        <div class="stat-card"><div class="label">Total Expenses</div><div class="value">${Util.money(summary.totalExpenses)}</div></div>
        <div class="stat-card ${summary.balance < 0 ? 'negative' : ''}"><div class="label">Net Balance</div><div class="value">${Util.money(summary.balance)}</div></div>
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
                      (e) => `<tr><td>${Util.escapeHtml(e.title)}</td><td>${e.event_date}</td><td>${Util.escapeHtml(e.venue || '-')}</td></tr>`
                    )
                    .join('')
                : '<tr class="empty-row"><td colspan="3">No upcoming events</td></tr>'
            }
          </tbody>
        </table>
      </div>
    `;
  },
};
