const WORKER_CATEGORIES = [
  'Panjayath Office',
  'EB Office',
  'Sweeper',
  'Waterman',
  'Electrician',
  'Plumber',
  'Carpenter',
  'Painter',
  'Mason',
  'Garden Cleaner',
  'Tank / Drain Cleaning Service',
  'Cabs',
  'Lorry Water Service',
  'Samiyana Panthal',
  'Earth Digging',
  'Police',
  'Forest',
  'Snake Rescue',
  'Other',
];

window.WorkerContactsPage = {
  workers: [],

  async render(container) {
    const isAdmin = Util.isAdmin(Api.getUser());
    this.isAdmin = isAdmin;
    const cols = isAdmin ? 6 : 5;
    container.innerHTML = `
      <h1>Worker Contacts</h1>
      <p class="page-sub">Plumbers, electricians and other workers serving the Nagar</p>
      <div id="alertBox"></div>
      ${isAdmin ? '<div class="panel" id="formPanel"></div>' : ''}
      <div class="panel">
        <div class="panel-header"><h3>All Contacts</h3></div>
        <div class="toolbar" style="margin-bottom:12px;">
          <input id="f_search" placeholder="Search by name, category or number" style="max-width:300px;" />
          <select id="f_filter" style="max-width:260px;"><option value="">All categories</option></select>
        </div>
        <table>
          <thead><tr><th>Name</th><th>Mobile No</th><th>Second No</th><th>Category</th><th>Title</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
          <tbody id="rows"><tr><td colspan="${cols}">Loading…</td></tr></tbody>
        </table>
      </div>
    `;
    if (isAdmin) this.renderForm(document.getElementById('formPanel'), null);
    document.getElementById('f_search').addEventListener('input', () => this.renderRows());
    document.getElementById('f_filter').addEventListener('change', () => this.renderRows());
    await this.loadRows();
  },

  showAlert(message, type = 'error') {
    const box = document.getElementById('alertBox');
    if (box) box.innerHTML = `<div class="alert ${type}">${Util.escapeHtml(message)}</div>`;
  },

  async loadRows() {
    this.workers = await Api.get('/worker-contacts');
    const filter = document.getElementById('f_filter');
    const current = filter.value;
    const used = [...new Set(this.workers.flatMap((w) => w.categories || []))].sort();
    filter.innerHTML =
      '<option value="">All categories</option>' +
      used.map((c) => `<option value="${Util.escapeHtml(c)}">${Util.escapeHtml(c)}</option>`).join('');
    filter.value = used.includes(current) ? current : '';
    this.renderRows();
  },

  renderRows() {
    const isAdmin = this.isAdmin;
    const cols = isAdmin ? 6 : 5;
    const q = document.getElementById('f_search').value.trim().toLowerCase();
    const cat = document.getElementById('f_filter').value;
    const workers = this.workers.filter(
      (w) =>
        (!cat || (w.categories || []).includes(cat)) &&
        (!q || `${w.name} ${(w.categories || []).join(' ')} ${w.title || ''} ${w.mobile} ${w.mobile2 || ''}`.toLowerCase().includes(q))
    );
    const tel = (n) => (n ? `<a href="tel:${Util.escapeHtml(n)}">${Util.escapeHtml(n)}</a>` : '-');
    const tbody = document.getElementById('rows');
    if (!workers.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="${cols}">${this.workers.length ? 'No contacts match' : 'No contacts yet'}</td></tr>`;
      return;
    }
    tbody.innerHTML = workers
      .map(
        (w) => `
      <tr>
        <td>${Util.escapeHtml(w.name)}</td>
        <td>${tel(w.mobile)}</td>
        <td>${tel(w.mobile2)}</td>
        <td>${Util.escapeHtml((w.categories || []).join(', '))}</td>
        <td>${Util.escapeHtml(w.title || '-')}</td>
        ${
          isAdmin
            ? `<td class="toolbar">
          <button class="small secondary" data-edit="${w.id}">Edit</button>
          <button class="small danger" data-del="${w.id}">Delete</button>
        </td>`
            : ''
        }
      </tr>`
      )
      .join('');

    if (!isAdmin) return;
    tbody.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const w = this.workers.find((x) => String(x.id) === btn.dataset.edit);
        this.renderForm(document.getElementById('formPanel'), w);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
    );
    tbody.querySelectorAll('[data-del]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this contact?')) return;
        try {
          await Api.del(`/worker-contacts/${btn.dataset.del}`);
          await this.loadRows();
        } catch (err) {
          this.showAlert(err.message);
        }
      })
    );
  },

  renderForm(panel, w) {
    if (!panel) return;
    const isEdit = !!w;
    const selected = w?.categories || [];
    // keep categories saved before this list existed selectable when editing
    const categories = [...WORKER_CATEGORIES, ...selected.filter((c) => !WORKER_CATEGORIES.includes(c))];
    panel.innerHTML = `
      <div class="panel-header"><h3>${isEdit ? 'Edit Contact' : 'Add Worker Contact'}</h3></div>
      <form id="workerForm">
        <div class="field"><label>Name</label><input id="f_name" required maxlength="80" value="${Util.escapeHtml(w?.name || '')}" /></div>
        <div class="field"><label>Mobile No</label><input id="f_mobile" type="tel" required maxlength="20" value="${Util.escapeHtml(w?.mobile || '')}" /></div>
        <div class="field"><label>Second Mobile No (optional)</label><input id="f_mobile2" type="tel" maxlength="20" value="${Util.escapeHtml(w?.mobile2 || '')}" /></div>
        <div class="field"><label>Categories (select one or more)</label>
          <div id="f_categories" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:6px 16px;">
            ${categories
              .map(
                (c) => `<label style="font-weight:normal;"><input type="checkbox" name="category" value="${Util.escapeHtml(c)}" ${selected.includes(c) ? 'checked' : ''} /> ${Util.escapeHtml(c)}</label>`
              )
              .join('')}
          </div>
        </div>
        <div class="field"><label>Title (optional)</label><input id="f_title" maxlength="80" placeholder="e.g. House wiring specialist" value="${Util.escapeHtml(w?.title || '')}" /></div>
        <div class="toolbar mt-16">
          <button type="submit">${isEdit ? 'Save Changes' : 'Add Contact'}</button>
          ${isEdit ? '<button type="button" class="secondary" id="cancelEdit">Cancel</button>' : ''}
        </div>
      </form>
    `;

    document.getElementById('workerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('f_name').value.trim(),
        mobile: document.getElementById('f_mobile').value.trim(),
        mobile2: document.getElementById('f_mobile2').value.trim(),
        categories: [...document.querySelectorAll('#f_categories input:checked')].map((i) => i.value),
        title: document.getElementById('f_title').value.trim(),
      };
      if (!payload.categories.length) return this.showAlert('Select at least one category.');
      try {
        if (isEdit) {
          await Api.put(`/worker-contacts/${w.id}`, payload);
        } else {
          await Api.post('/worker-contacts', payload);
        }
        this.renderForm(panel, null);
        await this.loadRows();
        this.showAlert(isEdit ? 'Contact updated.' : 'Contact added.', 'success');
      } catch (err) {
        this.showAlert(err.message);
      }
    });

    if (isEdit) {
      document.getElementById('cancelEdit').addEventListener('click', () => this.renderForm(panel, null));
    }
  },
};
