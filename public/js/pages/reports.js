window.ReportsPage = {
  state: { fy: null },
  summary: null,

  // Indian FY runs April-March; if we're before April, the current FY started last calendar year
  getFyOptions() {
    const now = new Date();
    const currentFyStart = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    return Array.from({ length: 6 }, (_, i) => currentFyStart - i).map(
      (y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`
    );
  },

  async render(container) {
    const fyOptions = this.getFyOptions();
    if (!this.state.fy) this.state.fy = fyOptions[0];

    container.innerHTML = `
      <h1>ITR Report</h1>
      <p class="page-sub">Income &amp; expense summary for the association's financial year — use it as supporting record when filing the ITR manually (or hand it to your CA). This app does not connect to or file with the Income Tax e-filing portal.</p>
      <div id="alertBox"></div>

      <div class="panel">
        <div class="panel-header">
          <h3>Financial Year</h3>
          <div class="toolbar">
            <select id="fySelect">${fyOptions.map((fy) => `<option value="${fy}" ${fy === this.state.fy ? 'selected' : ''}>FY ${fy}</option>`).join('')}</select>
            <button type="button" class="secondary" id="exportCsvBtn">Export CSV</button>
            <button type="button" class="secondary" id="exportPdfBtn">Export PDF</button>
          </div>
        </div>
        <div id="summaryBox">Loading…</div>
      </div>
    `;

    document.getElementById('fySelect').addEventListener('change', (e) => {
      this.state.fy = e.target.value;
      this.load();
    });
    document.getElementById('exportCsvBtn').addEventListener('click', () => this.exportCsv());
    document.getElementById('exportPdfBtn').addEventListener('click', () => this.exportPdf());

    await this.load();
  },

  showAlert(message, type = 'error') {
    const box = document.getElementById('alertBox');
    if (box) box.innerHTML = `<div class="alert ${type}">${Util.escapeHtml(message)}</div>`;
  },

  async load() {
    try {
      this.summary = await Api.get(`/reports/itr-summary?fy=${this.state.fy}`);
      this.renderSummary();
    } catch (err) {
      this.showAlert(err.message);
    }
  },

  renderSummary() {
    const s = this.summary;
    const box = document.getElementById('summaryBox');
    if (!box || !s) return;
    const assoc = s.association || {};
    box.innerHTML = `
      <div class="mb-16">
        <strong>${Util.escapeHtml(assoc.app_name || 'Association')}</strong><br/>
        <span class="text-muted">${Util.escapeHtml(assoc.office_address || '')}</span><br/>
        <span class="text-muted">Period: ${Util.formatDate(s.dateRange.start)} – ${Util.formatDate(s.dateRange.end)} (FY ${s.fy})</span>
      </div>

      <h4>Income</h4>
      <table>
        <tbody>
          <tr><td>Maintenance dues collected</td><td>${Util.money(s.income.maintenance)}</td></tr>
          <tr><td>Donations received</td><td>${Util.money(s.income.donations)}</td></tr>
          <tr><td><strong>Total Income</strong></td><td><strong>${Util.money(s.income.total)}</strong></td></tr>
        </tbody>
      </table>

      <h4>Expenses</h4>
      <table>
        <tbody>
          ${
            s.expenses.byCategory.length
              ? s.expenses.byCategory.map((c) => `<tr><td>${Util.escapeHtml(c.category)}</td><td>${Util.money(c.amount)}</td></tr>`).join('')
              : '<tr><td colspan="2">No expenses recorded</td></tr>'
          }
          <tr><td><strong>Total Expenses</strong></td><td><strong>${Util.money(s.expenses.total)}</strong></td></tr>
        </tbody>
      </table>

      <h4>Net ${s.net >= 0 ? 'Surplus' : 'Deficit'}</h4>
      <p><strong>${Util.money(Math.abs(s.net))}</strong></p>
    `;
  },

  exportCsv() {
    const s = this.summary;
    if (!s) return;
    const rows = [
      [`${s.association.app_name || 'Association'} - Income & Expense Summary`],
      [`Financial Year: ${s.fy} (${s.dateRange.start} to ${s.dateRange.end})`],
      [],
      ['Income'],
      ['Maintenance dues collected', s.income.maintenance],
      ['Donations received', s.income.donations],
      ['Total Income', s.income.total],
      [],
      ['Expenses'],
      ...s.expenses.byCategory.map((c) => [c.category, c.amount]),
      ['Total Expenses', s.expenses.total],
      [],
      [s.net >= 0 ? 'Net Surplus' : 'Net Deficit', Math.abs(s.net)],
      [],
      ['Supporting detail: Maintenance payments'],
      ['Site No', 'Member', 'Amount Paid', 'Paid Date', 'Mode', 'Reference'],
      ...s.details.maintenancePayments.map((p) => [p.site_no || '', p.member_name, p.amount_paid, p.paid_date, p.payment_mode || '', p.reference_no || '']),
      [],
      ['Supporting detail: Donations'],
      ['Donor', 'Amount', 'Date', 'Purpose'],
      ...s.details.donations.map((d) => [d.donor_name || '', d.amount, d.donation_date, d.purpose || '']),
      [],
      ['Supporting detail: Expenses'],
      ['Title', 'Category', 'Amount', 'Date', 'Source', 'Notes'],
      ...s.details.expenses.map((e) => [e.title, e.category || '', e.amount, e.expense_date, e.source, e.notes || '']),
    ];
    Util.downloadCsv(`itr-summary-fy-${s.fy}.csv`, rows);
  },

  exportPdf() {
    const s = this.summary;
    if (!s) return;
    const columns = ['Item', 'Amount'];
    const rows = [
      ['Maintenance dues collected', Util.moneyPlain(s.income.maintenance)],
      ['Donations received', Util.moneyPlain(s.income.donations)],
      ['Total Income', Util.moneyPlain(s.income.total)],
      ...s.expenses.byCategory.map((c) => [c.category, Util.moneyPlain(c.amount)]),
      ['Total Expenses', Util.moneyPlain(s.expenses.total)],
      [s.net >= 0 ? 'Net Surplus' : 'Net Deficit', Util.moneyPlain(Math.abs(s.net))],
    ];
    Util.downloadPdf(
      `itr-summary-fy-${s.fy}.pdf`,
      `${s.association.app_name || 'Association'} - Income & Expense Summary (FY ${s.fy})`,
      columns,
      rows
    );
  },
};
