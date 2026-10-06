window.WorkerContactsPage = {
  async render(container) {
    container.innerHTML = `
      <h1>Worker Contacts</h1>
      <p class="page-sub">Plumbers, electricians and other workers shown on the public site</p>
      <div id="alertBox"></div>
      <div class="panel" id="formPanel"></div>
      <div class="panel">
        <div class="panel-header"><h3>All Contacts</h3></div>
        <table>
          <thead><tr><th>Name</th><th>Mobile No</th><th>Work Profession</th><th></th></tr></thead>
          <tbody id="rows"><tr><td colspan="4">Loading…</td></tr></tbody>
        </table>
      </div>
    `;
    this.renderForm(document.getElementById('formPanel'), null);
    await this.loadRows();
  },

  showAlert(message, type = 'error') {
    const box = document.getElementById('alertBox');
    if (box) box.innerHTML = `<div class="alert ${type}">${Util.escapeHtml(message)}</div>`;
  },

  async loadRows() {
    const workers = await Api.get('/worker-contacts');
    const tbody = document.getElementById('rows');
    if (!workers.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="4">No contacts yet</td></tr>`;
      return;
    }
    tbody.innerHTML = workers
      .map(
        (w) => `
      <tr>
        <td>${Util.escapeHtml(w.name)}</td>
        <td>${Util.escapeHtml(w.mobile)}</td>
        <td>${Util.escapeHtml(w.profession)}</td>
        <td class="toolbar">
          <button class="small secondary" data-edit="${w.id}">Edit</button>
          <button class="small danger" data-del="${w.id}">Delete</button>
        </td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const w = workers.find((x) => String(x.id) === btn.dataset.edit);
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
    panel.innerHTML = `
      <div class="panel-header"><h3>${isEdit ? 'Edit Contact' : 'Add Worker Contact'}</h3></div>
      <form id="workerForm">
        <div class="field"><label>Name</label><input id="f_name" required maxlength="80" value="${Util.escapeHtml(w?.name || '')}" /></div>
        <div class="field"><label>Mobile No</label><input id="f_mobile" type="tel" required maxlength="20" value="${Util.escapeHtml(w?.mobile || '')}" /></div>
        <div class="field"><label>Work Profession</label><input id="f_profession" required maxlength="60" placeholder="e.g. Plumber, Electrician" value="${Util.escapeHtml(w?.profession || '')}" /></div>
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
        profession: document.getElementById('f_profession').value.trim(),
      };
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
