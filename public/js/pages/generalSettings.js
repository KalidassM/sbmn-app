window.GeneralSettingsPage = {
  async render(container) {
    container.innerHTML = `
      <h1>General Settings</h1>
      <p class="page-sub">Association-wide configuration</p>
      <div id="alertBox"></div>
      <div class="panel">
        <form id="settingsForm">
        <div class="panel-header"><h3>Association Profile</h3></div>
        <div class="form-grid">
          <div class="field"><label>App Name</label><input id="appName" placeholder="Sri Balamurugan Nagar Welfare Association" /></div>
          <div class="field"><label>Contact Email</label><input id="contactEmail" type="email" placeholder="e.g. association@example.com" /></div>
          <div class="field"><label>Phone Number</label><input id="phoneNumber" placeholder="e.g. +91 98765 43210" /></div>
          <div class="field"><label>Office Hours</label><input id="officeHours" placeholder="e.g. Every Sunday, 5 PM - 6 PM" /></div>
        </div>
        <div class="field"><label>Office Address</label><input id="officeAddress" placeholder="Street, area, city, PIN" /></div>
        <p class="text-muted" style="font-size:0.85rem;">Contact Email also receives an email notification whenever a member's maintenance payment is recorded (see SMTP Settings below).</p>

        <div class="panel-header" style="margin-top:20px;"><h3>Monthly Maintenance</h3></div>
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

        <div class="panel-header" style="margin-top:20px;"><h3>SMTP Settings <span id="smtpBadge"></span></h3></div>
        <div class="form-grid">
          <div class="field"><label>SMTP Host</label><input id="smtpHost" placeholder="e.g. smtp.gmail.com" /></div>
          <div class="field"><label>SMTP Port</label><input id="smtpPort" type="number" placeholder="587 or 465" /></div>
          <div class="field"><label>SMTP Username</label><input id="smtpUser" placeholder="usually your full email address" /></div>
          <div class="field"><label>SMTP Password</label><input id="smtpPassword" type="password" placeholder="leave blank to keep current" /></div>
        </div>
        <div class="field"><label>From Email (optional, defaults to username)</label><input id="smtpFromEmail" type="email" /></div>
        <p class="text-muted" style="font-size:0.85rem;">Used to send the payment-received notification above. Most providers (Gmail, Zoho, Outlook) require an app-specific password, not your normal login password.</p>

        <div class="toolbar mt-16">
          <button type="submit">Save</button>
          <button type="button" class="secondary" id="testEmailBtn">Send Test Email</button>
        </div>
        </form>
      </div>
    `;

    const settings = await Api.get('/general-settings');
    document.getElementById('appName').value = settings.app_name || '';
    document.getElementById('contactEmail').value = settings.contact_email || '';
    document.getElementById('phoneNumber').value = settings.phone_number || '';
    document.getElementById('officeHours').value = settings.office_hours || '';
    document.getElementById('officeAddress').value = settings.office_address || '';
    document.getElementById('maintenanceAmount').value = settings.maintenance_amount || '';
    document.getElementById('openingBankBalance').value = settings.opening_bank_balance || 0;
    document.getElementById('openingPettyCashBalance').value = settings.opening_petty_cash_balance || 0;
    document.getElementById('smtpHost').value = settings.smtp_host || '';
    document.getElementById('smtpPort').value = settings.smtp_port || '';
    document.getElementById('smtpUser').value = settings.smtp_user || '';
    document.getElementById('smtpFromEmail').value = settings.smtp_from_email || '';
    document.getElementById('smtpBadge').innerHTML = settings.smtp_configured
      ? '<span class="badge active">configured</span>'
      : '<span class="badge unpaid">not configured</span>';

    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Api.put('/general-settings', {
          maintenance_amount: Number(document.getElementById('maintenanceAmount').value),
          opening_bank_balance: Number(document.getElementById('openingBankBalance').value) || 0,
          opening_petty_cash_balance: Number(document.getElementById('openingPettyCashBalance').value) || 0,
          app_name: document.getElementById('appName').value.trim(),
          contact_email: document.getElementById('contactEmail').value.trim(),
          phone_number: document.getElementById('phoneNumber').value.trim(),
          office_hours: document.getElementById('officeHours').value.trim(),
          office_address: document.getElementById('officeAddress').value.trim(),
          smtp_host: document.getElementById('smtpHost').value.trim(),
          smtp_port: document.getElementById('smtpPort').value ? Number(document.getElementById('smtpPort').value) : null,
          smtp_user: document.getElementById('smtpUser').value.trim(),
          smtp_password: document.getElementById('smtpPassword').value,
          smtp_from_email: document.getElementById('smtpFromEmail').value.trim(),
        });
        this.showAlert('Saved.', 'success');
        this.render(container);
      } catch (err) {
        this.showAlert(err.message);
      }
    });

    document.getElementById('testEmailBtn').addEventListener('click', async () => {
      const btn = document.getElementById('testEmailBtn');
      btn.disabled = true;
      try {
        const result = await Api.post('/general-settings/test-email');
        this.showAlert(`Test email sent to ${result.to}. Check the inbox.`, 'success');
      } catch (err) {
        this.showAlert(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  },

  showAlert(message, type = 'error') {
    const box = document.getElementById('alertBox');
    if (box) box.innerHTML = `<div class="alert ${type}">${Util.escapeHtml(message)}</div>`;
  },
};
