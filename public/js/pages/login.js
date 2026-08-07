window.LoginPage = {
  render(container) {
    container.innerHTML = `
      <div class="auth-wrap">
        <div class="auth-card">
          <h1>Sri Balamurugan Nagar Welfare Association</h1>
          <p class="sub">Sign in to the management portal &middot; <a href="/">Back to homepage</a></p>
          <div id="loginAlert"></div>
          <form id="loginForm">
            <div class="field">
              <label>Username</label>
              <input type="text" id="username" required autofocus />
            </div>
            <div class="field">
              <label>Password</label>
              <input type="password" id="password" required />
            </div>
            <button type="submit" style="width:100%">Log in</button>
          </form>
          <p class="text-muted" style="text-align:center;margin-top:16px;font-size:0.85rem;">Not a member? <a href="/donate">Donate as a well-wisher</a></p>
        </div>
      </div>
    `;

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const alertBox = document.getElementById('loginAlert');
      alertBox.innerHTML = '';
      try {
        const data = await Api.post('/auth/login', { username, password });
        Api.setSession(data.token, data.user);
        window.location.hash = '#/dashboard';
        window.router();
      } catch (err) {
        alertBox.innerHTML = `<div class="alert error">${Util.escapeHtml(err.message)}</div>`;
      }
    });
  },
};
