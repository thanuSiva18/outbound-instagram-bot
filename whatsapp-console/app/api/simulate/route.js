// POST /api/simulate -> inject a fake INBOUND message (dev/demo only).
// Lets you exercise the whole pipeline (inbound -> AI -> reply) without a
// public webhook URL or a real phone. Same code path as the Meta webhook.
import { NextResponse } from 'next/server';
import { processInbound } from '@/lib/inbound';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { from, name, text, media } = await req.json().catch(() => ({}));
  if (!from || (!text?.trim() && !media)) {
    return NextResponse.json({ error: 'from and (text or media) required' }, { status: 400 });
  }
  const result = await processInbound({ from: String(from), name, text: (text || '').trim(), media });
  return NextResponse.json({ ok: true, ...result });
}
