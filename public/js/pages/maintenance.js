window.MaintenancePage = {
  state: { month: new Date().getMonth() + 1, year: new Date().getFullYear(), statusFilter: 'all' },
  currentPayments: [],

  async render(container) {
    const user = Api.getUser();
    const isAdmin = user.role === 'admin';
    const { month, year } = this.state;

    container.innerHTML = `
      <h1>Monthly Maintenance</h1>
      <p class="page-sub">Track maintenance dues collection</p>
      ${!isAdmin ? `<p class="page-sub" style="margin-top:-14px;">Want to pay online yourself? Visit <a href="/pay-monthly-maintenance" target="_blank">the maintenance payment page</a>.</p>` : ''}
      <div id="alertBox"></div>

      <div class="panel">
        <div class="panel-header">
          <h3>Maintenance Dues</h3>
          <div class="toolbar">
            <select id="monthSelect"></select>
            <select id="yearSelect"></select>
            <select id="statusFilter">
              <option value="all">All</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
            ${isAdmin ? '<button id="recordPaymentBtn">Record Payment</button>' : ''}
          </div>
        </div>
        <table>
          <thead><tr><th>Site No</th><th>Member</th><th>Amount Due</th><th>Amount Paid</th><th>Paid Date</th><th>Mode</th><th>Reference</th><th>Status</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
          <tbody id="paymentRows"><tr><td colspan="9">Loading…</td></tr></tbody>
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
    document.getElementById('statusFilter').value = this.state.statusFilter;
    document.getElementById('statusFilter').addEventListener('change', (e) => {
      this.state.statusFilter = e.target.value;
      this.renderRows();
    });

    if (isAdmin) {
      document.getElementById('recordPaymentBtn').addEventListener('click', () => this.showRecordPaymentModal());
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

  async loadDues() {
    const { month, year } = this.state;
    let payments = await Api.get(`/maintenance/payments?month=${month}&year=${year}`);
    const user = Api.getUser();
    if (user.role !== 'admin' && user.member_id) {
      payments = payments.filter((p) => p.member_id === user.member_id);
    }
    this.currentPayments = payments;
    this.renderRows();
  },

  renderRows() {
    const user = Api.getUser();
    const isAdmin = user.role === 'admin';
    const filter = this.state.statusFilter;
    const payments = filter === 'all' ? this.currentPayments : this.currentPayments.filter((p) => p.status === filter);

    const rows = document.getElementById('paymentRows');
    if (!payments.length) {
      rows.innerHTML = `<tr class="empty-row"><td colspan="9">No dues match this view</td></tr>`;
      return;
    }
    rows.innerHTML = payments
      .map(
        (p) => `
      <tr>
        <td>${Util.escapeHtml(p.site_no || '-')}</td>
        <td>${Util.escapeHtml(p.member_name)}</td>
        <td>${Util.money(p.amount_due)}</td>
        <td>${Util.money(p.amount_paid)}</td>
        <td>${p.paid_date || '-'}</td>
        <td>${Util.escapeHtml(p.payment_mode || '-')}</td>
        <td>${Util.escapeHtml(p.reference_no || '-')}</td>
        <td><span class="badge ${p.status}">${p.status}</span></td>
        ${isAdmin ? `<td class="toolbar"><button class="small danger" data-delete="${p.id}">Delete</button></td>` : ''}
      </tr>`
      )
      .join('');

    if (isAdmin) {
      rows.querySelectorAll('[data-delete]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this due record? This cannot be undone.')) return;
          try {
            await Api.del(`/maintenance/payments/${btn.dataset.delete}`);
            await this.loadDues();
          } catch (err) {
            this.showAlert(err.message);
          }
        })
      );
    }
  },

  showRecordPaymentModal() {
    const unpaid = this.currentPayments.filter((p) => p.status !== 'paid');
    if (!unpaid.length) {
      this.showAlert('Everyone in this view has already paid in full.', 'success');
      return;
    }
    const options = unpaid
      .map((p) => {
        const remaining = Number(p.amount_due) - Number(p.amount_paid);
        return `<option value="${p.id}">${Util.escapeHtml(p.site_no || '-')} — ${Util.escapeHtml(p.member_name)} (${Util.money(remaining)} due)</option>`;
      })
      .join('');

    Util.openModal(`
      <h3>Record Payment</h3>
      <form id="recordPaymentForm" style="text-align:left;">
        <div class="field"><label>Member</label><select id="rp_payment" required>${options}</select></div>
        <div class="field"><label>Amount Paid</label><input id="rp_amount" type="number" step="0.01" min="0" required /></div>
        <div class="field"><label>Payment Date</label><input id="rp_date" type="date" required value="${Util.todayISO()}" /></div>
        <div class="field"><label>Payment Mode</label>
          <select id="rp_mode">
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
            <option value="Card">Card</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cheque">Cheque</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="field"><label>Transaction / Reference No (optional)</label><input id="rp_reference" placeholder="e.g. UPI ref, cheque no..." /></div>
        <p class="text-muted" style="font-size:0.8rem;">Use this for cash or bank-transfer payments collected outside the app. Enter less than the full amount to record a partial payment.</p>
        <div class="toolbar close-modal mt-16" style="justify-content:center;">
          <button type="submit">Save</button>
          <button type="button" class="secondary" id="closeRecordModalBtn">Cancel</button>
        </div>
      </form>
    `);

    const paymentSelect = document.getElementById('rp_payment');
    const amountInput = document.getElementById('rp_amount');
    const fillAmount = () => {
      const p = unpaid.find((x) => String(x.id) === paymentSelect.value);
      amountInput.value = p ? Number(p.amount_due) - Number(p.amount_paid) : '';
    };
    fillAmount();
    paymentSelect.addEventListener('change', fillAmount);

    document.getElementById('closeRecordModalBtn').addEventListener('click', () => Util.closeModal());
    document.getElementById('recordPaymentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payment = unpaid.find((x) => String(x.id) === paymentSelect.value);
      const amountPaid = Number(amountInput.value);
      const paidDate = document.getElementById('rp_date').value;
      const paymentMode = document.getElementById('rp_mode').value;
      const referenceNo = document.getElementById('rp_reference').value.trim();
      if (!payment || !paidDate || amountPaid < 0) return;
      const status = amountPaid >= Number(payment.amount_due) ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';
      try {
        await Api.put(`/maintenance/payments/${payment.id}`, {
          amount_paid: amountPaid,
          status,
          paid_date: paidDate,
          payment_mode: paymentMode,
          reference_no: referenceNo || null,
        });
        Util.closeModal();
        await this.loadDues();
        this.showAlert('Payment recorded.', 'success');
      } catch (err) {
        this.showAlert(err.message);
      }
    });
  },
};
