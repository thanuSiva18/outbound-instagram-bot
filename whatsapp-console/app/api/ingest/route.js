// POST /api/ingest  — n8n forwards a COPY of every WhatsApp message here so the
// console mirrors the live bot. Meta's webhook still points at n8n (unchanged);
// n8n is the single source of truth, the console is the cockpit.
//
// Expected JSON (from an n8n HTTP Request node):
//   { ig_user_id|from, name?, direction:'in'|'out', text?, media?, source? }
// Optional header: x-ingest-secret (must match INGEST_SECRET when that env is set).
import { NextResponse } from 'next/server';
import { upsertConversation, addMessage } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const secret = process.env.INGEST_SECRET;
  if (secret && req.headers.get('x-ingest-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const b = await req.json().catch(() => ({}));
  const from = String(b.ig_user_id || b.from || '').trim();
  if (!from) return NextResponse.json({ error: 'ig_user_id/from required' }, { status: 400 });

  const dir = b.direction === 'out' ? 'out' : 'in';
  upsertConversation(from, { name: b.name, phone: `+${from}` });
  const msg = addMessage(from, {
    dir,
    text: b.text || '',
    media: b.media,
    source: dir === 'out' ? b.source || 'ai' : undefined,
    status: dir === 'out' ? 'sent' : undefined,
  });
  return NextResponse.json({ ok: true, message: msg });
}
