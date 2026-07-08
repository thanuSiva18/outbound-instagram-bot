// ------------------------------------------------------------------
//  Shared inbound pipeline — used by BOTH the real Meta webhook and
//  the /api/simulate dev endpoint, so behaviour is identical whether
//  a message arrives from a real handset or the simulator.
// ------------------------------------------------------------------
import { upsertConversation, addMessage, getConversation } from './store.js';
import { generateReply } from './ai.js';
import { sendText } from './meta.js';
import { saveLeadFromConversation } from './leads.js';

// from: raw msisdn (e.g. "919876543210"); name: optional profile name;
// text: body/caption; media: optional { kind, url, mime, filename }
export async function processInbound({ from, name, text, media }) {
  upsertConversation(from, { name, phone: `+${from}` });
  addMessage(from, { dir: 'in', text, media });

  // Extract + persist lead fields to the Google Sheet (best-effort, non-blocking).
  saveLeadFromConversation(from).catch((e) => console.error('[inbound] lead save:', e.message));

  const conv = getConversation(from);
  if (!conv?.autoReply) {
    // Human takeover: leave it for the agent to answer from the dashboard.
    return { replied: false, reason: 'auto-reply off' };
  }

  // AI is on → generate + send a reply.
  const reply = await generateReply(conv);
  try {
    await sendText(from, reply); // real Meta call, or no-op in simulation mode
  } catch (e) {
    console.error('[inbound] send failed:', e.message);
  }
  addMessage(from, { dir: 'out', text: reply, status: 'sent', source: 'ai' });
  return { replied: true, reply };
}
