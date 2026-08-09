// Sends WhatsApp messages via Meta's WhatsApp Cloud API (graph.facebook.com) - no third-party
// aggregator markup. Requires a Meta Business + WhatsApp Business Account, a phone number, and an
// approved message template (WhatsApp only allows business-initiated messages via templates).
//
// Required env vars:
//   WHATSAPP_ACCESS_TOKEN     - permanent access token for the WhatsApp Business app
//   WHATSAPP_PHONE_NUMBER_ID  - the "Phone number ID" shown in the Meta app dashboard
//   WHATSAPP_TEMPLATE_NAME    - name of the approved template (defaults to 'maintenance_reminder')
//   WHATSAPP_TEMPLATE_LANG    - template language code (defaults to 'en')

function isConfigured() {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

// Assumes Indian numbers stored without a country code (e.g. "9876543210"); prepends 91 unless
// the number already looks like it has one.
function toWhatsAppNumber(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

// `params` are positional template variables, e.g. [memberName, amountText, monthText, link]
async function sendTemplateMessage(phone, params) {
  if (!isConfigured()) {
    throw new Error('WhatsApp is not configured yet. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
  }
  const to = toWhatsAppNumber(phone);
  if (!to) throw new Error('No valid phone number on file');

  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'maintenance_reminder';
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || 'en';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLang },
        components: [
          {
            type: 'body',
            parameters: params.map((text) => ({ type: 'text', text: String(text) })),
          },
        ],
      },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error?.message || `WhatsApp API request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

module.exports = { isConfigured, toWhatsAppNumber, sendTemplateMessage };
