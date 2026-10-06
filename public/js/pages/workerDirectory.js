window.WorkerDirectoryPage = {
  workers: [],
  activeCategory: '',

  async render(container) {
    this.activeCategory = '';
    container.innerHTML = `
      <h1>Worker Contacts</h1>
      <p class="page-sub">Plumbers, electricians and other service providers for the Nagar. Tap a number to call.</p>
      <div id="alertBox"></div>
      <div class="wd-tools">
        <input type="search" class="wd-search" id="wdSearch" placeholder="Search by name, category or number" aria-label="Search contacts" />
        <div class="wd-chips" id="wdChips"></div>
      </div>
      <div id="wdList"><p class="wd-empty">Loading…</p></div>
    `;
    document.getElementById('wdSearch').addEventListener('input', () => this.renderList());
    document.getElementById('wdChips').addEventListener('click', (e) => {
      const btn = e.target.closest('.wd-chip');
      if (!btn) return;
      this.activeCategory = btn.dataset.c;
      this.renderChips();
      this.renderList();
    });
    try {
      this.workers = await Api.get('/worker-contacts');
    } catch (err) {
      document.getElementById('wdList').innerHTML = `<p class="wd-empty">${Util.escapeHtml(err.message)}</p>`;
      return;
    }
    this.renderChips();
    this.renderList();
  },

  renderChips() {
    const cats = [...new Set(this.workers.flatMap((w) => w.categories || []))].sort();
    document.getElementById('wdChips').innerHTML = [''].concat(cats)
      .map(
        (c) =>
          `<button type="button" class="wd-chip${c === this.activeCategory ? ' active' : ''}" data-c="${Util.escapeHtml(c)}">${c ? Util.escapeHtml(c) : 'All'}</button>`
      )
      .join('');
  },

  renderList() {
    const esc = Util.escapeHtml;
    const q = document.getElementById('wdSearch').value.trim().toLowerCase();
    const cat = this.activeCategory;
    const visible = this.workers.filter(
      (w) =>
        (!cat || (w.categories || []).includes(cat)) &&
        (!q || `${w.name} ${(w.categories || []).join(' ')} ${w.title || ''} ${w.mobile} ${w.mobile2 || ''}`.toLowerCase().includes(q))
    );
    const list = document.getElementById('wdList');
    if (!visible.length) {
      list.innerHTML = `<p class="wd-empty">${this.workers.length ? 'No contacts match your search.' : 'No contacts listed yet.'}</p>`;
      return;
    }
    // a worker with several categories appears under each of them
    const groups = {};
    visible.forEach((w) =>
      (w.categories || []).forEach((c) => {
        if (cat && c !== cat) return;
        (groups[c] = groups[c] || []).push(w);
      })
    );
    list.innerHTML = Object.keys(groups)
      .sort()
      .map(
        (c) => `
      <section class="wd-group">
        <h2>${esc(c)} <span class="wd-count">${groups[c].length}</span></h2>
        <div class="wd-grid">
          ${groups[c]
            .map(
              (w) => `
            <div class="wd-card">
              <div class="wd-avatar">${esc(w.name.trim().charAt(0).toUpperCase())}</div>
              <div class="wd-info">
                <h3>${esc(w.name)}</h3>
                ${w.title ? `<div class="wd-title">${esc(w.title)}</div>` : ''}
                <div class="wd-mobile">${esc(w.mobile)}</div>
                ${w.mobile2 ? `<div class="wd-mobile">${esc(w.mobile2)}</div>` : ''}
              </div>
              <div class="wd-calls">
                <a class="wd-call" href="tel:${esc(w.mobile)}">Call</a>
                ${w.mobile2 ? `<a class="wd-call alt" href="tel:${esc(w.mobile2)}">Call 2nd</a>` : ''}
              </div>
            </div>`
            )
            .join('')}
        </div>
      </section>`
      )
      .join('');
  },
};
