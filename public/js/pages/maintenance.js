window.MaintenancePage = {
  state: { month: new Date().getMonth() + 1, year: new Date().getFullYear() },

  async render(container) {
    const user = Api.getUser();
    const isAdmin = user.role === 'admin';
    const { month, year } = this.state;

    container.innerHTML = `
      <h1>Monthly Maintenance</h1>
      <p class="page-sub">Track maintenance dues collection</p>
      <div id="alertBox"></div>

      <div class="panel">
        <div class="panel-header">
          <h3>Maintenance Dues</h3>
          <div class="toolbar">
            <select id="monthSelect"></select>
            <select id="yearSelect"></select>
          </div>
        </div>
        ${isAdmin ? `
        <div class="form-grid" style="margin-bottom:14px;">
          <div class="field"><label>Amount per member (₹)</label><input id="amountInput" type="number" step="0.01" /></div>
          <div class="field"><button id="saveAmountBtn">Save Amount</button></div>
          <div class="field"><button id="generateBtn" class="secondary">Generate / Refresh Dues</button></div>
        </div>` : ''}
        <table>
          <thead><tr><th>Member</th><th>Amount Due</th><th>Amount Paid</th><th>Paid Date</th><th>Status</th><th></th></tr></thead>
          <tbody id="paymentRows"><tr><td colspan="6">Loading…</td></tr></tbody>
        </table>
      </div>
    `;

    this.populateMonthYearSelects();
    document.getElementById('monthSelect').addEventListener('change', (e) => {
      this.state.month = Number(e.target.value);
      this.loadDues();
    });
    document.getElementById('yearSelect').addEventListener('change', (e) => {
      this.state.year = Number(e.target.value);
      this.loadDues();
    });

    if (isAdmin) {
      document.getElementById('saveAmountBtn').addEventListener('click', () => this.saveAmount());
      document.getElementById('generateBtn').addEventListener('click', () => this.generateDues());
    }

    await this.loadDues();
  },

  showAlert(message, type = 'error') {
    const box = document.getElementById('alertBox');
    if (box) box.innerHTML = `<div class="alert ${type}">${Util.escapeHtml(message)}</div>`;
  },

  populateMonthYearSelects() {
    const monthSelect = document.getElementById('monthSelect');
    const yearSelect = document.getElementById('yearSelect');
    monthSelect.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1)
      .map((m) => `<option value="${m}" ${m === this.state.month ? 'selected' : ''}>${Util.monthName(m)}</option>`)
      .join('');
    const thisYear = new Date().getFullYear();
    const years = [thisYear - 1, thisYear, thisYear + 1];
    yearSelect.innerHTML = years
      .map((y) => `<option value="${y}" ${y === this.state.year ? 'selected' : ''}>${y}</option>`)
      .join('');
  },

  async saveAmount() {
    const amount = Number(document.getElementById('amountInput').value);
    if (!amount || amount <= 0) return this.showAlert('Enter a valid amount');
    try {
      await Api.post('/maintenance/settings', { month: this.state.month, year: this.state.year, amount });
      this.showAlert('Maintenance amount saved. Click "Generate / Refresh Dues" to apply it to members.', 'success');
    } catch (err) {
      this.showAlert(err.message);
    }
  },

  async generateDues() {
    try {
      await Api.post('/maintenance/generate', { month: this.state.month, year: this.state.year });
      await this.loadDues();
      this.showAlert('Dues generated for active members.', 'success');
    } catch (err) {
      this.showAlert(err.message);
    }
  },

  async loadDues() {
    const user = Api.getUser();
    const isAdmin = user.role === 'admin';
    const { month, year } = this.state;

    const settings = await Api.get('/maintenance/settings');
    const setting = settings.find((s) => s.month === month && s.year === year);
    if (isAdmin) {
      const amountInput = document.getElementById('amountInput');
      if (amountInput) amountInput.value = setting ? setting.amount : '';
    }

    let payments = await Api.get(`/maintenance/payments?month=${month}&year=${year}`);
    if (!isAdmin && user.member_id) {
      payments = payments.filter((p) => p.member_id === user.member_id);
    }
    const rows = document.getElementById('paymentRows');
    if (!payments.length) {
      rows.innerHTML = `<tr class="empty-row"><td colspan="6">No dues recorded for this month yet${isAdmin ? ' — set an amount and click Generate' : ''}</td></tr>`;
      return;
    }
    rows.innerHTML = payments
      .map(
        (p) => `
      <tr>
        <td>${Util.escapeHtml(p.member_name)}</td>
        <td>${Util.money(p.amount_due)}</td>
        <td>${Util.money(p.amount_paid)}</td>
        <td>${p.paid_date || '-'}</td>
        <td><span class="badge ${p.status}">${p.status}</span></td>
        <td class="toolbar">
          ${p.status !== 'paid' ? `<button class="small" data-pay="${p.id}">Pay Now</button>` : ''}
          ${isAdmin && p.status !== 'paid' ? `<button class="small secondary" data-mark-paid="${p.id}">Mark Paid</button>` : ''}
        </td>
      </tr>`
      )
      .join('');

    rows.querySelectorAll('[data-pay]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const payment = payments.find((p) => String(p.id) === btn.dataset.pay);
        this.showPayModal(payment);
      })
    );

    if (isAdmin) {
      rows.querySelectorAll('[data-mark-paid]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          const payment = payments.find((p) => String(p.id) === btn.dataset.markPaid);
          try {
            await Api.put(`/maintenance/payments/${payment.id}`, {
              amount_paid: payment.amount_due,
              status: 'paid',
              paid_date: Util.todayISO(),
            });
            await this.loadDues();
          } catch (err) {
            this.showAlert(err.message);
          }
        })
      );
    }
  },

  async showPayModal(payment) {
    const remaining = Number(payment.amount_due) - Number(payment.amount_paid);
    const note = `Maintenance ${Util.monthName(payment.month)} ${payment.year} - ${payment.member_name}`;
    Util.openModal(`
      <h3>Pay Maintenance Due</h3>
      <p class="text-muted">${Util.escapeHtml(payment.member_name)} — ${Util.monthName(payment.month)} ${payment.year}</p>
      <p style="font-size:1.4rem;font-weight:700;color:var(--primary-dark);">${Util.money(remaining)}</p>
      <div id="gatewayContent"></div>
      <div id="qrToggleWrap" class="mt-16"><button type="button" class="secondary small" id="toggleQrBtn">Or pay by scanning a UPI QR code</button></div>
      <div id="qrContent"></div>
      <div class="toolbar close-modal mt-16" style="justify-content:center;">
        <button class="secondary" id="closeModalBtn">Close</button>
      </div>
    `);
    document.getElementById('closeModalBtn').addEventListener('click', () => Util.closeModal());
    document.getElementById('toggleQrBtn').addEventListener('click', () => this.loadQr(payment, remaining, note));

    const gatewayBox = document.getElementById('gatewayContent');
    try {
      const config = await Api.get('/payments/razorpay/config');
      if (config.configured) {
        gatewayBox.innerHTML = `<button id="payOnlineBtn" style="width:100%;">Pay Online Now (Card / UPI / NetBanking)</button>`;
        document.getElementById('payOnlineBtn').addEventListener('click', () => this.payWithRazorpay(payment, remaining, note));
        document.getElementById('qrToggleWrap').querySelector('button').textContent = 'Or scan a UPI QR code instead';
      } else {
        // Gateway isn't set up yet — go straight to the UPI QR path
        document.getElementById('qrToggleWrap').style.display = 'none';
        await this.loadQr(payment, remaining, note);
      }
    } catch (err) {
      gatewayBox.innerHTML = `<div class="alert error">${Util.escapeHtml(err.message)}</div>`;
    }
  },

  async loadQr(payment, remaining, note) {
    document.getElementById('toggleQrBtn').style.display = 'none';
    const qrBox = document.getElementById('qrContent');
    qrBox.innerHTML = '<p class="text-muted">Loading QR code…</p>';
    try {
      const data = await Api.get(`/payment-settings/qr?amount=${remaining}&note=${encodeURIComponent(note)}`);
      qrBox.innerHTML = `
        <img src="${data.qrDataUrl}" alt="UPI QR code" width="220" height="220" />
        <p class="text-muted mt-16">Scan with any UPI app (GPay, PhonePe, Paytm...), or on your phone <a href="${Util.escapeHtml(data.upiUri)}">tap here to pay</a>.</p>
        <p class="text-muted" style="font-size:0.78rem;">After paying, let a core member know so they can mark this as paid.</p>
      `;
    } catch (err) {
      qrBox.innerHTML = `<div class="alert error">${Util.escapeHtml(err.message)}</div>`;
    }
  },

  async payWithRazorpay(payment, remaining, note) {
    const gatewayBox = document.getElementById('gatewayContent');
    try {
      const order = await Api.post('/payments/razorpay/order', { payment_id: payment.id });
      const rzp = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: order.payeeName,
        description: note,
        order_id: order.orderId,
        handler: async (response) => {
          gatewayBox.innerHTML = '<p class="text-muted">Verifying payment…</p>';
          try {
            await Api.post('/payments/razorpay/verify', {
              payment_id: payment.id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            Util.closeModal();
            await this.loadDues();
            this.showAlert('Payment received — marked as paid automatically.', 'success');
          } catch (err) {
            gatewayBox.innerHTML = `<div class="alert error">${Util.escapeHtml(err.message)}</div>`;
          }
        },
        modal: {
          ondismiss: () => {
            gatewayBox.innerHTML = `<button id="payOnlineBtn" style="width:100%;">Pay Online Now (Card / UPI / NetBanking)</button>`;
            document.getElementById('payOnlineBtn').addEventListener('click', () => this.payWithRazorpay(payment, remaining, note));
          },
        },
        theme: { color: '#2f6f4e' },
      });
      rzp.open();
    } catch (err) {
      gatewayBox.innerHTML = `<div class="alert error">${Util.escapeHtml(err.message)}</div>`;
    }
  },

};
