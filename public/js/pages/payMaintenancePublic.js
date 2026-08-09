(() => {
  const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(n) {
    const num = Number(n) || 0;
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  async function request(path, { method = 'GET', body } = {}) {
    const res = await fetch(`/api/public/maintenance${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  const alertBox = document.getElementById('alertBox');
  const resultsBox = document.getElementById('results');

  function showAlert(message, type = 'error') {
    alertBox.innerHTML = `<div class="alert ${type}">${escapeHtml(message)}</div>`;
  }

  function renderResults(members) {
    if (!members.length) {
      resultsBox.innerHTML = '';
      showAlert("No member found with that Site No or Name. Please check and try again, or contact the association.");
      return;
    }
    alertBox.innerHTML = '';
    resultsBox.innerHTML = members
      .map((m) => {
        if (!m.dues.length) {
          return `
            <div class="panel" style="margin-top:16px;">
              <div class="panel-header"><h3>${escapeHtml(m.name)} <span class="text-muted" style="font-size:0.8rem;">(Site No ${escapeHtml(m.site_no || '-')})</span></h3></div>
              <p class="text-muted">No outstanding dues — you're all caught up. Thank you!</p>
            </div>`;
        }
        return `
          <div class="panel" style="margin-top:16px;">
            <div class="panel-header"><h3>${escapeHtml(m.name)} <span class="text-muted" style="font-size:0.8rem;">(Site No ${escapeHtml(m.site_no || '-')})</span></h3></div>
            ${m.dues.map((d) => duesRowHtml(d)).join('')}
          </div>`;
      })
      .join('');

    members.forEach((m) =>
      m.dues.forEach((d) => {
        const btn = document.getElementById(`pay-btn-${d.id}`);
        if (btn) btn.addEventListener('click', () => showPaymentStep(d));
      })
    );
  }

  function duesRowHtml(d) {
    const remaining = Number(d.amount_due) - Number(d.amount_paid);
    return `
      <div class="toolbar" style="justify-content:space-between; border-top:1px solid var(--border); padding-top:12px; margin-top:12px;" id="due-row-${d.id}">
        <div>
          <strong>${MONTH_NAMES[d.month]} ${d.year}</strong>
          <div class="text-muted" style="font-size:0.85rem;">${money(remaining)} due${d.status === 'partial' ? ' (partially paid)' : ''}</div>
        </div>
        <button id="pay-btn-${d.id}">Pay Now</button>
      </div>
      <div id="due-pay-${d.id}"></div>
    `;
  }

  function showPaymentStep(due) {
    const remaining = Number(due.amount_due) - Number(due.amount_paid);
    const box = document.getElementById(`due-pay-${due.id}`);
    document.getElementById(`pay-btn-${due.id}`).style.display = 'none';
    box.innerHTML = `
      <div id="gatewayContent-${due.id}"></div>
      <div id="qrToggleWrap-${due.id}" class="mt-16"><button type="button" class="secondary" id="toggleQrBtn-${due.id}" style="width:100%;">Pay by scanning a UPI QR code</button></div>
      <div id="qrContent-${due.id}"></div>
    `;
    document.getElementById(`toggleQrBtn-${due.id}`).addEventListener('click', () => loadQr(due, remaining));

    request('/razorpay-config')
      .then((config) => {
        const gatewayBox = document.getElementById(`gatewayContent-${due.id}`);
        if (config.configured) {
          gatewayBox.innerHTML = `<button id="payOnlineBtn-${due.id}" style="width:100%;">Pay Online Now (Card / UPI / NetBanking)</button>`;
          document.getElementById(`payOnlineBtn-${due.id}`).addEventListener('click', () => payWithRazorpay(due, remaining));
          document.getElementById(`toggleQrBtn-${due.id}`).textContent = 'Or scan a UPI QR code instead';
        } else {
          document.getElementById(`qrToggleWrap-${due.id}`).style.display = 'none';
          loadQr(due, remaining);
        }
      })
      .catch((err) => {
        document.getElementById(`gatewayContent-${due.id}`).innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
      });
  }

  async function loadQr(due, remaining) {
    document.getElementById(`toggleQrBtn-${due.id}`).style.display = 'none';
    const qrBox = document.getElementById(`qrContent-${due.id}`);
    qrBox.innerHTML = '<p class="text-muted">Loading QR code…</p>';
    try {
      const note = `Maintenance ${MONTH_NAMES[due.month]} ${due.year}`;
      const data = await request(`/qr?amount=${remaining}&note=${encodeURIComponent(note)}`);
      qrBox.innerHTML = `
        <img src="${data.qrDataUrl}" alt="UPI QR code" width="220" height="220" />
        <p class="text-muted mt-16">Scan with any UPI app (GPay, PhonePe, Paytm...), or on your phone <a href="${escapeHtml(data.upiUri)}">tap here to pay</a>.</p>
        <p class="text-muted" style="font-size:0.78rem;">After paying, please let a core member know so they can confirm your payment.</p>
      `;
    } catch (err) {
      qrBox.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  }

  async function payWithRazorpay(due, remaining) {
    const gatewayBox = document.getElementById(`gatewayContent-${due.id}`);
    try {
      const order = await request(`/${due.id}/order`, { method: 'POST' });
      const rzp = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: order.payeeName,
        description: `Maintenance ${MONTH_NAMES[due.month]} ${due.year}`,
        order_id: order.orderId,
        handler: async (response) => {
          gatewayBox.innerHTML = '<p class="text-muted">Verifying payment…</p>';
          try {
            await request(`/${due.id}/verify`, {
              method: 'POST',
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
            });
            const row = document.getElementById(`due-row-${due.id}`);
            row.innerHTML = `<div><strong>${MONTH_NAMES[due.month]} ${due.year}</strong><div class="text-muted">Paid — thank you! 🙏</div></div>`;
            document.getElementById(`due-pay-${due.id}`).innerHTML = '';
          } catch (err) {
            gatewayBox.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
          }
        },
        modal: {
          ondismiss: () => {
            gatewayBox.innerHTML = `<button id="payOnlineBtn-${due.id}" style="width:100%;">Pay Online Now (Card / UPI / NetBanking)</button>`;
            document.getElementById(`payOnlineBtn-${due.id}`).addEventListener('click', () => payWithRazorpay(due, remaining));
          },
        },
        theme: { color: '#2f6f4e' },
      });
      rzp.open();
    } catch (err) {
      gatewayBox.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  }

  document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = document.getElementById('q').value.trim();
    if (!q) return;
    try {
      const members = await request(`/dues?q=${encodeURIComponent(q)}`);
      renderResults(members);
    } catch (err) {
      showAlert(err.message);
    }
  });
})();
