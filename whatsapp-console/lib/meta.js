// ------------------------------------------------------------------
//  Meta WhatsApp Cloud API — outbound send.
//  If WHATSAPP_TOKEN is not set, we are in SIMULATION MODE: no real
//  network call is made and the caller treats the send as local-only.
// ------------------------------------------------------------------

export function isLive() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

const VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v19.0';

// Send a plain text WhatsApp message. `to` is the raw msisdn (e.g. 919876543210).
export async function sendText(to, body) {
  if (!isLive()) {
    return { simulated: true, to, body };
  }
  const url = `https://graph.facebook.com/${VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Meta API error ${res.status}`);
    err.meta = data;
    throw err;
  }
  return { simulated: false, id: data?.messages?.[0]?.id, raw: data };
}

// ---- Media ----------------------------------------------------------------

// Upload a file to Meta and get a media id (used to send media without a public URL).
export async function uploadMedia(buffer, mime, filename = 'file') {
  if (!isLive()) return { simulated: true };
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([buffer], { type: mime }), filename);
  const res = await fetch(
    `https://graph.facebook.com/${VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`,
    { method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }, body: form }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Media upload failed ${res.status}`);
  return { simulated: false, id: data.id };
}

// Send a media message. media = { kind:'image'|'document'|'audio'|'video', id|link, caption, filename }
export async function sendMedia(to, media) {
  if (!isLive()) return { simulated: true };
  const obj = {};
  if (media.id) obj.id = media.id;
  if (media.link) obj.link = media.link;
  if (media.caption) obj.caption = media.caption;
  if (media.kind === 'document' && media.filename) obj.filename = media.filename;
  const res = await fetch(
    `https://graph.facebook.com/${VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: media.kind, [media.kind]: obj }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Media send failed ${res.status}`);
  return { simulated: false, id: data?.messages?.[0]?.id };
}

// Resolve an inbound media id -> temporary download URL, then fetch the bytes.
export async function downloadMedia(mediaId) {
  if (!isLive()) return null;
  const meta = await fetch(`https://graph.facebook.com/${VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  }).then((r) => r.json());
  if (!meta?.url) return null;
  const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
  const buffer = Buffer.from(await bin.arrayBuffer());
  return { buffer, mime: meta.mime_type, sha256: meta.sha256, size: meta.file_size };
}

// Send an interactive reply-button message (e.g. the Yes/No quick-assistance prompt).
export async function sendButtons(to, body, buttons) {
  if (!isLive()) return { simulated: true, to, body, buttons };
  const url = `https://graph.facebook.com/${VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map((b, i) => ({
            type: 'reply',
            reply: { id: `btn_${i}`, title: b.slice(0, 20) },
          })),
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Meta API error ${res.status}`);
    err.meta = data;
    throw err;
  }
  return { simulated: false, id: data?.messages?.[0]?.id, raw: data };
}
