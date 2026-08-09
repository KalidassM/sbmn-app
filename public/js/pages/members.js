window.MembersPage = {
  editingId: null,

  async render(container) {
    const user = Api.getUser();
    const isAdmin = user.role === 'admin';
    container.innerHTML = `
      <h1>Members</h1>
      <p class="page-sub">Association member directory</p>
      <div id="alertBox"></div>
      ${isAdmin ? '<div class="panel" id="bulkPanel"></div>' : ''}
      ${isAdmin ? '<div class="panel" id="formPanel"></div>' : ''}
      <div class="panel">
        <div class="panel-header"><h3>All Members</h3></div>
        <table>
          <thead><tr><th>Name</th><th>Site No</th><th>Phone</th><th>Email</th><th>Address</th><th>Joined</th><th>Status</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
          <tbody id="rows"><tr><td colspan="8">Loading…</td></tr></tbody>
        </table>
      </div>
    `;

    if (isAdmin) {
      this.renderBulkPanel(document.getElementById('bulkPanel'));
      this.renderForm(document.getElementById('formPanel'), null);
    }
    await this.loadRows();
  },

  renderBulkPanel(panel) {
    if (!panel) return;
    panel.innerHTML = `
      <div class="panel-header"><h3>Bulk Upload Members</h3></div>
      <p class="page-sub" style="margin-top:-8px;">Upload a CSV to add new members or update existing ones (matched by Site No). Columns: <code>name, site_no, address, phone, email, join_date, status</code>.</p>
      <div class="toolbar">
        <button type="button" class="secondary" id="downloadSampleBtn">Download Sample CSV</button>
        <input type="file" id="bulkFile" accept=".csv" />
        <button type="button" id="bulkUploadBtn">Upload</button>
      </div>
    `;

    document.getElementById('downloadSampleBtn').addEventListener('click', () => {
      const csv =
        'name,site_no,address,phone,email,join_date,status\n' +
        'Ramesh Kumar,42,"12, Main Street, Coimbatore",9876543210,ramesh@example.com,2024-01-15,active\n' +
        'Lakshmi Narayan,43,"14, Main Street, Coimbatore",9876543211,,2024-02-01,active\n';
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'members-sample.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    document.getElementById('bulkUploadBtn').addEventListener('click', async () => {
      const fileInput = document.getElementById('bulkFile');
      const file = fileInput.files[0];
      if (!file) return this.showAlert('Choose a CSV file first');
      try {
        const text = await file.text();
        const members = this.csvToMembers(text);
        if (!members.length) return this.showAlert('No rows found in that CSV file');
        const result = await Api.post('/members/bulk', { members });
        let msg = `${result.inserted} added, ${result.updated} updated.`;
        if (result.skipped.length) {
          msg += ` ${result.skipped.length} row(s) skipped — ` + result.skipped.map((s) => `row ${s.row}: ${s.reason}`).join('; ');
        }
        this.showAlert(msg, result.skipped.length ? 'error' : 'success');
        fileInput.value = '';
        await this.loadRows();
      } catch (err) {
        this.showAlert(err.message);
      }
    });
  },

  parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  },

  csvToMembers(text) {
    const rows = this.parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
    if (!rows.length) return [];
    const header = rows[0].map((h) => h.trim().toLowerCase());
    return rows.slice(1).map((r) => {
      const obj = {};
      header.forEach((h, i) => {
        obj[h] = (r[i] || '').trim();
      });
      return obj;
    });
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
