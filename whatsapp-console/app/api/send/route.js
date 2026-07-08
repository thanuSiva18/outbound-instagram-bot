// POST /api/send -> agent sends a message from the dashboard.
import { NextResponse } from 'next/server';
import { sendText } from '@/lib/meta';
import { addMessage, getConversation, markHumanSend } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { to, text } = await req.json().catch(() => ({}));
  if (!to || !text?.trim()) {
    return NextResponse.json({ error: 'to and text required' }, { status: 400 });
  }
  if (!getConversation(to)) {
    return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
  }

  let result;
  try {
    result = await sendText(to, text.trim()); // real Meta call or simulated no-op
  } catch (e) {
    // Record the attempt as failed so the agent sees it didn't go out.
    const failed = addMessage(to, { dir: 'out', text: text.trim(), status: 'failed', source: 'human' });
    return NextResponse.json({ error: e.message, message: failed }, { status: 502 });
  }

  const msg = addMessage(to, {
    dir: 'out',
    text: text.trim(),
    status: 'sent',
    source: 'human',
  });
  markHumanSend(to); // human took over -> pause the n8n bot for 15 min
  return NextResponse.json({ message: msg, simulated: !!result.simulated });
}
