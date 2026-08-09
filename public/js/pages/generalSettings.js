window.GeneralSettingsPage = {
  async render(container) {
    container.innerHTML = `
      <h1>General Settings</h1>
      <p class="page-sub">Association-wide configuration</p>
      <div id="alertBox"></div>
      <div class="panel">
        <div class="panel-header"><h3>Monthly Maintenance</h3></div>
        <form id="settingsForm">
          <div class="form-grid">
            <div class="field"><label>Maintenance Dues Amount (₹ per member/month)</label><input id="maintenanceAmount" type="number" step="0.01" min="0" required /></div>
            <div class="field"><button type="submit">Save</button></div>
          </div>
        </form>
        <p class="text-muted" style="font-size:0.85rem;">This amount is applied automatically each month to generate maintenance dues for every active member — no manual step needed on the Maintenance page.</p>
      </div>
    `;

    const settings = await Api.get('/general-settings');
    document.getElementById('maintenanceAmount').value = settings.maintenance_amount || '';

    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Api.put('/general-settings', { maintenance_amount: Number(document.getElementById('maintenanceAmount').value) });
        this.showAlert('Saved.', 'success');
      } catch (err) {
        this.showAlert(err.message);
      }
    });
  },

  showAlert(message, type = 'error') {
    const box = document.getElementById('alertBox');
    if (box) box.innerHTML = `<div class="alert ${type}">${Util.escapeHtml(message)}</div>`;
  },
};
