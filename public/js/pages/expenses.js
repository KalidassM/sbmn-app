window.ExpensesPage = {
  currentExpenses: [],
  currentTransactions: [],

  async render(container) {
    const user = Api.getUser();
    const isAdmin = Util.isAdmin(user);

    container.innerHTML = `
      <h1>Expenses & Petty Cash</h1>
      <p class="page-sub">Track association expenses and the day-to-day petty cash box</p>
      <div id="alertBox"></div>

      <div class="stat-grid" id="expenseSummary"></div>

      <div class="panel">
        <div class="panel-header">
          <h3>Expenses</h3>
          ${
            isAdmin
              ? `<div class="toolbar">
                  <button type="button" class="secondary" id="exportExpensesBtn">Export CSV</button>
                  <button type="button" class="secondary" id="exportExpensesPdfBtn">Export PDF</button>
                </div>`
              : ''
          }
        </div>
        ${isAdmin ? '<div id="expenseForm"></div>' : ''}
        <table>
          <thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Amount</th><th>Source</th><th>Notes</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
          <tbody id="expenseRows"><tr><td colspan="7">Loading…</td></tr></tbody>
        </table>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3>Petty Cash</h3>
          ${
            isAdmin
              ? `<div class="toolbar">
                  <button type="button" class="secondary" id="exportPettyCashBtn">Export CSV</button>
                  <button type="button" class="secondary" id="exportPettyCashPdfBtn">Export PDF</button>
                </div>`
              : ''
          }
        </div>
        <div class="stat-grid" id="pettyCashStats"></div>
        ${isAdmin ? '<div id="pettyCashForm"></div>' : ''}
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Category</th><th>Amount</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
          <tbody id="pettyCashRows"><tr><td colspan="6">Loading…</td></tr></tbody>
        </table>
      </div>
    `;

    if (isAdmin) {
      document.getElementById('exportExpensesBtn').addEventListener('click', () => this.exportExpensesCsv());
      document.getElementById('exportPettyCashBtn').addEventListener('click', () => this.exportPettyCashCsv());
      document.getElementById('exportExpensesPdfBtn').addEventListener('click', () => this.exportExpensesPdf());
      document.getElementById('exportPettyCashPdfBtn').addEventListener('click', () => this.exportPettyCashPdf());
    }

    if (isAdmin) {
      this.renderExpenseForm();
      this.renderPettyCashForm();
    }

    await Promise.all([this.loadExpenses(), this.loadPettyCash()]);
  },

  exportExpensesCsv() {
    const rows = [
      ['Date', 'Title', 'Category', 'Amount', 'Source', 'Notes'],
      ...this.currentExpenses.map((ex) => [ex.expense_date, ex.title, ex.category || '', ex.amount, ex.source === 'petty_cash' ? 'Petty Cash' : 'Bank', ex.notes || '']),
    ];
    Util.downloadCsv(`expenses-${Util.todayISO()}.csv`, rows);
  },

  exportPettyCashCsv() {
    const rows = [
      ['Date', 'Type', 'Description', 'Category', 'Amount'],
      ...this.currentTransactions.map((t) => [t.txn_date, t.type === 'topup' ? 'Top-up' : 'Expense', t.description, t.category || '', t.amount]),
    ];
    Util.downloadCsv(`petty-cash-${Util.todayISO()}.csv`, rows);
  },

  exportExpensesPdf() {
    const columns = ['Date', 'Title', 'Category', 'Amount', 'Source', 'Notes'];
    const rows = this.currentExpenses.map((ex) => [
      Util.formatDate(ex.expense_date),
      ex.title,
      ex.category || '-',
      Util.moneyPlain(ex.amount),
      ex.source === 'petty_cash' ? 'Petty Cash' : 'Bank',
      ex.notes || '-',
    ]);
    Util.downloadPdf(`expenses-${Util.todayISO()}.pdf`, 'Expenses Report', columns, rows);
  },

  exportPettyCashPdf() {
    const columns = ['Date', 'Type', 'Description', 'Category', 'Amount'];
    const rows = this.currentTransactions.map((t) => [
      Util.formatDate(t.txn_date),
      t.type === 'topup' ? 'Top-up' : 'Expense',
      t.description,
      t.category || '-',
      Util.moneyPlain(t.amount),
    ]);
    Util.downloadPdf(`petty-cash-${Util.todayISO()}.pdf`, 'Petty Cash Report', columns, rows);
  },

  showAlert(message, type = 'error') {
    const box = document.getElementById('alertBox');
    if (box) box.innerHTML = `<div class="alert ${type}">${Util.escapeHtml(message)}</div>`;
  },

  renderExpenseForm(expense) {
    const isEdit = !!expense;
    const el = document.getElementById('expenseForm');
    el.innerHTML = `
      <div class="panel-header"><h3>${isEdit ? 'Edit Expense' : 'Add Expense'}</h3></div>
      <form id="expForm">
        <div class="form-grid">
          <div class="field"><label>Title</label><input id="e_title" required value="${Util.escapeHtml(expense?.title || '')}" /></div>
          <div class="field"><label>Category</label><input id="e_category" placeholder="Cleaning, Security, Repairs..." value="${Util.escapeHtml(expense?.category || '')}" /></div>
          <div class="field"><label>Amount</label><input id="e_amount" type="number" step="0.01" required value="${expense?.amount ?? ''}" /></div>
          <div class="field"><label>Date</label><input id="e_date" type="date" value="${expense?.expense_date || Util.todayISO()}" /></div>
        </div>
        <div class="field"><label>Notes</label><input id="e_notes" value="${Util.escapeHtml(expense?.notes || '')}" /></div>
        <div class="toolbar mt-16">
          <button type="submit">${isEdit ? 'Save Changes' : 'Add Expense'}</button>
          ${isEdit ? '<button type="button" class="secondary" id="cancelExpenseEdit">Cancel</button>' : ''}
        </div>
      </form>
    `;
    document.getElementById('expForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        title: document.getElementById('e_title').value.trim(),
        category: document.getElementById('e_category').value.trim(),
        amount: Number(document.getElementById('e_amount').value),
        expense_date: document.getElementById('e_date').value,
        notes: document.getElementById('e_notes').value.trim(),
      };
      try {
        if (isEdit) {
          await Api.put(`/expenses/${expense.id}`, payload);
        } else {
          await Api.post('/expenses', payload);
        }
        this.renderExpenseForm();
        await this.loadExpenses();
        this.showAlert(isEdit ? 'Expense updated.' : 'Expense added.', 'success');
      } catch (err) {
        this.showAlert(err.message);
      }
    });
    if (isEdit) {
      document.getElementById('cancelExpenseEdit').addEventListener('click', () => this.renderExpenseForm());
    }
  },

  renderSummary() {
    const box = document.getElementById('expenseSummary');
    if (!box) return;
    const bankTotal = this.currentExpenses.filter((ex) => ex.source !== 'petty_cash').reduce((sum, ex) => sum + Number(ex.amount), 0);
    const pettyCashTotal = this.currentExpenses.filter((ex) => ex.source === 'petty_cash').reduce((sum, ex) => sum + Number(ex.amount), 0);
    box.innerHTML = `
      <div class="stat-card"><div class="label">Bank Expenses</div><div class="value">${Util.money(bankTotal)}</div></div>
      <div class="stat-card"><div class="label">Petty Cash Expenses</div><div class="value">${Util.money(pettyCashTotal)}</div></div>
      <div class="stat-card"><div class="label">Total Expenses (Bank + Petty Cash)</div><div class="value">${Util.money(bankTotal + pettyCashTotal)}</div></div>
    `;
  },

  async loadExpenses() {
    const user = Api.getUser();
    const isAdmin = Util.isAdmin(user);
    const expenses = await Api.get('/expenses');
    this.currentExpenses = expenses;
    this.renderSummary();
    const rows = document.getElementById('expenseRows');
    if (!expenses.length) {
      rows.innerHTML = `<tr class="empty-row"><td colspan="7">No expenses recorded</td></tr>`;
      return;
    }
    rows.innerHTML = expenses
      .map(
        (ex) => `
      <tr>
        <td>${Util.formatDate(ex.expense_date)}</td>
        <td>${Util.escapeHtml(ex.title)}</td>
        <td>${Util.escapeHtml(ex.category || '-')}</td>
        <td>${Util.money(ex.amount)}</td>
        <td><span class="badge ${ex.source === 'petty_cash' ? 'partial' : 'active'}">${ex.source === 'petty_cash' ? 'Petty Cash' : 'Bank'}</span></td>
        <td>${Util.escapeHtml(ex.notes || '-')}</td>
        ${
          isAdmin
            ? `<td class="toolbar">${
                ex.source === 'petty_cash'
                  ? '<span class="text-muted" style="font-size:0.8rem;">via Petty Cash</span>'
                  : `<button class="small secondary" data-edit="${ex.id}">Edit</button><button class="small danger" data-del="${ex.id}">Delete</button>`
              }</td>`
            : ''
        }
      </tr>`
      )
      .join('');

    if (isAdmin) {
      rows.querySelectorAll('[data-edit]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const expense = this.currentExpenses.find((x) => String(x.id) === btn.dataset.edit);
          this.renderExpenseForm(expense);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        })
      );
      rows.querySelectorAll('[data-del]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this expense?')) return;
          try {
            await Api.del(`/expenses/${btn.dataset.del}`);
            await this.loadExpenses();
          } catch (err) {
            this.showAlert(err.message);
          }
        })
      );
    }
  },

  renderPettyCashForm(txn) {
    const isEdit = !!txn;
    const el = document.getElementById('pettyCashForm');
    el.innerHTML = `
      <div class="panel-header"><h3>${isEdit ? 'Edit Petty Cash Transaction' : 'Add Petty Cash Transaction'}</h3></div>
      <form id="pcForm">
        <div class="form-grid">
          <div class="field"><label>Type</label>
            <select id="pc_type" ${isEdit ? 'disabled' : ''}>
              <option value="expense" ${!isEdit || txn.type === 'expense' ? 'selected' : ''}>Expense (spend from petty cash)</option>
              <option value="topup" ${isEdit && txn.type === 'topup' ? 'selected' : ''}>Top-up (add cash from bank)</option>
            </select>
          </div>
          <div class="field"><label>Amount</label><input id="pc_amount" type="number" step="0.01" required value="${txn?.amount ?? ''}" /></div>
          <div class="field"><label>Date</label><input id="pc_date" type="date" value="${txn?.txn_date || Util.todayISO()}" /></div>
          <div class="field" id="pc_category_field"><label>Category</label><input id="pc_category" placeholder="Stationery, Tea, Misc..." value="${Util.escapeHtml(txn?.category || '')}" /></div>
        </div>
        <div class="field"><label>Description</label><input id="pc_description" required value="${Util.escapeHtml(txn?.description || '')}" /></div>
        <div class="toolbar mt-16">
          <button type="submit">${isEdit ? 'Save Changes' : 'Add Transaction'}</button>
          ${isEdit ? '<button type="button" class="secondary" id="cancelPcEdit">Cancel</button>' : ''}
        </div>
      </form>
    `;
    const typeSelect = document.getElementById('pc_type');
    const categoryField = document.getElementById('pc_category_field');
    categoryField.style.display = typeSelect.value === 'expense' ? '' : 'none';
    typeSelect.addEventListener('change', (e) => {
      categoryField.style.display = e.target.value === 'expense' ? '' : 'none';
    });
    document.getElementById('pcForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        type: typeSelect.value,
        amount: Number(document.getElementById('pc_amount').value),
        txn_date: document.getElementById('pc_date').value,
        description: document.getElementById('pc_description').value.trim(),
        category: document.getElementById('pc_category').value.trim(),
      };
      try {
        if (isEdit) {
          await Api.put(`/petty-cash/${txn.id}`, payload);
        } else {
          await Api.post('/petty-cash', payload);
        }
        this.renderPettyCashForm();
        e.target.reset?.();
        await Promise.all([this.loadPettyCash(), this.loadExpenses()]);
        this.showAlert(isEdit ? 'Transaction updated.' : 'Petty cash transaction recorded.', 'success');
      } catch (err) {
        this.showAlert(err.message);
      }
    });
    if (isEdit) {
      document.getElementById('cancelPcEdit').addEventListener('click', () => this.renderPettyCashForm());
    }
  },

  async loadPettyCash() {
    const user = Api.getUser();
    const isAdmin = Util.isAdmin(user);
    const { transactions, summary } = await Api.get('/petty-cash');
    this.currentTransactions = transactions;

    const statsEl = document.getElementById('pettyCashStats');
    statsEl.innerHTML = `
      <div class="stat-card ${summary.balance < 0 ? 'negative' : ''}"><div class="label">Cash in Hand</div><div class="value">${Util.money(summary.balance)}</div></div>
      <div class="stat-card"><div class="label">Total Topped Up to Petty Cash from Bank</div><div class="value">${Util.money(summary.totalTopups)}</div></div>
      <div class="stat-card"><div class="label">Total Petty Cash Spent</div><div class="value">${Util.money(summary.totalExpenses)}</div></div>
    `;

    const rows = document.getElementById('pettyCashRows');
    if (!transactions.length) {
      rows.innerHTML = `<tr class="empty-row"><td colspan="6">No petty cash transactions yet</td></tr>`;
      return;
    }
    rows.innerHTML = transactions
      .map(
        (t) => `
      <tr>
        <td>${Util.formatDate(t.txn_date)}</td>
        <td><span class="badge ${t.type === 'topup' ? 'active' : 'unpaid'}">${t.type === 'topup' ? 'Top-up' : 'Expense'}</span></td>
        <td>${Util.escapeHtml(t.description)}</td>
        <td>${Util.escapeHtml(t.category || '-')}</td>
        <td>${t.type === 'topup' ? '+' : '-'}${Util.money(t.amount)}</td>
        ${
          isAdmin
            ? `<td class="toolbar"><button class="small secondary" data-pc-edit="${t.id}">Edit</button><button class="small danger" data-pc-del="${t.id}">Delete</button></td>`
            : ''
        }
      </tr>`
      )
      .join('');

    if (isAdmin) {
      rows.querySelectorAll('[data-pc-edit]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const txn = this.currentTransactions.find((x) => String(x.id) === btn.dataset.pcEdit);
          this.renderPettyCashForm(txn);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        })
      );
      rows.querySelectorAll('[data-pc-del]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this petty cash transaction? Any linked expense entry will be removed too.')) return;
          try {
            await Api.del(`/petty-cash/${btn.dataset.pcDel}`);
            await Promise.all([this.loadPettyCash(), this.loadExpenses()]);
          } catch (err) {
            this.showAlert(err.message);
          }
        })
      );
    }
  },
};
