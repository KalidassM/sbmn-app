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
          </div>
          <p class="text-muted" style="font-size:0.85rem;">Applied automatically each month to generate maintenance dues for every active member — no manual step needed on the Maintenance page.</p>

          <div class="panel-header" style="margin-top:20px;"><h3>Opening Balances</h3></div>
          <div class="form-grid">
            <div class="field"><label>Opening Bank Balance (₹, before digital tracking started)</label><input id="openingBankBalance" type="number" step="0.01" min="0" /></div>
            <div class="field"><label>Opening Petty Cash Balance (₹, before digital tracking started)</label><input id="openingPettyCashBalance" type="number" step="0.01" min="0" /></div>
          </div>
          <p class="text-muted" style="font-size:0.85rem;">Money already sitting in the bank account or petty cash box before this system started recording transactions. Added into the Dashboard's Net Balance and the Petty Cash page's Cash in Hand figure.</p>

          <div class="toolbar mt-16"><button type="submit">Save</button></div>
        </form>
      </div>
    `;

    const settings = await Api.get('/general-settings');
    document.getElementById('maintenanceAmount').value = settings.maintenance_amount || '';
    document.getElementById('openingBankBalance').value = settings.opening_bank_balance || 0;
    document.getElementById('openingPettyCashBalance').value = settings.opening_petty_cash_balance || 0;

    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Api.put('/general-settings', {
          maintenance_amount: Number(document.getElementById('maintenanceAmount').value),
          opening_bank_balance: Number(document.getElementById('openingBankBalance').value) || 0,
          opening_petty_cash_balance: Number(document.getElementById('openingPettyCashBalance').value) || 0,
        });
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
