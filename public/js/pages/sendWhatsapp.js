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
          <div class="field">
            <label>Image (optional)</label>
            <input type="file" id="imageFile" accept="image/jpeg,image/png,image/webp" />
            <img id="imagePreview" alt="" style="display:none;max-width:240px;margin-top:8px;border-radius:6px;" />
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

    document.getElementById('imageFile').addEventListener('change', async (e) => {
      const preview = document.getElementById('imagePreview');
      const file = e.target.files[0];
      this.state.image = null;
      preview.style.display = 'none';
      if (!file) return;
      try {
        this.state.image = await this.readImage(file);
        preview.src = this.state.image;
        preview.style.display = '';
      } catch (err) {
        e.target.value = '';
        this.showAlert(err.message);
      }
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

  // Downscales to max 1600px and re-encodes as JPEG so the JSON upload stays well under the body limit.
  readImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read that image'));
      };
      img.src = url;
    });
  },

  async send() {
    const target = this.state.target;
    const text = document.getElementById('messageText').value.trim();
    const image = this.state.image;
    if (!text && !image) return this.showAlert('Enter a message or attach an image');

    const body = { target, text };
    if (image) body.image = image;
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
      document.getElementById('imageFile').value = '';
      document.getElementById('imagePreview').style.display = 'none';
      this.state.image = null;
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
