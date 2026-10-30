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
              <label style="font-weight:normal;"><input type="radio" name="target" value="guest" /> Guest</label>
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
          <div id="guestField" style="display:none;">
            <div class="field">
              <label>Guest name (optional)</label>
              <input type="text" id="guestName" />
            </div>
            <div class="field">
              <label>Guest phone number</label>
              <input type="tel" id="guestPhone" placeholder="10-digit mobile number" />
            </div>
          </div>
          <div class="field" id="signAsField" style="display:none;">
            <label>Sign as</label>
            <select id="signAsSelect"><option value="">Myself</option></select>
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
            <button type="submit" id="sendBtn">Preview</button>
          </div>
        </form>
      </div>

      <div class="panel mt-16" id="previewPanel" style="display:none;">
        <h2>Preview</h2>
        <p class="page-sub" id="previewTo"></p>
        <div id="previewText" style="white-space:pre-wrap;background:#dcf8c6;border-radius:8px;padding:12px;max-width:520px;"></div>
        <img id="previewImage" alt="" style="display:none;max-width:240px;margin-top:8px;border-radius:6px;" />
        <div class="toolbar mt-16">
          <button type="button" id="confirmSendBtn">Confirm &amp; Send</button>
          <button type="button" class="secondary" id="cancelPreviewBtn">Edit</button>
        </div>
      </div>

      <div class="panel mt-16">
        <h2>Sent messages</h2>
        <div id="historyList"><p class="page-sub">Loading…</p></div>
      </div>
    `;

    document.querySelectorAll('input[name="target"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        this.state.target = e.target.value;
        document.getElementById('groupField').style.display = this.state.target === 'group' ? '' : 'none';
        document.getElementById('memberField').style.display = this.state.target === 'member' ? '' : 'none';
        document.getElementById('guestField').style.display = this.state.target === 'guest' ? '' : 'none';
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
      this.preview();
    });
    document.getElementById('confirmSendBtn').addEventListener('click', () => this.send());
    document.getElementById('cancelPreviewBtn').addEventListener('click', () => this.hidePreview());

    await Promise.all([this.loadGroups(), this.loadMembers(), this.loadSigners(), this.loadHistory()]);
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

  async loadHistory() {
    const box = document.getElementById('historyList');
    try {
      const rows = await Api.get('/whatsapp/history');
      const canDelete = Api.getUser()?.role === 'super_admin';
      box.innerHTML = rows.length
        ? `<div class="table-wrap"><table>
            <thead><tr><th>Sent</th><th>To</th><th>Message</th><th>By</th>${canDelete ? '<th></th>' : ''}</tr></thead>
            <tbody>${rows
              .map(
                (r) => `<tr>
                  <td style="white-space:nowrap;">${Util.escapeHtml(new Date(r.sent_at.replace(' ', 'T') + 'Z').toLocaleString('en-IN'))}</td>
                  <td>${r.target === 'group' ? '👥' : r.target === 'guest' ? '🧑‍🤝‍🧑' : '👤'} ${Util.escapeHtml(r.recipient_name)}</td>
                  <td style="white-space:pre-wrap;">${Util.escapeHtml(r.message)}${r.has_image ? ' 🖼️' : ''}</td>
                  <td>${Util.escapeHtml(r.sent_by || '-')}</td>
                  ${canDelete ? `<td><button type="button" class="small danger" data-delete="${r.id}">Delete</button></td>` : ''}
                </tr>`
              )
              .join('')}</tbody></table></div>`
        : '<p class="page-sub">No messages sent yet.</p>';
      box.querySelectorAll('[data-delete]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this message from the history?')) return;
          try {
            await Api.del(`/whatsapp/history/${btn.dataset.delete}`);
            this.loadHistory();
          } catch (err) {
            this.showAlert(err.message);
          }
        });
      });
    } catch (err) {
      box.innerHTML = `<p class="page-sub">${Util.escapeHtml(err.message)}</p>`;
    }
  },

  // Super admins can sign the message as any current core member instead of "Admin".
  async loadSigners() {
    if (Api.getUser()?.role !== 'super_admin') return;
    try {
      const rows = (await Api.get('/core-members')).filter((r) => !r.end_date);
      document.getElementById('signAsSelect').innerHTML =
        '<option value="">Myself</option>' +
        rows.map((r) => `<option value="${r.id}">${Util.escapeHtml(r.member_name)}, ${Util.escapeHtml(r.designation)}</option>`).join('');
      document.getElementById('signAsField').style.display = '';
    } catch (err) {
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

  hidePreview() {
    document.getElementById('previewPanel').style.display = 'none';
    document.getElementById('sendForm').style.display = '';
    this.state.pending = null;
  },

  // Validates the form, then shows the final message (with signature) for confirmation.
  async preview() {
    const body = this.buildBody();
    if (!body) return;
    const btn = document.getElementById('sendBtn');
    btn.disabled = true;
    try {
      const { message } = await Api.post('/whatsapp/preview', { text: body.text, signAs: body.signAs });
      let to;
      if (body.target === 'group') to = `Group: ${body.groupName || ''}`;
      else if (body.target === 'guest') to = `Guest: ${body.guestName || ''} ${body.guestPhone}`.trim();
      else to = `Member: ${this.state.members.find((m) => String(m.id) === body.memberId)?.name || ''}`;
      this.state.pending = body;
      document.getElementById('previewTo').textContent = `To — ${to}`;
      document.getElementById('previewText').textContent = message;
      const img = document.getElementById('previewImage');
      img.src = body.image || '';
      img.style.display = body.image ? '' : 'none';
      document.getElementById('alertBox').innerHTML = '';
      document.getElementById('sendForm').style.display = 'none';
      document.getElementById('previewPanel').style.display = '';
    } catch (err) {
      this.showAlert(err.message);
    } finally {
      btn.disabled = false;
    }
  },

  buildBody() {
    const target = this.state.target;
    const text = document.getElementById('messageText').value.trim();
    const image = this.state.image;
    if (!text && !image) return this.showAlert('Enter a message or attach an image'), null;

    const body = { target, text };
    const signAs = document.getElementById('signAsSelect').value;
    if (signAs) body.signAs = signAs;
    if (image) body.image = image;
    if (target === 'group') {
      body.groupId = document.getElementById('groupSelect').value;
      if (!body.groupId) return this.showAlert('Select a group'), null;
      body.groupName = this.state.groups.find((g) => g.id === body.groupId)?.name;
    } else if (target === 'guest') {
      body.guestPhone = document.getElementById('guestPhone').value.trim();
      body.guestName = document.getElementById('guestName').value.trim();
      if (!body.guestPhone) return this.showAlert('Enter the guest phone number'), null;
    } else {
      body.memberId = document.getElementById('memberSelect').value;
      if (!body.memberId) return this.showAlert('Select a member'), null;
    }
    return body;
  },

  async send() {
    const body = this.state.pending;
    if (!body) return;
    const btn = document.getElementById('confirmSendBtn');
    btn.disabled = true;
    try {
      await Api.post('/whatsapp/send', body);
      this.showAlert('Message sent.', 'success');
      document.getElementById('messageText').value = '';
      document.getElementById('imageFile').value = '';
      document.getElementById('imagePreview').style.display = 'none';
      document.getElementById('guestName').value = '';
      document.getElementById('guestPhone').value = '';
      this.state.image = null;
      this.hidePreview();
      this.loadHistory();
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
