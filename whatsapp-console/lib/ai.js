// ------------------------------------------------------------------
//  Pluggable AI auto-reply.
//  Priority: Anthropic (Claude)  >  OpenAI  >  scripted fallback.
//  Returns a short string reply given the conversation history.
//  This is the "Anant"/AI brain the dashboard can toggle per chat.
// ------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Rahul, a warm, concise travel assistant for "Outbound Travelers" on WhatsApp.
Goal: qualify the lead by collecting three things, ONE question at a time, in order:
1) destination  2) travel_date  3) number of travellers (pax).
Once you have all three, summarise them back and offer a callback from a travel expert.
Rules: keep replies under 2 short sentences, friendly, use the occasional emoji, never ask for the phone number (you already have it), never repeat a question already answered.`;

function history(conv) {
  // Map stored messages -> {role, content} turns.
  return conv.messages.map((m) => ({
    role: m.dir === 'in' ? 'user' : 'assistant',
    content: m.text,
  }));
}

async function viaAnthropic(conv) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: history(conv),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Anthropic error');
  return data.content?.map((b) => b.text).join('').trim();
}

async function viaOpenAI(conv) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.35,
      max_tokens: 256,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history(conv)],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'OpenAI error');
  return data.choices?.[0]?.message?.content?.trim();
}

// Deterministic fallback that walks the Rahul script using what's known.
function scripted(conv) {
  const userTurns = conv.messages.filter((m) => m.dir === 'in').length;
  const replies = [
    "Hi! I'm Rahul from Outbound Travelers 🌍 Which destination are you dreaming of?",
    'Lovely choice! What travel date are you looking at? 📅',
    'Great — and how many travellers (pax) will be going? 👨‍👩‍👧',
    'Perfect, I have everything I need 🙌 Would you like a travel expert to call you with a custom quote?',
  ];
  return replies[Math.min(userTurns, replies.length - 1)];
}

export async function generateReply(conv) {
  try {
    if (process.env.ANTHROPIC_API_KEY) return (await viaAnthropic(conv)) || scripted(conv);
    if (process.env.OPENAI_API_KEY) return (await viaOpenAI(conv)) || scripted(conv);
  } catch (e) {
    // fall through to scripted on any provider error
    console.error('[ai] provider error:', e.message);
  }
  return scripted(conv);
}

export function aiProvider() {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'scripted';
}
