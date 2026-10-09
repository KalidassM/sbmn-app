(() => {
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
    const res = await fetch(`/api/public/donations${path}`, {
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

  const card = document.getElementById('card');
  const alertBox = document.getElementById('alertBox');

  function showAlert(message, type = 'error') {
    alertBox.innerHTML = `<div class="alert ${type}">${escapeHtml(message)}</div>`;
  }

  function renderPaymentStep(donation) {
    card.innerHTML = `
      <h1>Almost there, ${escapeHtml(donation.donor_name)}!</h1>
      <p class="sub">Please complete your donation of <strong>${money(donation.amount)}</strong></p>
      <div id="alertBox"></div>
      <div id="gatewayContent"></div>
      <div id="qrContent"></div>
      <div id="doneContent"></div>
    `;

    request('/razorpay-config')
      .then((config) => {
        const gatewayBox = document.getElementById('gatewayContent');
        if (config.configured) {
          return showOnlineStep(donation, gatewayBox);
        } else {
          loadQr(donation);
        }
      })
      .catch((err) => {
        document.getElementById('gatewayContent').innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
      });
  }

  // Shows the fee + GST breakdown and the total before the Pay button
  async function showOnlineStep(donation, gatewayBox) {
    const q = await request(`/quote?amount=${donation.amount}`);
    gatewayBox.innerHTML = `
      <table style="width:100%; margin-bottom:12px;">
        <tr><td>Donation amount</td><td style="text-align:right;">${money(q.net)}</td></tr>
        <tr><td>${q.feeWaived ? 'Payment gateway fee (free offer)' : `Payment gateway fee (${q.feePercent}%)`}</td><td style="text-align:right;">${money(q.fee)}</td></tr>
        ${q.settlementFee ? `<tr><td>Same-day settlement fee (${q.settlementFeePercent}%)</td><td style="text-align:right;">${money(q.settlementFee)}</td></tr>` : ''}
        <tr><td>GST on fees (${q.gstPercent}%)</td><td style="text-align:right;">${money(q.gst)}</td></tr>
        <tr><td><strong>Total to pay</strong></td><td style="text-align:right;"><strong>${money(q.total)}</strong></td></tr>
      </table>
      <button id="payOnlineBtn" style="width:100%;">Pay ${money(q.total)} Online (Card / UPI / NetBanking)</button>
      <p class="text-muted" style="font-size:0.78rem;">The fees are only to cover the payment gateway, so your full donation reaches the association. To avoid them, pay by UPI QR instead and let a core member know.</p>`;
    document.getElementById('payOnlineBtn').addEventListener('click', () => payWithRazorpay(donation));
  }

  async function loadQr(donation) {
    const qrBox = document.getElementById('qrContent');
    qrBox.innerHTML = '<p class="text-muted">Loading QR code…</p>';
    try {
      const note = `Donation - ${donation.donor_name}`;
      const data = await request(`/qr?amount=${donation.amount}&note=${encodeURIComponent(note)}`);
      qrBox.innerHTML = `
        <img src="${data.qrDataUrl}" alt="UPI QR code" width="220" height="220" />
        <p class="text-muted mt-16">Scan with any UPI app (GPay, PhonePe, Paytm...), or on your phone <a href="${escapeHtml(data.upiUri)}">tap here to pay</a>.</p>
        <p class="text-muted" style="font-size:0.78rem;">After paying, please let a core member know so they can record your donation.</p>
      `;
    } catch (err) {
      qrBox.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  }

  async function payWithRazorpay(donation) {
    const gatewayBox = document.getElementById('gatewayContent');
    try {
      const order = await request('/order', {
        method: 'POST',
        body: {
          donor_name: donation.donor_name,
          donor_email: donation.donor_email,
          donor_phone: donation.donor_phone,
          amount: donation.amount,
          purpose: donation.purpose,
        },
      });
      const rzp = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: order.payeeName,
        description: `Donation - ${donation.donor_name}`,
        order_id: order.orderId,
        handler: async (response) => {
          gatewayBox.innerHTML = '<p class="text-muted">Verifying payment…</p>';
          try {
            await request('/verify', {
              method: 'POST',
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
            });
            card.innerHTML = `
              <h1>Thank you, ${escapeHtml(donation.donor_name)}! 🙏</h1>
              <p class="sub">Your donation of ${money(donation.amount)} has been received. We truly appreciate your support.</p>
              <a href="/" class="btn" style="display:block; text-align:center; text-decoration:none; margin-top:16px;">Back to Home</a>
            `;
          } catch (err) {
            gatewayBox.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
          }
        },
        modal: {
          ondismiss: () => {
            showOnlineStep(donation, gatewayBox).catch((err) => {
              gatewayBox.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
            });
          },
        },
        theme: { color: '#2f6f4e' },
      });
      rzp.open();
    } catch (err) {
      gatewayBox.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  }

  document.getElementById('donateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      donor_name: document.getElementById('d_name').value.trim(),
      donor_email: document.getElementById('d_email').value.trim(),
      donor_phone: document.getElementById('d_phone').value.trim(),
      amount: Number(document.getElementById('d_amount').value),
      purpose: document.getElementById('d_purpose').value.trim(),
    };
    if (!payload.donor_name) return showAlert('Your name is required');
    if (!(payload.amount > 0)) return showAlert('A valid amount is required');
    // nothing is saved yet: the donation is recorded by the server only after the payment succeeds
    renderPaymentStep(payload);
  });
})();
