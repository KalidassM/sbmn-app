window.GeneralSettingsPage = {
  async render(container) {
    container.innerHTML = `
      <h1>General Settings</h1>
      <p class="page-sub">Association-wide configuration</p>
      <div id="alertBox"></div>
      <form id="settingsForm">
        <div class="panel">
          <div class="panel-header"><h3>Association Profile</h3></div>
          <div class="form-grid">
            <div class="field"><label>App Name</label><input id="appName" placeholder="Sri Balamurugan Nagar Welfare Association" /></div>
            <div class="field"><label>Contact Email</label><input id="contactEmail" type="email" placeholder="e.g. association@example.com" /></div>
            <div class="field"><label>Phone Number</label><input id="phoneNumber" placeholder="e.g. +91 98765 43210" /></div>
            <div class="field"><label>Office Hours</label><input id="officeHours" placeholder="e.g. Every Sunday, 5 PM - 6 PM" /></div>
          </div>
          <div class="field"><label>Office Address</label><input id="officeAddress" placeholder="Street, area, city, PIN" /></div>
          <p class="text-muted" style="font-size:0.85rem;">Contact Email also receives an email notification whenever a member's maintenance payment is recorded (see Email Settings below).</p>
        </div>

        <div class="panel">
          <div class="panel-header"><h3>Monthly Maintenance</h3></div>
          <div class="form-grid">
            <div class="field"><label>Maintenance Dues Amount (₹ per member/month)</label><input id="maintenanceAmount" type="number" step="0.01" min="0" required /></div>
          </div>
          <p class="text-muted" style="font-size:0.85rem;">Applied automatically each month to generate maintenance dues for every active member — no manual step needed on the Maintenance page.</p>
        </div>

        <div class="panel">
          <div class="panel-header"><h3>Reminder Schedule</h3></div>
          <div class="field"><label>Days of the month to send WhatsApp reminders on</label>
            <div id="reminderDaysGrid" style="display:grid;grid-template-columns:repeat(7, 1fr);gap:6px;max-width:420px;">
              ${Array.from({ length: 31 }, (_, i) => i + 1)
                .map(
                  (d) => `
                <label style="display:flex;align-items:center;gap:4px;font-weight:normal;font-size:0.85rem;">
                  <input type="checkbox" class="reminderDay" value="${d}" /> ${d}
                </label>`
                )
                .join('')}
            </div>
          </div>
          <div class="form-grid">
            <div class="field"><label>Time to send (IST)</label><input id="reminderTime" type="time" required /></div>
          </div>
          <p class="text-muted" style="font-size:0.85rem;">On each checked day, once this time passes (India time), every member with an unpaid due for that month gets a WhatsApp reminder automatically — see the WhatsApp Reminders section below to link the account it sends from.</p>
        </div>

        <div class="panel">
          <div class="panel-header"><h3>Opening Balances</h3></div>
          <div class="form-grid">
            <div class="field"><label>Opening Bank Balance (₹, before digital tracking started)</label><input id="openingBankBalance" type="number" step="0.01" min="0" /></div>
            <div class="field"><label>Opening Petty Cash Balance (₹, before digital tracking started)</label><input id="openingPettyCashBalance" type="number" step="0.01" min="0" /></div>
          </div>
          <p class="text-muted" style="font-size:0.85rem;">Money already sitting in the bank account or petty cash box before this system started recording transactions. Added into the Dashboard's Net Balance and the Petty Cash page's Cash in Hand figure.</p>
        </div>

        <div class="panel">
          <div class="panel-header"><h3>Email Settings (Resend) <span id="emailBadge"></span></h3></div>
          <div class="form-grid">
            <div class="field"><label>Resend API Key</label><input id="resendApiKey" type="password" placeholder="leave blank to keep current" /></div>
            <div class="field"><label>From Email</label><input id="resendFromEmail" type="email" placeholder="onboarding@resend.dev" /></div>
          </div>
          <p class="text-muted" style="font-size:0.85rem;">Used to send the payment-received notification above, via <a href="https://resend.com" target="_blank">Resend</a>'s free tier. Get an API key from resend.com/api-keys. Leave From Email blank to use Resend's shared sandbox sender (<code>onboarding@resend.dev</code>) &mdash; no domain setup needed to get started; verify your own domain in Resend later if you want to send from your association's own address.</p>
          <div class="toolbar mt-16">
            <button type="submit">Save</button>
            <button type="button" class="secondary" id="testEmailBtn">Send Test Email</button>
          </div>
        </div>
      </form>

      <div class="panel">
        <div class="panel-header"><h3>WhatsApp Reminders <span id="waBadge"></span></h3></div>
        <p class="text-muted" style="font-size:0.85rem;">
          Automatically sends a WhatsApp reminder to every member with an unpaid due, on the days/time set under Reminder Schedule above.
          This links your own WhatsApp account (like WhatsApp Web) rather than using WhatsApp's official Business API &mdash;
          simpler to set up, but it's against WhatsApp's terms for automated messaging and carries a real risk of the linked number being flagged or banned.
        </p>
        <div id="waContent"></div>
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
    document.getElementById('resendFromEmail').value = settings.resend_from_email || '';
    document.getElementById('emailBadge').innerHTML = settings.email_configured
      ? '<span class="badge active">configured</span>'
      : '<span class="badge unpaid">not configured</span>';
    document.getElementById('reminderTime').value = settings.reminder_time || '10:00';
    const selectedDays = new Set((settings.reminder_days || '1,2,3,4,5,7,10').split(',').map((d) => d.trim()));
    document.querySelectorAll('.reminderDay').forEach((cb) => {
      cb.checked = selectedDays.has(cb.value);
    });

    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const reminderDays = Array.from(document.querySelectorAll('.reminderDay:checked')).map((cb) => cb.value);
      if (!reminderDays.length) {
        this.showAlert('Pick at least one reminder day');
        return;
      }
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
          resend_api_key: document.getElementById('resendApiKey').value,
          resend_from_email: document.getElementById('resendFromEmail').value.trim(),
          reminder_days: reminderDays.join(','),
          reminder_time: document.getElementById('reminderTime').value,
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

    this.pollWhatsAppStatus();
  },

  clearWhatsAppPoll() {
    if (this.waPollTimer) clearTimeout(this.waPollTimer);
    this.waPollTimer = null;
  },

  async pollWhatsAppStatus() {
    this.clearWhatsAppPoll();
    const badge = document.getElementById('waBadge');
    const content = document.getElementById('waContent');
    if (!badge || !content) return; // navigated away

    let result;
    try {
      result = await Api.get('/whatsapp/status');
    } catch (err) {
      content.innerHTML = `<div class="alert error">${Util.escapeHtml(err.message)}</div>`;
      return;
    }

    if (result.status === 'connected') {
      badge.innerHTML = '<span class="badge active">connected</span>';
      content.innerHTML = `
        <p class="text-muted" style="font-size:0.85rem;">Linked and ready. Reminders will send automatically on the scheduled days.</p>
        <div class="toolbar">
          <input type="tel" id="waTestPhone" placeholder="e.g. 9876543210" style="max-width:240px;" />
          <button type="button" class="secondary" id="waTestBtn">Send Test Message</button>
          <button type="button" class="secondary" id="waLogoutBtn">Unlink WhatsApp</button>
        </div>
      `;
      document.getElementById('waTestBtn').addEventListener('click', async () => {
        const phone = document.getElementById('waTestPhone').value.trim();
        if (!phone) return;
        const btn = document.getElementById('waTestBtn');
        btn.disabled = true;
        try {
          await Api.post('/whatsapp/test', { phone });
          this.showAlert(`Test message sent to ${phone}.`, 'success');
        } catch (err) {
          this.showAlert(err.message);
        } finally {
          btn.disabled = false;
        }
      });
      document.getElementById('waLogoutBtn').addEventListener('click', async () => {
        if (!confirm('Unlink WhatsApp? Automatic reminders will stop until you scan a new QR code.')) return;
        await Api.post('/whatsapp/logout');
        this.pollWhatsAppStatus();
      });
      return; // no need to keep polling once connected
    }

    if (result.status === 'qr' && result.qr) {
      badge.innerHTML = '<span class="badge unpaid">scan to link</span>';
      content.innerHTML = `
        <p class="text-muted" style="font-size:0.85rem;">Open WhatsApp on the phone you want to send reminders from &rarr; Settings &rarr; Linked Devices &rarr; Link a Device, then scan this code.</p>
        <img src="${result.qr}" alt="WhatsApp QR code" style="width:220px;height:220px;" />
      `;
    } else {
      badge.innerHTML = '<span class="badge unpaid">not linked</span>';
      content.innerHTML = `<p class="text-muted" style="font-size:0.85rem;">Connecting&hellip; a QR code will appear here shortly.</p>`;
    }

    this.waPollTimer = setTimeout(() => this.pollWhatsAppStatus(), 3000);
  },

  showAlert(message, type = 'error') {
    const box = document.getElementById('alertBox');
    if (box) box.innerHTML = `<div class="alert ${type}">${Util.escapeHtml(message)}</div>`;
  },
};
