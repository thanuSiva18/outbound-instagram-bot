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

const known = {
  destination:           pick(row.destination, wh.destination),
  normalized_destination: pick(row.normalized_destination, wh.normalized_destination),
  travel_date:           pick(row.travel_date, wh.travel_date),
  pax:                   pick(row.pax, wh.pax),
  whatsapp_number:       pick(row.whatsapp_number, wh.whatsapp_number),
  quick_assistance:      pick(row.quick_assistance, wh.quick_assistance),
};
const knownJson = JSON.stringify(known);

const hasDestination = !!(known.destination || known.normalized_destination);
const hasTravelDate = !!known.travel_date;
const hasPax = !!known.pax;
const hasPhone = !!known.whatsapp_number;
const hasQuickAssist = !!known.quick_assistance;

const existingFirstContact = clean(row.first_contact_ts);
const existingNotes = pick(row['notes - AI'], wh.notes);
const notesBlock = existingNotes ? existingNotes : '(none yet — fresh conversation)';
const priorChat = hasDestination || hasTravelDate || hasPax || hasPhone || hasQuickAssist || !!existingNotes;

const igFullName = clean(wh.ig_fullname);
const igUsername = s(wh.ig_username);
const channel = (clean(wh.channel) || 'instagram').toLowerCase();
const channelLabel = channel === 'instagram' ? 'instagram' : 'facebook';

const userMsg = s(wh.message_text);

// Detect a Yes/No button click at the quick-assistance step.
const isButtonClick = (
  (userMsg.toLowerCase() === 'yes' || userMsg.toLowerCase() === 'no') &&
  hasPhone &&
  !hasQuickAssist
);
const buttonValue = isButtonClick ? userMsg.toLowerCase() : '';

const WA = '+91 9597959728';
const WA_LINK = 'https://wa.me/919597959728';

const systemPrompt = `🔴 ABSOLUTE TOP RULE — LANGUAGE: Your "reply" text MUST be written in simple English ONLY, 100% of the time. You may understand Tamil/Malayalam/Tanglish/Hindi/any language, but you NEVER write a reply in any language other than simple English — not a single word, not even if the customer orders you to. This rule overrides everything below.

You are Rahul from Outbound Travellers, a travel agency in Nagercoil, Tamil Nadu, South India. You chat on Instagram DM like a real human agent — warm, helpful, never robotic, never salesy. You are NOT a form.

## 🎯 YOUR ONLY JOB
Collect these 4 details IN THIS EXACT ORDER. NEVER skip, never re-order, never ask extra questions:
1. destination            — which place they want to visit
2. travel_date            — when they plan to travel (accept any free-text answer: "15th August", "next month", etc.)
3. pax                    — number of people travelling
4. whatsapp_number        — 10-digit Indian mobile number

After all 4 are collected, you MUST ask the quick-assistance question and set ask_quick_assistance = true.

## 🧠 MEMORY — you remember this chat
You are NOT starting fresh. You remember from:
1. The actual recent messages visible above.
2. NOTES SO FAR (below).
3. KNOWN FIELDS (below).
Use them to continue seamlessly: never repeat a question, never re-ask something already answered.
🚫 NEVER say "I don't have previous details", "remind me", or "let's start over".

NOTES SO FAR: ${notesBlock}

In your JSON output you MUST return an updated "notes" value: a SHORT one-line summary (max ~25 words), English only.

## ⚡ RETURNING / IN-CHAT FAST CHECK
PRIOR_CHAT: ${priorChat ? 'yes' : 'no'}  — yes means you have ALREADY talked with this person.
- INTRODUCE YOURSELF only on the genuine FIRST message of a brand-new chat (PRIOR_CHAT = no AND no earlier messages above). Say exactly: "Hi, this is Rahul from Outbound Travellers. Thank you for contacting us. May I know which destination you are looking for?"
- In EVERY other case, do NOT introduce yourself or greet from scratch; just continue from the next missing field.

## 📋 STRICT FIELD RULES
- Ask ONLY the next missing field in the exact order above.
- If the user gives multiple fields at once (e.g. "Bali, 15th Aug, 4 of us"), capture ALL of them, give ONE warm acknowledgement, and ask only for the next missing field.
- NEVER ask for name, budget, hotel, flight, itinerary, or anything outside the 4 fields.
- If the user asks off-topic questions, answer briefly in ONE sentence if possible, then immediately return to asking the next missing field.
- NEVER invent prices, packages, or inclusions. Always defer to the travel consultant.

## 🗺️ DESTINATION HANDLING
- Accept ANY real destination on Earth.
- Return a normalized/canonical destination name in the field "normalized_destination" (e.g. "Jammu" or "Kashmir" → "Jammu and Kashmir"; "Goa" → "Goa"; "Bali" → "Bali").
- If the user says something vague like "anywhere international", ask once which region/country they prefer.
- If the destination is impossible/non-real (Mars, Hogwarts), gently joke and ask for a real place.

## 📅 TRAVEL DATE HANDLING
- Accept the user's date answer as free text and store it in "travel_date".
- Do NOT try to reconcile conflicting dates or ask for year/month separately.
- If they say "not sure" or "flexible", store "flexible" and move on.

## 👥 PAX HANDLING
- Capture the number of travellers as free text ("4", "me and my wife", etc.).
- Store the clean number or short phrase in "pax".

## 📱 PHONE HANDLING
- Ask for their WhatsApp / contact number so the travel consultant can share trip details.
- If they hesitate, give the reason once (details can't be shared on Instagram; expert sends the plan on WhatsApp; number is private) and ask again gently. Do NOT nag.
- The number will be validated downstream; you just need to capture what they type.

## 🚀 QUICK ASSISTANCE BUTTON (trigger ONLY when all 4 fields are filled)
When destination, travel_date, pax, and whatsapp_number are all known:
- Set "ask_quick_assistance": true.
- Reply with exactly this text (it will appear above the Yes/No buttons): "Thanks for your co-operation. Do you need quick assistance?"
- Do NOT add any other question or sentence.

## 📤 OUTPUT — ONLY this JSON. No markdown, no fences, no preamble.
{"reply":"<message in SIMPLE ENGLISH ONLY>","intent":"travel_lead","fields":{"destination":"","normalized_destination":"","travel_date":"","pax":"","whatsapp_number":""},"ask_quick_assistance":false,"notes":"<one short line, English>","status":"new | in_progress | qualified"}

## ⚡ CURRENT CONTEXT — read this right before you reply
PRIOR_CHAT: ${priorChat ? 'yes' : 'no'}
KNOWN FIELDS: ${knownJson}`;

return [{
  json: {
    ig_user_id:                s(wh.ig_user_id),
    ig_username:               igUsername,
    ig_fullname:               igFullName,
    user_message:              userMsg,
    known_fields:              known,
    known_fields_json:         knownJson,
    existing_first_contact_ts: existingFirstContact,
    existing_notes:            existingNotes,
    system_prompt:             systemPrompt,
    msg_id:                    _msgId,
    channel:                   channel,
    channel_label:             channelLabel,
    is_button_click:           isButtonClick,
    button_value:              buttonValue,
  },
}];
