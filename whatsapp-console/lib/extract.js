// ------------------------------------------------------------------
//  Lead field extractor — turns a WhatsApp conversation into the 13
//  Rahul-schema fields. Uses the same AI provider as replies; falls
//  back to lightweight heuristics when no key is set.
// ------------------------------------------------------------------

const EXTRACT_PROMPT = `Extract travel-lead fields from the WhatsApp conversation.
Return ONLY minified JSON with these keys (use "" when unknown):
{"destination":"","normalized_destination":"","travel_date":"","pax":"","quick_assistance":"","notes":""}
- destination: place the customer typed.
- normalized_destination: canonical name (e.g. "kashmir"->"Jammu and Kashmir").
- travel_date: free text (e.g. "15th August").
- pax: number of travellers as digits.
- quick_assistance: "yes", "no", or "" (set only if they answered the callback offer).
- notes: one short line summarising the lead for a human agent.
No prose, JSON only.`;

function transcript(conv) {
  return conv.messages
    .map((m) => `${m.dir === 'in' ? 'Customer' : 'Agent'}: ${m.text || (m.media ? '[' + m.media.kind + ']' : '')}`)
    .join('\n');
}

function safeJson(s) {
  try { return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); } catch { return null; }
}

async function viaAnthropic(conv) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: EXTRACT_PROMPT,
      messages: [{ role: 'user', content: transcript(conv) }],
    }),
  });
  const data = await res.json();
  return safeJson(data.content?.map((b) => b.text).join('') || '');
}

async function viaOpenAI(conv) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: EXTRACT_PROMPT }, { role: 'user', content: transcript(conv) }],
    }),
  });
  const data = await res.json();
  return safeJson(data.choices?.[0]?.message?.content || '');
}

// crude regex fallback so the sheet still fills without an AI key
function heuristic(conv) {
  const text = conv.messages.filter((m) => m.dir === 'in').map((m) => m.text).join(' ');
  const pax = (text.match(/\b(\d{1,2})\s*(pax|people|persons?|travellers?|of us|adults?)\b/i) || [])[1]
    || (/\bjust the two|just us two|2 of us\b/i.test(text) ? '2' : '');
  const date = (text.match(/\b(\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/i) || [])[1] || '';
  const qa = /\byes\b/i.test(text) ? 'yes' : /\bnot? (right )?now|no thanks|no\b/i.test(text) ? 'no' : '';
  return { destination: '', normalized_destination: '', travel_date: date, pax, quick_assistance: qa, notes: '' };
}

export async function extractLead(conv) {
  try {
    if (process.env.ANTHROPIC_API_KEY) return (await viaAnthropic(conv)) || heuristic(conv);
    if (process.env.OPENAI_API_KEY) return (await viaOpenAI(conv)) || heuristic(conv);
  } catch (e) {
    console.error('[extract] error:', e.message);
  }
  return heuristic(conv);
}
