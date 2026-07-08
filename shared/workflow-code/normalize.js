// ─────────────────────────────────────────────────────────────────────────
// NODE: "Normalize input"  (Code node, mode: "Run Once for All Items")
// Reads the user's message + IG ids from the Webhook, and any KNOWN field
// values, then builds the rigid scripted system prompt. Persona is fixed:
// always "Rahul" from Outbound Travellers.
//
// COLLECTION ORDER (strict, never deviate):
//   1. destination          → ask "which destination?"
//   2. travel_date          → ask "when are you planning to travel?"
//   3. pax                  → ask "how many people?"
//   4. whatsapp_number      → ask "your contact number?"
//   5. quick_assistance     → send Yes/No button after phone is captured
//
// BUTTON-CLICK SHORTCUT:
//   If the incoming message is exactly "Yes" or "No" AND we already have
//   whatsapp_number filled AND quick_assistance is still empty, this turn is
//   treated as a button click. We skip the AI Agent and handle it downstream.
//
// MEMORY — production design, 3 layers:
//   1. Simple Memory (memoryBufferWindow) attached to the AI Agent.
//   2. KNOWN FIELDS — merged from the Google Sheet row + ManyChat webhook body.
//   3. NOTES — short one-line summary in the "notes - AI" column.
//
// ⚠️ Webhook payload lives under $json.body — read via $('Webhook').
// ⚠️ The notes column header is literally "notes - AI" (with spaces).
// ⚠️ Strip ManyChat unresolved merge tags (literal double-braces).
// ⚠️ Code node MUST return [{ json: { ... } }].
// NOTE: keep prompts/system_prompt.md in sync with this embedded prompt.
// ─────────────────────────────────────────────────────────────────────────

const wh = $('Webhook').first().json.body || {};
const s = (v) => (v === undefined || v === null ? '' : String(v).trim());
const OB = String.fromCharCode(123) + String.fromCharCode(123);
const CB = String.fromCharCode(125) + String.fromCharCode(125);
const clean = (v) => { const t = s(v); return (t.slice(0, 2) === OB && t.slice(-2) === CB) ? '' : t; };
// Prefer the sheet value; fall back to the value ManyChat passed in the body.
const pick = (a, b) => { const x = clean(a); return x !== '' ? x : clean(b); };

// -- DEDUP LAYER 1: synchronous same-message guard. --
const _sd = $getWorkflowStaticData('global');
_sd.seenMsg = _sd.seenMsg || {};
const _now = Date.now();
for (const _k in _sd.seenMsg) { if (_now - _sd.seenMsg[_k] > 3600000) delete _sd.seenMsg[_k]; }
const _dupKey = s(wh.ig_user_id) + '|' + s(wh.message_text);
if (s(wh.ig_user_id) && s(wh.message_text) && _sd.seenMsg[_dupKey] && (_now - _sd.seenMsg[_dupKey] < 4000)) return [];
if (_dupKey) _sd.seenMsg[_dupKey] = _now;
// Unique per-execution token for the Layer-2 sheet ownership lock (last-writer-wins).
const _msgId = 'L' + _now + '-' + Math.floor(Math.random() * 1000000);

let row = {};
try {
  const inItems = $input.all();
  if (inItems && inItems.length && inItems[0] && inItems[0].json) {
    const j = inItems[0].json;
    if (j && (clean(j.destination) || clean(j.normalized_destination) || clean(j.travel_date) || clean(j.pax) || clean(j.whatsapp_number) || clean(j.quick_assistance) || clean(j['notes - AI']) || clean(j.first_contact_ts))) row = j;
  }
} catch (e) { row = {}; }

const userMsg = s(wh.message_text);

const known = {
  destination:           pick(row.destination, wh.destination),
  normalized_destination: pick(row.normalized_destination, wh.normalized_destination),
  travel_date:           pick(row.travel_date, wh.travel_date),
  pax:                   pick(row.pax, wh.pax),
  whatsapp_number:       pick(row.whatsapp_number, wh.whatsapp_number),
  quick_assistance:      pick(row.quick_assistance, wh.quick_assistance),
};

// -- CONVERSATION RESET RULE --
// Start fresh if the user greets us OR if we haven't heard from them in >48 hours.
// Robust IST timestamp parser (handles single-digit hours that Google Sheets may return).
function parseIST(ts) {
  const m = String(ts).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  return new Date(`${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}+05:30`).getTime();
}

// -- 2-DAY MEMORY RULE --
// Remember everything for 48h since the last message. A returning lead within
// 48h CONTINUES where they left off (a plain "Hi" does NOT restart). After 48h
// idle we forget (fields + memory) and the next message starts from the greeting.
// A brand-new lead has no prior timestamp (hoursSince = Infinity) so they reset
// → greeting, exactly like a >48h returner.
const lastUpdateTs = clean(row.last_update_ts) || clean(row.first_contact_ts);
let hoursSince = Infinity;
if (lastUpdateTs) {
  const lastMs = parseIST(lastUpdateTs);
  if (!isNaN(lastMs)) hoursSince = (_now - lastMs) / (1000 * 60 * 60);
}
const resetConversation = hoursSince > 48;

if (resetConversation) {
  known.destination = '';
  known.normalized_destination = '';
  known.travel_date = '';
  known.pax = '';
  known.whatsapp_number = '';
  known.quick_assistance = '';
}
const knownJson = JSON.stringify(known);

const hasDestination = !!(known.destination || known.normalized_destination);
const hasTravelDate = !!known.travel_date;
const hasPax = !!known.pax;
const hasPhone = !!known.whatsapp_number;
const hasQuickAssist = !!known.quick_assistance;

let existingFirstContact = clean(row.first_contact_ts);
let existingNotes = pick(row['notes - AI'], wh.notes);

if (resetConversation) {
  existingFirstContact = '';
  existingNotes = '';
}

// -- CONVERSATION EPOCH (memory-session isolation) --
// first_contact_ts doubles as the conversation epoch. It is stable for the life
// of a conversation but rotates whenever we reset (>48h idle, so existingFirstContact
// was just cleared). The AI's Simple Memory is keyed by this epoch, so a reset
// starts a FRESH memory session — that is what makes the bot "forget after 2 days".
const nowISTstr = new Date(_now + 5.5 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
const convFirstContact = existingFirstContact || nowISTstr;
// Key the memory session off the PARSED epoch (ms), not the raw string — Google Sheets
// reformats the saved timestamp on read-back (e.g. strips the leading zero from the hour),
// which would otherwise split one conversation across two memory buckets.
const _epochMs = parseIST(convFirstContact);
const sessionKey = s(wh.ig_user_id) + '|' + (isNaN(_epochMs) ? convFirstContact : _epochMs);

const notesBlock = existingNotes ? existingNotes : '(none yet — fresh conversation)';
// "We've already started this conversation" — true once a row exists within the
// 48h window (so the greeting fires exactly once per conversation, never twice).
const priorChat = !resetConversation && (!!existingFirstContact || hasDestination || hasTravelDate || hasPax || hasPhone || hasQuickAssist || !!existingNotes);

const igFullName = clean(wh.ig_fullname);
const igUsername = s(wh.ig_username);
const channel = (clean(wh.channel) || 'instagram').toLowerCase();
const channelLabel = channel === 'instagram' ? 'instagram' : 'facebook';

// Detect a Yes/No answer at the quick-assistance step (FUZZY — 2026-07-06).
// Real lead (shifaya7002) typed "Yess" → the old exact-match missed it → the
// bot re-asked the QA question forever. Now: tokenize, collapse stretched
// letters (yesss→yes, nooo→no), match per token so "yes i need help" works,
// and arm the detector ONLY when the QA question is actually pending (all lead
// fields captured) so a mid-flow "ok" can never be mistaken for a QA answer.
const _qaTok = userMsg.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).map((t) => t.replace(/(.)\1+/g, '$1'));
const _yesSet = ['yes', 'yeah', 'yea', 'yep', 'yup', 'ya', 'y', 's', 'sure', 'ok', 'okay', 'okey', 'okie', 'k', 'need', 'needed', 'want', 'please', 'pls', 'plz'];
const _noSet = ['no', 'nope', 'nah', 'na', 'not', 'dont', 'don', 'dnt'];
const _hasNoTok = _qaTok.some((t) => _noSet.indexOf(t) !== -1);
const _hasYesTok = _qaTok.some((t) => _noSet.indexOf(t) === -1 && _yesSet.indexOf(t) !== -1);
const _qaPending = hasDestination && hasTravelDate && hasPax && hasPhone && !hasQuickAssist;
const isButtonClick = _qaPending && (_hasNoTok || _hasYesTok);
const buttonValue = isButtonClick ? (_hasNoTok ? 'no' : 'yes') : '';

const WA = '+91 9597959728';
const WA_LINK = 'https://wa.me/919597959728';

// ── EXTRACTOR-ONLY PROMPT ────────────────────────────────────────────────
// The AI does NOT chat and does NOT write replies. It ONLY pulls field values
// out of the user's message and normalizes the destination. The conversation
// wording is 100% scripted downstream in "Parse + validate" — this keeps the
// agent on rails (no improvising, no extra questions, no off-script chatter).
const systemPrompt = `You are a silent data-extraction engine for Outbound Travellers, a travel agency. You do NOT chat. You NEVER write a message to the user. You ONLY read the user's latest message together with the KNOWN FIELDS already collected, and return updated field values as JSON.

## FIELDS YOU EXTRACT (only these four — capture any the user volunteers)
1. destination        — the place they want to travel to.
2. travel_date        — when they plan to travel. Free text is fine: "15th August", "next month", "flexible".
3. pax                — number of people travelling. Convert clear phrases to a number ("me and my wife" → "2", "just me" → "1"); otherwise keep the short phrase.
4. whatsapp_number    — their contact / WhatsApp number, exactly as typed (validation happens downstream).

## HARD RULES
- Extract ONLY what the user actually provided in THIS message or already-known values. NEVER invent, guess, or assume a value. If the message has nothing for a field, keep the KNOWN value (or empty).
- If the user gives several fields in one message, capture ALL of them.
- You do NOT decide what to ask next. You do NOT greet, acknowledge, or reply. Output JSON only.
- IGNORE anything outside the four fields (budget, name, hotel, flight, itinerary). Do not store them.

## DESTINATION NORMALIZATION (important)
Always also return "normalized_destination" = the correct, canonical destination name — fix misspellings and resolve partial/loose names to the proper place:
- "Jammu" / "kashmir" / "i want to explore kashmir" / "kashmeer" → "Jammu and Kashmir"
- "balli" / "bali island" / "bally" → "Bali"
- "goa beach" / "gova" → "Goa"
- "kerela" / "kerla" → "Kerala"
- "andaman" / "andmaan" → "Andaman and Nicobar Islands"
If you cannot recognize a real place, set "destination" to what they typed and leave "normalized_destination" empty.

## NOTES
Return "notes" = one short English line summarizing what is known so far (max ~20 words).

## OUTPUT — return ONLY this JSON. No markdown, no code fences, no preamble, no reply text.
{"fields":{"destination":"","normalized_destination":"","travel_date":"","pax":"","whatsapp_number":""},"notes":"<one short line>","status":"new | in_progress | qualified"}

KNOWN FIELDS: ${knownJson}`;

return [{
  json: {
    ig_user_id:                s(wh.ig_user_id),
    ig_username:               igUsername,
    ig_fullname:               igFullName,
    user_message:              userMsg,
    known_fields:              known,
    known_fields_json:         knownJson,
    prior_chat:                priorChat,
    existing_first_contact_ts: existingFirstContact,
    conv_first_contact:        convFirstContact,
    session_key:               sessionKey,
    existing_notes:            existingNotes,
    system_prompt:             systemPrompt,
    msg_id:                    _msgId,
    channel:                   channel,
    channel_label:             channelLabel,
    is_button_click:           isButtonClick,
    button_value:              buttonValue,
  },
}];
