window.EventsPage = {
  async render(container) {
    const user = Api.getUser();
    const isAdmin = user.role === 'admin';
    container.innerHTML = `
      <h1>Events</h1>
      <p class="page-sub">Association events and gatherings</p>
      <div id="alertBox"></div>
      ${isAdmin ? '<div class="panel" id="formPanel"></div>' : ''}
      <div class="panel">
        <div class="panel-header"><h3>All Events</h3></div>
        <table>
          <thead><tr><th>Title</th><th>Date</th><th>Venue</th><th>Budget</th><th>Description</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
          <tbody id="rows"><tr><td colspan="6">Loading…</td></tr></tbody>
        </table>
      </div>
    `;
    if (isAdmin) this.renderForm(document.getElementById('formPanel'), null);
    await this.loadRows();
  },

  showAlert(message, type = 'error') {
    const box = document.getElementById('alertBox');
    if (box) box.innerHTML = `<div class="alert ${type}">${Util.escapeHtml(message)}</div>`;
  },

  async loadRows() {
    const user = Api.getUser();
    const isAdmin = user.role === 'admin';
    const events = await Api.get('/events');
    const tbody = document.getElementById('rows');
    if (!events.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No events yet</td></tr>`;
      return;
    }
    tbody.innerHTML = events
      .map(
        (ev) => `
      <tr>
        <td>${Util.escapeHtml(ev.title)}</td>
        <td>${ev.event_date}</td>
        <td>${Util.escapeHtml(ev.venue || '-')}</td>
        <td>${Util.money(ev.budget)}</td>
        <td>${Util.escapeHtml(ev.description || '-')}</td>
        ${
          isAdmin
            ? `<td class="toolbar">
                <button class="small secondary" data-edit="${ev.id}">Edit</button>
                <button class="small danger" data-del="${ev.id}">Delete</button>
              </td>`
            : ''
        }
      </tr>`
      )
      .join('');

    if (isAdmin) {
      tbody.querySelectorAll('[data-edit]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const ev = events.find((e) => String(e.id) === btn.dataset.edit);
          this.renderForm(document.getElementById('formPanel'), ev);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        })
      );
      tbody.querySelectorAll('[data-del]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this event?')) return;
          try {
            await Api.del(`/events/${btn.dataset.del}`);
            await this.loadRows();
          } catch (err) {
            this.showAlert(err.message);
          }
        })
      );
    }
  },

  renderForm(panel, ev) {
    if (!panel) return;
    const isEdit = !!ev;
    panel.innerHTML = `
      <div class="panel-header"><h3>${isEdit ? 'Edit Event' : 'Add Event'}</h3></div>
      <form id="eventForm">
        <div class="form-grid">
          <div class="field"><label>Title</label><input id="f_title" required value="${Util.escapeHtml(ev?.title || '')}" /></div>
          <div class="field"><label>Date</label><input id="f_date" type="date" required value="${ev?.event_date || Util.todayISO()}" /></div>
          <div class="field"><label>Venue</label><input id="f_venue" value="${Util.escapeHtml(ev?.venue || '')}" /></div>
          <div class="field"><label>Budget</label><input id="f_budget" type="number" step="0.01" value="${ev?.budget ?? 0}" /></div>
        </div>
        <div class="field"><label>Description</label><textarea id="f_desc" rows="2">${Util.escapeHtml(ev?.description || '')}</textarea></div>
        <div class="toolbar mt-16">
          <button type="submit">${isEdit ? 'Save Changes' : 'Add Event'}</button>
          ${isEdit ? '<button type="button" class="secondary" id="cancelEdit">Cancel</button>' : ''}
        </div>
      </form>
    `;

    document.getElementById('eventForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        title: document.getElementById('f_title').value.trim(),
        event_date: document.getElementById('f_date').value,
        venue: document.getElementById('f_venue').value.trim(),
        budget: Number(document.getElementById('f_budget').value) || 0,
        description: document.getElementById('f_desc').value.trim(),
      };
      try {
        if (isEdit) {
          await Api.put(`/events/${ev.id}`, payload);
        } else {
          await Api.post('/events', payload);
        }
        this.renderForm(panel, null);
        await this.loadRows();
        this.showAlert(isEdit ? 'Event updated.' : 'Event added.', 'success');
      } catch (err) {
        this.showAlert(err.message);
      }
    });

    if (isEdit) {
      document.getElementById('cancelEdit').addEventListener('click', () => this.renderForm(panel, null));
    }
  },
};
