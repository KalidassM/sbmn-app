window.MembersPage = {
  editingId: null,

  async render(container) {
    const user = Api.getUser();
    const isAdmin = user.role === 'admin';
    container.innerHTML = `
      <h1>Members</h1>
      <p class="page-sub">Association member directory</p>
      <div id="alertBox"></div>
      ${isAdmin ? '<div class="panel" id="formPanel"></div>' : ''}
      <div class="panel">
        <div class="panel-header"><h3>All Members</h3></div>
        <table>
          <thead><tr><th>Name</th><th>Site No</th><th>Phone</th><th>Email</th><th>Address</th><th>Joined</th><th>Status</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
          <tbody id="rows"><tr><td colspan="8">Loading…</td></tr></tbody>
        </table>
      </div>
    `;

    if (isAdmin) this.renderForm(document.getElementById('formPanel'), null);
    await this.loadRows();
  },

  async loadRows() {
    const user = Api.getUser();
    const isAdmin = user.role === 'admin';
    const members = await Api.get('/members');
    const rows = document.getElementById('rows');
    if (!members.length) {
      rows.innerHTML = `<tr class="empty-row"><td colspan="8">No members yet</td></tr>`;
      return;
    }
    rows.innerHTML = members
      .map(
        (m) => `
      <tr>
        <td>${Util.escapeHtml(m.name)}</td>
        <td>${Util.escapeHtml(m.site_no || '-')}</td>
        <td>${Util.escapeHtml(m.phone || '-')}</td>
        <td>${Util.escapeHtml(m.email || '-')}</td>
        <td>${Util.escapeHtml(m.address || '-')}</td>
        <td>${m.join_date || '-'}</td>
        <td><span class="badge ${m.status}">${m.status}</span></td>
        ${
          isAdmin
            ? `<td class="toolbar">
                <button class="small secondary" data-edit="${m.id}">Edit</button>
                <button class="small danger" data-del="${m.id}">Delete</button>
              </td>`
            : ''
        }
      </tr>`
      )
      .join('');

    if (isAdmin) {
      rows.querySelectorAll('[data-edit]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          const member = members.find((m) => String(m.id) === btn.dataset.edit);
          this.renderForm(document.getElementById('formPanel'), member);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        })
      );
      rows.querySelectorAll('[data-del]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this member? This also removes related dues/login records.')) return;
          try {
            await Api.del(`/members/${btn.dataset.del}`);
            await this.loadRows();
          } catch (err) {
            this.showAlert(err.message);
          }
        })
      );
    }
  },

  showAlert(message, type = 'error') {
    const box = document.getElementById('alertBox');
    if (box) box.innerHTML = `<div class="alert ${type}">${Util.escapeHtml(message)}</div>`;
  },

  renderForm(panel, member) {
    if (!panel) return;
    const isEdit = !!member;
    panel.innerHTML = `
      <div class="panel-header"><h3>${isEdit ? 'Edit Member' : 'Add Member'}</h3></div>
      <form id="memberForm">
        <div class="form-grid">
          <div class="field"><label>Name</label><input id="f_name" required value="${Util.escapeHtml(member?.name || '')}" /></div>
          <div class="field"><label>Site No</label><input id="f_site_no" value="${Util.escapeHtml(member?.site_no || '')}" /></div>
          <div class="field"><label>Phone</label><input id="f_phone" value="${Util.escapeHtml(member?.phone || '')}" /></div>
          <div class="field"><label>Email</label><input id="f_email" type="email" value="${Util.escapeHtml(member?.email || '')}" /></div>
          <div class="field"><label>Address</label><input id="f_address" value="${Util.escapeHtml(member?.address || '')}" /></div>
          <div class="field"><label>Join Date</label><input id="f_join" type="date" value="${member?.join_date || Util.todayISO()}" /></div>
          <div class="field"><label>Status</label>
            <select id="f_status">
              <option value="active" ${member?.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="inactive" ${member?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>
        <div class="toolbar mt-16">
          <button type="submit">${isEdit ? 'Save Changes' : 'Add Member'}</button>
          ${isEdit ? '<button type="button" class="secondary" id="cancelEdit">Cancel</button>' : ''}
        </div>
      </form>
    `;

    document.getElementById('memberForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('f_name').value.trim(),
        site_no: document.getElementById('f_site_no').value.trim(),
        phone: document.getElementById('f_phone').value.trim(),
        email: document.getElementById('f_email').value.trim(),
        address: document.getElementById('f_address').value.trim(),
        join_date: document.getElementById('f_join').value,
        status: document.getElementById('f_status').value,
      };
      try {
        if (isEdit) {
          await Api.put(`/members/${member.id}`, payload);
        } else {
          await Api.post('/members', payload);
        }
        this.renderForm(panel, null);
        await this.loadRows();
        this.showAlert(isEdit ? 'Member updated.' : 'Member added.', 'success');
      } catch (err) {
        this.showAlert(err.message);
      }
    });

    if (isEdit) {
      document.getElementById('cancelEdit').addEventListener('click', () => this.renderForm(panel, null));
    }
  },
};
