// Meta WhatsApp Cloud API webhook.
//   GET  -> verification handshake (hub.challenge)
//   POST -> inbound messages + status callbacks
import { NextResponse } from 'next/server';
import { processInbound } from '@/lib/inbound';
import { setStatus } from '@/lib/store';
import { downloadMedia } from '@/lib/meta';
import { saveBuffer } from '@/lib/media';

export const dynamic = 'force-dynamic';

// ---- Verification: Meta calls GET once when you save the webhook ----
export async function GET(req) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === (process.env.WHATSAPP_VERIFY_TOKEN || 'outbound_whatsapp_verify_2026')) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response('Forbidden', { status: 403 });
}

// ---- Inbound: Meta POSTs messages and delivery/read statuses ----
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    const change = body?.entry?.[0]?.changes?.[0]?.value;

    // Delivery / read status callbacks (no messages[]) — update ticks.
    if (change?.statuses?.length) {
      for (const s of change.statuses) {
        const to = s.recipient_id;
        // We store our own message ids; Meta ids differ, so we best-effort
        // mark the last outbound as read/delivered for that conversation.
        if (to && s.status) setStatus(to, lastOutboundId(to), s.status);
      }
      return NextResponse.json({ ok: true });
    }

    const msg = change?.messages?.[0];
    if (!msg?.id) return NextResponse.json({ ok: true }); // not a user message

    const from = msg.from; // raw msisdn
    const name = change?.contacts?.[0]?.profile?.name;

    // Text vs interactive button reply (the Yes/No quick-assistance tap) vs media.
    let text = '';
    let media;
    const MEDIA_TYPES = ['image', 'document', 'audio', 'video', 'sticker'];
    if (msg.type === 'text') {
      text = msg.text?.body || '';
    } else if (msg.type === 'interactive') {
      text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
    } else if (MEDIA_TYPES.includes(msg.type)) {
      const node = msg[msg.type] || {};
      text = node.caption || '';
      try {
        const dl = await downloadMedia(node.id);
        if (dl) media = saveBuffer(dl.buffer, dl.mime, node.filename);
        else media = { kind: msg.type, url: '', mime: node.mime_type, filename: node.filename || '' };
      } catch (e) {
        console.error('[webhook] media download:', e.message);
        media = { kind: msg.type, url: '', mime: node.mime_type, filename: node.filename || '' };
      }
    } else {
      text = `[${msg.type} message]`;
    }

    await processInbound({ from, name, text, media });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[webhook] error:', e.message);
    return NextResponse.json({ ok: true }); // always 200 so Meta doesn't retry-storm
  }
}

// helper: we don't track Meta message ids in v1, so status callbacks
// nudge the most recent outbound. Imported lazily to avoid a cycle.
import { getConversation } from '@/lib/store';
function lastOutboundId(convId) {
  const c = getConversation(convId);
  if (!c) return null;
  for (let i = c.messages.length - 1; i >= 0; i--) {
    if (c.messages[i].dir === 'out') return c.messages[i].id;
  }
  return null;
}
