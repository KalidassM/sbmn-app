const Util = {
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
  money(n) {
    const num = Number(n) || 0;
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  },
  monthName(m) {
    const names = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return names[Number(m)] || m;
  },
  todayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  },
  openModal(innerHtml) {
    let overlay = document.getElementById('modalOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modalOverlay';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) Util.closeModal();
      });
    }
    overlay.innerHTML = `<div class="modal-box">${innerHtml}</div>`;
    overlay.classList.add('open');
  },
  closeModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.remove('open');
  },
};

const NAV_ITEMS = [
  { path: '#/dashboard', label: 'Dashboard' },
  { path: '#/maintenance', label: 'Maintenance' },
  { path: '#/expenses', label: 'Expenses & Petty Cash' },
  { path: '#/members', label: 'Members' },
  { path: '#/events', label: 'Events' },
  { path: '#/core-members', label: 'Core Members' },
  { path: '#/donations', label: 'Donations' },
  { path: '#/users', label: 'Login Accounts', adminOnly: true },
  { path: '#/payment-settings', label: 'Payment Settings', adminOnly: true },
];

const PAGES = {
  '#/dashboard': window.DashboardPage,
  '#/members': window.MembersPage,
  '#/core-members': window.CoreMembersPage,
  '#/events': window.EventsPage,
  '#/maintenance': window.MaintenancePage,
  '#/expenses': window.ExpensesPage,
  '#/donations': window.DonationsPage,
  '#/users': window.UsersPage,
  '#/payment-settings': window.PaymentSettingsPage,
};

function renderShell() {
  const user = Api.getUser();
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <h2>Sri Balamurugan Nagar Welfare Association</h2>
        <div class="org-sub">Management Portal</div>
        <nav id="nav"></nav>
        <div class="user-box">
          Signed in as <strong>${Util.escapeHtml(user.username)}</strong>
          <div><span class="role-tag">${user.role === 'admin' ? 'Core Member / Admin' : 'Member'}</span></div>
          <button class="logout" id="logoutBtn">Log out</button>
        </div>
      </aside>
      <main class="main" id="main"></main>
    </div>
  `;
  document.getElementById('logoutBtn').addEventListener('click', () => {
    Api.clearSession();
    window.location.hash = '#/login';
  });
}

function renderNav(activePath) {
  const user = Api.getUser();
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML = NAV_ITEMS.filter((item) => !item.adminOnly || user.role === 'admin')
    .map(
      (item) =>
        `<a href="${item.path}" class="${item.path === activePath ? 'active' : ''}">${item.label}</a>`
    )
    .join('');
}

async function router() {
  let hash = window.location.hash || '#/dashboard';
  const user = Api.getUser();
  const token = Api.getToken();

  if (!token || !user) {
    if (hash !== '#/login') {
      window.location.hash = '#/login';
      return;
    }
    const app = document.getElementById('app');
    app.innerHTML = '';
    window.LoginPage.render(app);
    return;
  }

  if (hash === '#/login') {
    window.location.hash = '#/dashboard';
    return;
  }

  const navItem = NAV_ITEMS.find((item) => item.path === hash);
  if (navItem && navItem.adminOnly && user.role !== 'admin') {
    window.location.hash = '#/dashboard';
    return;
  }

  if (!document.querySelector('.shell')) {
    renderShell();
  }
  renderNav(hash);

  const page = PAGES[hash];
  const main = document.getElementById('main');
  if (!page) {
    main.innerHTML = '<h1>Not found</h1>';
    return;
  }
  try {
    await page.render(main);
  } catch (err) {
    main.innerHTML = `<div class="alert error">${Util.escapeHtml(err.message)}</div>`;
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
