window.ExpensesPage = {
  async render(container) {
    const user = Api.getUser();
    const isAdmin = user.role === 'admin';

    container.innerHTML = `
      <h1>Expenses & Petty Cash</h1>
      <p class="page-sub">Track association expenses and the day-to-day petty cash box</p>
      <div id="alertBox"></div>

      <div class="panel">
        <div class="panel-header"><h3>Expenses</h3></div>
        ${isAdmin ? '<div id="expenseForm"></div>' : ''}
        <table>
          <thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Amount</th><th>Source</th><th>Notes</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
          <tbody id="expenseRows"><tr><td colspan="7">Loading…</td></tr></tbody>
        </table>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Petty Cash</h3></div>
        <p class="page-sub" style="margin-top:-8px;">Small day-to-day cash kept on hand. Top-ups move money from the bank into the cash box; expenses spend from it and automatically also appear in the Expenses list above.</p>
        <div class="stat-grid" id="pettyCashStats"></div>
        ${isAdmin ? '<div id="pettyCashForm"></div>' : ''}
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Category</th><th>Amount</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
          <tbody id="pettyCashRows"><tr><td colspan="6">Loading…</td></tr></tbody>
        </table>
      </div>
    `;

    if (isAdmin) {
      this.renderExpenseForm();
      this.renderPettyCashForm();
    }

    await Promise.all([this.loadExpenses(), this.loadPettyCash()]);
  },

  showAlert(message, type = 'error') {
    const box = document.getElementById('alertBox');
    if (box) box.innerHTML = `<div class="alert ${type}">${Util.escapeHtml(message)}</div>`;
  },

  renderExpenseForm() {
    const el = document.getElementById('expenseForm');
    el.innerHTML = `
      <form id="expForm">
        <div class="form-grid">
          <div class="field"><label>Title</label><input id="e_title" required /></div>
          <div class="field"><label>Category</label><input id="e_category" placeholder="Cleaning, Security, Repairs..." /></div>
          <div class="field"><label>Amount</label><input id="e_amount" type="number" step="0.01" required /></div>
          <div class="field"><label>Date</label><input id="e_date" type="date" value="${Util.todayISO()}" /></div>
        </div>
        <div class="field"><label>Notes</label><input id="e_notes" /></div>
        <div class="toolbar mt-16"><button type="submit">Add Expense</button></div>
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
        await Api.post('/expenses', payload);
        e.target.reset();
        document.getElementById('e_date').value = Util.todayISO();
        await this.loadExpenses();
        this.showAlert('Expense added.', 'success');
      } catch (err) {
        this.showAlert(err.message);
      }
    });
  },

  async loadExpenses() {
    const user = Api.getUser();
    const isAdmin = user.role === 'admin';
    const expenses = await Api.get('/expenses');
    const rows = document.getElementById('expenseRows');
    if (!expenses.length) {
      rows.innerHTML = `<tr class="empty-row"><td colspan="7">No expenses recorded</td></tr>`;
      return;
    }
    rows.innerHTML = expenses
      .map(
        (ex) => `
      <tr>
        <td>${ex.expense_date}</td>
        <td>${Util.escapeHtml(ex.title)}</td>
        <td>${Util.escapeHtml(ex.category || '-')}</td>
        <td>${Util.money(ex.amount)}</td>
        <td><span class="badge ${ex.source === 'petty_cash' ? 'partial' : 'active'}">${ex.source === 'petty_cash' ? 'Petty Cash' : 'Bank'}</span></td>
        <td>${Util.escapeHtml(ex.notes || '-')}</td>
        ${isAdmin ? `<td>${ex.source === 'petty_cash' ? '<span class="text-muted" style="font-size:0.8rem;">via Petty Cash</span>' : `<button class="small danger" data-del="${ex.id}">Delete</button>`}</td>` : ''}
      </tr>`
      )
      .join('');

    if (isAdmin) {
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

  renderPettyCashForm() {
    const el = document.getElementById('pettyCashForm');
    el.innerHTML = `
      <form id="pcForm">
        <div class="form-grid">
          <div class="field"><label>Type</label>
            <select id="pc_type">
              <option value="expense">Expense (spend from petty cash)</option>
              <option value="topup">Top-up (add cash from bank)</option>
            </select>
          </div>
          <div class="field"><label>Amount</label><input id="pc_amount" type="number" step="0.01" required /></div>
          <div class="field"><label>Date</label><input id="pc_date" type="date" value="${Util.todayISO()}" /></div>
          <div class="field" id="pc_category_field"><label>Category</label><input id="pc_category" placeholder="Stationery, Tea, Misc..." /></div>
        </div>
        <div class="field"><label>Description</label><input id="pc_description" required /></div>
        <div class="toolbar mt-16"><button type="submit">Add Transaction</button></div>
      </form>
    `;
    document.getElementById('pc_type').addEventListener('change', (e) => {
      document.getElementById('pc_category_field').style.display = e.target.value === 'expense' ? '' : 'none';
    });
    document.getElementById('pcForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        type: document.getElementById('pc_type').value,
        amount: Number(document.getElementById('pc_amount').value),
        txn_date: document.getElementById('pc_date').value,
        description: document.getElementById('pc_description').value.trim(),
        category: document.getElementById('pc_category').value.trim(),
      };
      try {
        await Api.post('/petty-cash', payload);
        e.target.reset();
        document.getElementById('pc_date').value = Util.todayISO();
        await Promise.all([this.loadPettyCash(), this.loadExpenses()]);
        this.showAlert('Petty cash transaction recorded.', 'success');
      } catch (err) {
        this.showAlert(err.message);
      }
    });
  },

  async loadPettyCash() {
    const user = Api.getUser();
    const isAdmin = user.role === 'admin';
    const { transactions, summary } = await Api.get('/petty-cash');

    const statsEl = document.getElementById('pettyCashStats');
    statsEl.innerHTML = `
      <div class="stat-card ${summary.balance < 0 ? 'negative' : ''}"><div class="label">Cash in Hand</div><div class="value">${Util.money(summary.balance)}</div></div>
      <div class="stat-card"><div class="label">Total Topped Up</div><div class="value">${Util.money(summary.totalTopups)}</div></div>
      <div class="stat-card"><div class="label">Total Spent</div><div class="value">${Util.money(summary.totalExpenses)}</div></div>
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
        <td>${t.txn_date}</td>
        <td><span class="badge ${t.type === 'topup' ? 'active' : 'unpaid'}">${t.type === 'topup' ? 'Top-up' : 'Expense'}</span></td>
        <td>${Util.escapeHtml(t.description)}</td>
        <td>${Util.escapeHtml(t.category || '-')}</td>
        <td>${t.type === 'topup' ? '+' : '-'}${Util.money(t.amount)}</td>
        ${isAdmin ? `<td><button class="small danger" data-pc-del="${t.id}">Delete</button></td>` : ''}
      </tr>`
      )
      .join('');

    if (isAdmin) {
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
