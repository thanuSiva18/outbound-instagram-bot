import { NextResponse } from 'next/server';
import { listConversations } from '@/lib/store';
import { isLive } from '@/lib/meta';
import { aiProvider } from '@/lib/ai';

export const dynamic = 'force-dynamic';

// GET /api/conversations -> sidebar list + server mode flags
export async function GET() {
  return NextResponse.json({
    conversations: listConversations(),
    mode: isLive() ? 'live' : 'simulation',
    ai: aiProvider(),
  });
}
