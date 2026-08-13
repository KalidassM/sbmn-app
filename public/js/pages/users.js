window.UsersPage = {
  async render(container) {
    container.innerHTML = `
      <h1>Login Accounts</h1>
      <p class="page-sub">Manage who can sign in to this portal and their access level</p>
      <div id="alertBox"></div>
      <div class="panel" id="formPanel"></div>
      <div class="panel">
        <div class="panel-header"><h3>Accounts</h3></div>
        <table>
          <thead><tr><th>Username</th><th>Role</th><th>Linked Member</th><th></th></tr></thead>
          <tbody id="rows"><tr><td colspan="4">Loading…</td></tr></tbody>
        </table>
      </div>
    `;
    this.members = await Api.get('/members');
    this.renderForm(document.getElementById('formPanel'));
    await this.loadRows();
  },

  showAlert(message, type = 'error') {
    const box = document.getElementById('alertBox');
    if (box) box.innerHTML = `<div class="alert ${type}">${Util.escapeHtml(message)}</div>`;
  },

  async loadRows() {
    const isSuperAdmin = Api.getUser().role === 'super_admin';
    const users = await Api.get('/users');
    const rows = document.getElementById('rows');
    rows.innerHTML = users
      .map(
        (u) => `
      <tr>
        <td>${Util.escapeHtml(u.username)}</td>
        <td><span class="badge ${['admin', 'super_admin'].includes(u.role) ? 'active' : 'partial'}">${u.role.replace('_', ' ')}</span></td>
        <td>${Util.escapeHtml(u.member_name || '-')}</td>
        <td class="toolbar">
          ${isSuperAdmin ? `<button class="small secondary" data-reset="${u.id}">Reset Password</button>` : ''}
          ${u.username !== 'admin' ? `<button class="small danger" data-del="${u.id}">Delete</button>` : ''}
        </td>
      </tr>`
      )
      .join('');

    rows.querySelectorAll('[data-reset]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const password = prompt('Enter a new password for this account:');
        if (!password) return;
        try {
          await Api.put(`/users/${btn.dataset.reset}/reset-password`, { password });
          this.showAlert('Password reset.', 'success');
        } catch (err) {
          this.showAlert(err.message);
        }
      })
    );
    rows.querySelectorAll('[data-del]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this login account?')) return;
        try {
          await Api.del(`/users/${btn.dataset.del}`);
          await this.loadRows();
        } catch (err) {
          this.showAlert(err.message);
        }
      })
    );
  },

  renderForm(panel) {
    const isSuperAdmin = Api.getUser().role === 'super_admin';
    const memberOptions =
      '<option value="">-- No linked member --</option>' +
      this.members.map((m) => `<option value="${m.id}">${Util.escapeHtml(m.name)}</option>`).join('');
    panel.innerHTML = `
      <div class="panel-header"><h3>Create Login Account</h3></div>
      <form id="userForm">
        <div class="form-grid">
          <div class="field"><label>Username</label><input id="u_username" required /></div>
          <div class="field"><label>Password</label><input id="u_password" type="password" required /></div>
          <div class="field"><label>Role</label>
            <select id="u_role">
              <option value="member">Member (view-only)</option>
              <option value="admin">Admin / Core Member (No Settings access)</option>
              ${isSuperAdmin ? '<option value="super_admin">Super Admin (full access)</option>' : ''}
            </select>
          </div>
          <div class="field"><label>Linked Member</label><select id="u_member">${memberOptions}</select></div>
        </div>
        <div class="toolbar mt-16"><button type="submit">Create Account</button></div>
      </form>
    `;
    document.getElementById('userForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const memberId = document.getElementById('u_member').value;
      const payload = {
        username: document.getElementById('u_username').value.trim(),
        password: document.getElementById('u_password').value,
        role: document.getElementById('u_role').value,
        member_id: memberId ? Number(memberId) : null,
      };
      try {
        await Api.post('/users', payload);
        e.target.reset();
        await this.loadRows();
        this.showAlert('Account created.', 'success');
      } catch (err) {
        this.showAlert(err.message);
      }
    });
  },
};
