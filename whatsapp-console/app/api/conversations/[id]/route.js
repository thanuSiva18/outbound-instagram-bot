import { NextResponse } from 'next/server';
import { getConversation, markRead, setAutoReply } from '@/lib/store';

export const dynamic = 'force-dynamic';

// GET /api/conversations/:id -> full message thread
export async function GET(_req, { params }) {
  const conv = getConversation(params.id);
  if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ conversation: conv });
}

// PATCH /api/conversations/:id -> { markRead?: true, autoReply?: bool }
export async function PATCH(req, { params }) {
  const body = await req.json().catch(() => ({}));
  if (body.markRead) markRead(params.id);
  if (typeof body.autoReply === 'boolean') setAutoReply(params.id, body.autoReply);
  return NextResponse.json({ conversation: getConversation(params.id) });
}
