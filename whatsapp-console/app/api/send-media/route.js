// POST /api/send-media  (multipart form-data: file, to, caption?)
// Agent attaches an image/PDF/etc. and sends it from the dashboard.
import { NextResponse } from 'next/server';
import { uploadMedia, sendMedia, isLive } from '@/lib/meta';
import { saveBuffer } from '@/lib/media';
import { addMessage, getConversation, markHumanSend } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const to = form?.get('to');
  const caption = (form?.get('caption') || '').toString();

  if (!file || !to) return NextResponse.json({ error: 'file and to required' }, { status: 400 });
  if (!getConversation(to)) return NextResponse.json({ error: 'conversation not found' }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || 'application/octet-stream';
  // 1) keep a local copy so the dashboard can render it immediately
  const saved = saveBuffer(buffer, mime, file.name);

  // 2) in live mode, push to Meta (upload -> send by id, no public URL needed)
  let simulated = true;
  if (isLive()) {
    try {
      const up = await uploadMedia(buffer, mime, file.name);
      await sendMedia(to, { kind: saved.kind, id: up.id, caption, filename: file.name });
      simulated = false;
    } catch (e) {
      const failed = addMessage(to, {
        dir: 'out', text: caption, status: 'failed', source: 'human',
        media: { ...saved, caption },
      });
      return NextResponse.json({ error: e.message, message: failed }, { status: 502 });
    }
  }

  const msg = addMessage(to, {
    dir: 'out', text: caption, status: 'sent', source: 'human',
    media: { ...saved, caption },
  });
  markHumanSend(to); // human took over -> pause the n8n bot for 15 min
  return NextResponse.json({ message: msg, simulated });
}
