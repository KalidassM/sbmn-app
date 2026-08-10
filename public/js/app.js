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
  { path: '#/dashboard', label: 'Dashboard', icon: 'bi-speedometer2' },
  { path: '#/maintenance', label: 'Maintenance', icon: 'bi-house-gear' },
  { path: '#/reminders', label: 'Reminders', icon: 'bi-bell', adminOnly: true },
  { path: '#/expenses', label: 'Expenses & Petty Cash', icon: 'bi-cash-coin' },
  { path: '#/members', label: 'Members', icon: 'bi-people' },
  { path: '#/events', label: 'Events', icon: 'bi-calendar-event' },
  { path: '#/core-members', label: 'Core Members', icon: 'bi-person-badge' },
  { path: '#/donations', label: 'Donations', icon: 'bi-heart' },
  { path: '#/contact-messages', label: 'Contact Messages', icon: 'bi-envelope', adminOnly: true },
  { path: '#/users', label: 'Login Accounts', icon: 'bi-shield-lock', adminOnly: true },
  { path: '#/payment-settings', label: 'Payment Settings', icon: 'bi-credit-card', adminOnly: true },
  { path: '#/general-settings', label: 'General Settings', icon: 'bi-gear', adminOnly: true },
];

const PAGES = {
  '#/dashboard': window.DashboardPage,
  '#/members': window.MembersPage,
  '#/core-members': window.CoreMembersPage,
  '#/events': window.EventsPage,
  '#/maintenance': window.MaintenancePage,
  '#/reminders': window.RemindersPage,
  '#/expenses': window.ExpensesPage,
  '#/donations': window.DonationsPage,
  '#/contact-messages': window.ContactMessagesPage,
  '#/users': window.UsersPage,
  '#/payment-settings': window.PaymentSettingsPage,
  '#/general-settings': window.GeneralSettingsPage,
};

function renderShell() {
  const user = Api.getUser();
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-wrapper">
      <nav class="app-header navbar navbar-expand bg-body">
        <div class="container-fluid">
          <ul class="navbar-nav">
            <li class="nav-item">
              <a class="nav-link" data-lte-toggle="sidebar" href="#" role="button" aria-label="Toggle sidebar">
                <i class="bi bi-list"></i>
              </a>
            </li>
          </ul>
          <ul class="navbar-nav ms-auto">
            <li class="nav-item d-none d-sm-flex align-items-center">
              <span class="nav-link disabled">
                Signed in as <strong>${Util.escapeHtml(user.username)}</strong>
                <span class="role-tag">${user.role === 'admin' ? 'Core Member / Admin' : 'Member'}</span>
              </span>
            </li>
            <li class="nav-item">
              <a href="/" class="nav-link" title="Public Site" aria-label="Public Site"><i class="bi bi-house"></i></a>
            </li>
            <li class="nav-item">
              <a href="#" id="logoutBtn" class="nav-link" title="Log out" aria-label="Log out"><i class="bi bi-box-arrow-right"></i></a>
            </li>
          </ul>
        </div>
      </nav>

      <aside class="app-sidebar bg-body-secondary shadow" data-bs-theme="dark">
        <div class="sidebar-brand">
          <a href="#/dashboard" class="brand-link">
            <span class="brand-text fw-light" id="sidebarBrandText">Sri Balamurugan Nagar Welfare Association</span>
          </a>
        </div>
        <div class="sidebar-wrapper">
          <nav class="mt-2" aria-label="Main navigation">
            <ul class="nav sidebar-menu flex-column" id="nav"></ul>
          </nav>
        </div>
      </aside>

      <main class="app-main">
        <div class="app-content">
          <div class="container-fluid main" id="main"></div>
        </div>
      </main>
    </div>
  `;
  document.getElementById('logoutBtn').addEventListener('click', (e) => {
    e.preventDefault();
    Api.clearSession();
    window.location.hash = '#/login';
  });

  Api.get('/general-settings')
    .then((s) => {
      if (s.app_name) {
        document.getElementById('sidebarBrandText').textContent = s.app_name;
        document.title = s.app_name;
      }
    })
    .catch(() => {});
}

function renderNav(activePath) {
  const user = Api.getUser();
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML = NAV_ITEMS.filter((item) => !item.adminOnly || user.role === 'admin')
    .map(
      (item) => `
      <li class="nav-item">
        <a href="${item.path}" class="nav-link ${item.path === activePath ? 'active' : ''}">
          <i class="nav-icon bi ${item.icon}"></i>
          <p>${item.label}</p>
        </a>
      </li>`
    )
    .join('');

  // On mobile the sidebar opens as an overlay (body.sidebar-open); close it after picking a page
  nav.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => {
      if (document.body.classList.contains('sidebar-open')) {
        const sidebar = document.querySelector('.app-sidebar');
        if (sidebar && window.adminlte) {
          window.adminlte.PushMenu.getOrCreateInstance(sidebar).collapse();
        }
      }
    })
  );
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
