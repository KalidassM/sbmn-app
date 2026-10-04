window.SendWhatsappPage = {
  state: { target: 'group', groups: [], members: [] },

  async render(container) {
    container.innerHTML = `
      <h1>Send WhatsApp Message</h1>
      <p class="page-sub">Send a message to a specific WhatsApp group or a specific member</p>
      <div id="alertBox"></div>

      <div class="panel">
        <form id="sendForm">
          <div class="field">
            <label>Send to</label>
            <div style="display:flex;gap:16px;">
              <label style="font-weight:normal;"><input type="radio" name="target" value="group" checked /> WhatsApp Group</label>
              <label style="font-weight:normal;"><input type="radio" name="target" value="member" /> Member</label>
            </div>
          </div>
          <div class="field" id="groupField">
            <label>Group</label>
            <select id="groupSelect"><option value="">Loading groups…</option></select>
          </div>
          <div class="field" id="memberField" style="display:none;">
            <label>Member</label>
            <select id="memberSelect"><option value="">Loading members…</option></select>
          </div>
          <div class="field">
            <label>Message</label>
            <textarea id="messageText" rows="5" placeholder="Type your message..."></textarea>
          </div>
          <div class="toolbar mt-16">
            <button type="submit" id="sendBtn">Send</button>
          </div>
        </form>
      </div>
    `;

    document.querySelectorAll('input[name="target"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        this.state.target = e.target.value;
        document.getElementById('groupField').style.display = this.state.target === 'group' ? '' : 'none';
        document.getElementById('memberField').style.display = this.state.target === 'member' ? '' : 'none';
      });
    });

    document.getElementById('sendForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.send();
    });

    await Promise.all([this.loadGroups(), this.loadMembers()]);
  },

  async loadGroups() {
    const select = document.getElementById('groupSelect');
    try {
      const groups = await Api.get('/whatsapp/groups');
      this.state.groups = groups;
      select.innerHTML = groups.length
        ? groups.map((g) => `<option value="${Util.escapeHtml(g.id)}">${Util.escapeHtml(g.name)}</option>`).join('')
        : '<option value="">No groups found</option>';
    } catch (err) {
      select.innerHTML = '<option value="">Unable to load groups</option>';
      this.showAlert(err.message);
    }
  },

  async loadMembers() {
    const select = document.getElementById('memberSelect');
    try {
      const members = await Api.get('/members');
      this.state.members = members.filter((m) => m.phone && m.status === 'active');
      select.innerHTML = this.state.members.length
        ? this.state.members
            .map((m) => `<option value="${m.id}">${Util.escapeHtml(m.name)}${m.site_no ? ` (Site ${Util.escapeHtml(m.site_no)})` : ''}</option>`)
            .join('')
        : '<option value="">No active members with a phone number on file</option>';
    } catch (err) {
      select.innerHTML = '<option value="">Unable to load members</option>';
      this.showAlert(err.message);
    }
  },

  async send() {
    const target = this.state.target;
    const text = document.getElementById('messageText').value.trim();
    if (!text) return this.showAlert('Enter a message');

    const body = { target, text };
    if (target === 'group') {
      body.groupId = document.getElementById('groupSelect').value;
      if (!body.groupId) return this.showAlert('Select a group');
    } else {
      body.memberId = document.getElementById('memberSelect').value;
      if (!body.memberId) return this.showAlert('Select a member');
    }

    const btn = document.getElementById('sendBtn');
    btn.disabled = true;
    try {
      await Api.post('/whatsapp/send', body);
      this.showAlert('Message sent.', 'success');
      document.getElementById('messageText').value = '';
    } catch (err) {
      this.showAlert(err.message);
    } finally {
      btn.disabled = false;
    }
  },

  showAlert(message, type = 'error') {
    const box = document.getElementById('alertBox');
    if (box) box.innerHTML = `<div class="alert ${type}">${Util.escapeHtml(message)}</div>`;
  },
};
