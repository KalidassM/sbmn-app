window.MaintenancePage = {
  state: { month: new Date().getMonth() + 1, year: new Date().getFullYear(), statusFilter: 'all' },
  currentPayments: [],
  selectedIds: new Set(),

  async render(container) {
    const user = Api.getUser();
    const isAdmin = Util.isAdmin(user);
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
            ${isAdmin ? '<button class="secondary" id="bulkMarkPaidBtn">Mark Selected as Paid</button>' : ''}
          </div>
        </div>
        <table>
          <thead><tr>${isAdmin ? '<th><input type="checkbox" id="selectAllRows" /></th>' : ''}<th>Site No</th><th>Member</th><th>Amount Due</th><th>Amount Paid</th><th>Paid Date</th><th>Mode</th><th>Reference</th><th>Status</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
          <tbody id="paymentRows"><tr><td colspan="10">Loading…</td></tr></tbody>
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
      document.getElementById('bulkMarkPaidBtn').addEventListener('click', () => this.bulkMarkPaid());
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
    if (!Util.isAdmin(user) && user.member_id) {
      payments = payments.filter((p) => p.member_id === user.member_id);
    }
    this.currentPayments = payments;
    this.selectedIds.clear();
    this.renderRows();
  },

  async bulkMarkPaid() {
    if (!this.selectedIds.size) {
      this.showAlert('Select one or more unpaid/partial dues first');
      return;
    }
    if (!confirm(`Mark ${this.selectedIds.size} due(s) as fully paid?`)) return;
    const btn = document.getElementById('bulkMarkPaidBtn');
    btn.disabled = true;
    try {
      const result = await Api.post('/maintenance/payments/bulk-mark-paid', { ids: Array.from(this.selectedIds) });
      this.showAlert(`${result.updated} due(s) marked as paid.`, 'success');
      await this.loadDues();
    } catch (err) {
      this.showAlert(err.message);
    } finally {
      btn.disabled = false;
    }
  },

  renderRows() {
    const user = Api.getUser();
    const isAdmin = Util.isAdmin(user);
    const filter = this.state.statusFilter;
    const statusRank = { paid: 0, partial: 1, unpaid: 2 };
    const payments = (filter === 'all' ? this.currentPayments : this.currentPayments.filter((p) => p.status === filter))
      .slice()
      .sort((a, b) => statusRank[a.status] - statusRank[b.status]);

    const rows = document.getElementById('paymentRows');
    if (!payments.length) {
      rows.innerHTML = `<tr class="empty-row"><td colspan="10">No dues match this view</td></tr>`;
      return;
    }
    rows.innerHTML = payments
      .map(
        (p) => `
      <tr>
        ${
          isAdmin
            ? `<td>${p.status !== 'paid' ? `<input type="checkbox" class="rowSelect" value="${p.id}" ${this.selectedIds.has(p.id) ? 'checked' : ''} />` : ''}</td>`
            : ''
        }
        <td>${Util.escapeHtml(p.site_no || '-')}</td>
        <td>${Util.escapeHtml(p.member_name)}</td>
        <td>${Util.money(p.amount_due)}</td>
        <td>${Util.money(p.amount_paid)}</td>
        <td>${p.paid_date || '-'}</td>
        <td>${Util.escapeHtml(p.payment_mode || '-')}</td>
        <td>${Util.escapeHtml(p.reference_no || '-')}</td>
        <td><span class="badge ${p.status}">${p.status}</span></td>
        ${
          isAdmin
            ? `<td class="toolbar">
                <button class="small secondary" data-edit="${p.id}">Edit</button>
                <button class="small danger" data-delete="${p.id}">Delete</button>
              </td>`
            : ''
        }
      </tr>`
      )
      .join('');

    if (isAdmin) {
      rows.querySelectorAll('[data-edit]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const payment = this.currentPayments.find((x) => String(x.id) === btn.dataset.edit);
          this.showEditModal(payment);
        })
      );
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
      rows.querySelectorAll('.rowSelect').forEach((cb) =>
        cb.addEventListener('change', () => {
          const id = Number(cb.value);
          if (cb.checked) this.selectedIds.add(id);
          else this.selectedIds.delete(id);
          const selectAll = document.getElementById('selectAllRows');
          if (selectAll) selectAll.checked = rows.querySelectorAll('.rowSelect').length === rows.querySelectorAll('.rowSelect:checked').length;
        })
      );
      const selectAll = document.getElementById('selectAllRows');
      if (selectAll) {
        selectAll.checked = false;
        selectAll.onchange = () => {
          rows.querySelectorAll('.rowSelect').forEach((cb) => {
            cb.checked = selectAll.checked;
            const id = Number(cb.value);
            if (selectAll.checked) this.selectedIds.add(id);
            else this.selectedIds.delete(id);
          });
        };
      }
    }
  },

  showEditModal(payment) {
    Util.openModal(`
      <h3>Edit Due</h3>
      <p class="text-muted">${Util.escapeHtml(payment.site_no || '-')} — ${Util.escapeHtml(payment.member_name)} — ${Util.monthName(payment.month)} ${payment.year}</p>
      <form id="editDueForm" style="text-align:left;">
        <div class="field"><label>Amount Due</label><input id="ed_amount_due" type="number" step="0.01" min="0" required value="${payment.amount_due}" /></div>
        <div class="field"><label>Amount Paid</label><input id="ed_amount_paid" type="number" step="0.01" min="0" required value="${payment.amount_paid}" /></div>
        <div class="field"><label>Status</label>
          <select id="ed_status">
            <option value="unpaid" ${payment.status === 'unpaid' ? 'selected' : ''}>Unpaid</option>
            <option value="partial" ${payment.status === 'partial' ? 'selected' : ''}>Partial</option>
            <option value="paid" ${payment.status === 'paid' ? 'selected' : ''}>Paid</option>
          </select>
        </div>
        <div class="field"><label>Paid Date</label><input id="ed_date" type="date" value="${payment.paid_date || ''}" /></div>
        <div class="field"><label>Payment Mode</label>
          <select id="ed_mode">
            <option value="" ${!payment.payment_mode ? 'selected' : ''}>-</option>
            <option value="Cash" ${payment.payment_mode === 'Cash' ? 'selected' : ''}>Cash</option>
            <option value="UPI" ${payment.payment_mode === 'UPI' ? 'selected' : ''}>UPI</option>
            <option value="Card" ${payment.payment_mode === 'Card' ? 'selected' : ''}>Card</option>
            <option value="Bank Transfer" ${payment.payment_mode === 'Bank Transfer' ? 'selected' : ''}>Bank Transfer</option>
            <option value="Cheque" ${payment.payment_mode === 'Cheque' ? 'selected' : ''}>Cheque</option>
            <option value="Razorpay" ${payment.payment_mode === 'Razorpay' ? 'selected' : ''}>Razorpay</option>
            <option value="Other" ${payment.payment_mode === 'Other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="field"><label>Transaction / Reference No</label><input id="ed_reference" value="${Util.escapeHtml(payment.reference_no || '')}" /></div>
        <div class="toolbar close-modal mt-16" style="justify-content:center;">
          <button type="submit">Save</button>
          <button type="button" class="secondary" id="closeEditModalBtn">Cancel</button>
        </div>
      </form>
    `);
    document.getElementById('closeEditModalBtn').addEventListener('click', () => Util.closeModal());
    document.getElementById('editDueForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const amountDue = Number(document.getElementById('ed_amount_due').value);
      const amountPaid = Number(document.getElementById('ed_amount_paid').value);
      const status = document.getElementById('ed_status').value;
      const paidDate = document.getElementById('ed_date').value || null;
      const paymentMode = document.getElementById('ed_mode').value;
      const referenceNo = document.getElementById('ed_reference').value.trim();
      try {
        await Api.put(`/maintenance/payments/${payment.id}`, {
          amount_due: amountDue,
          amount_paid: amountPaid,
          status,
          paid_date: paidDate,
          payment_mode: paymentMode || null,
          reference_no: referenceNo || null,
        });
        Util.closeModal();
        await this.loadDues();
        this.showAlert('Due updated.', 'success');
      } catch (err) {
        this.showAlert(err.message);
      }
    });
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
