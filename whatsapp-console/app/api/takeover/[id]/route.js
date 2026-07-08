// GET   /api/takeover/:id  — n8n calls this before auto-replying.
//        Returns { active: true } when a human is handling the chat (sent a
//        message within the last 15 min) so n8n knows to SKIP its reply.
//        n8n should fail-open: if this call errors, let the bot reply.
// DELETE /api/takeover/:id  — agent clicked "hand back to bot" (clear now).
import { NextResponse } from 'next/server';
import { getTakeover, clearTakeover } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  const t = getTakeover(params.id);
  return NextResponse.json({
    id: params.id,
    active: t.active,
    until: t.until,
    remainingSeconds: Math.round(t.remainingMs / 1000),
  });
}

export async function DELETE(_req, { params }) {
  clearTakeover(params.id);
  return NextResponse.json({ ok: true, active: false });
}
