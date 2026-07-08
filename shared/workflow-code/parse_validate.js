// ─────────────────────────────────────────────────────────────────────────
// NODE: "Parse + validate"  (Code node, "Run Once for All Items")
// Parses the AI Agent JSON output for the new Rahul scripted flow.
// Validates the WhatsApp number, merges fields over known ones, computes
// status, and keeps the running one-line notes summary.
// ⚠️ Code node MUST return [{ json: { ... } }].
// ─────────────────────────────────────────────────────────────────────────

// Core 4 fields. A lead is "qualified" once all four are captured.
const QUALIFY = ['destination', 'travel_date', 'pax', 'whatsapp_number'];
const FIELDS = ['destination', 'normalized_destination', 'travel_date', 'pax', 'whatsapp_number'];

// 1. Grab the raw LLM text (AI Agent → $json.output; other shapes as fallback).
const up = $json || {};
let raw = '';
if (typeof up.output === 'string') raw = up.output;
else if (up.output && typeof up.output === 'object') raw = JSON.stringify(up.output);
else if (up.message && typeof up.message.content === 'string') raw = up.message.content;
else if (up.choices && up.choices[0] && up.choices[0].message) raw = up.choices[0].message.content;
else if (typeof up.text === 'string') raw = up.text;
else if (typeof up.content === 'string') raw = up.content;

// 2. Strip stray ```json fences, parse safely.
let parsed = null;
try {
  const cleaned = String(raw).replace(/```json/gi, '').replace(/```/g, '').trim();
  if (cleaned) parsed = JSON.parse(cleaned);
} catch (e) { parsed = null; }

// 3. Safe fallback — malformed JSON / AI failure must not crash the flow.
if (!parsed || typeof parsed !== 'object') {
  parsed = {
    reply: 'Thanks so much for messaging Outbound Travellers! 😊 Our team will get back to you very shortly.',
    intent: 'travel_lead',
    fields: {},
    ask_quick_assistance: false,
    notes: '',
    status: 'in_progress',
  };
}

// 4. Validate intent.
const VALID = ['travel_lead', 'office_info', 'career', 'customer_query'];
let intent = (parsed.intent && String(parsed.intent).trim()) || 'travel_lead';
if (VALID.indexOf(intent) === -1) intent = 'travel_lead';

const llmFields = (parsed.fields && typeof parsed.fields === 'object') ? parsed.fields : {};
const norm = $('Normalize input').first().json;
const knownF = norm.known_fields || {};

const OB = String.fromCharCode(123) + String.fromCharCode(123);
const CB = String.fromCharCode(125) + String.fromCharCode(125);
const strip = (v) => { const t = (v === undefined || v === null) ? '' : String(v).trim(); return (t.slice(0, 2) === OB && t.slice(-2) === CB) ? '' : t; };

function cleanPhone(v) {
  if (!v) return '';
  let d = String(v).replace(/\D/g, '');
  // Indian 10-digit mobile (optionally written with 91 / 0 / +91) -> '+91 xxxxx xxxxx'
  let in10 = d;
  if (in10.length === 12 && in10.startsWith('91')) in10 = in10.slice(2);
  else if (in10.length === 11 && in10.startsWith('0')) in10 = in10.slice(1);
  if (in10.length === 10 && /^[6-9]/.test(in10)) return '+91 ' + in10.slice(0, 5) + ' ' + in10.slice(5);
  // International number (came with its own country code / + sign) -> keep it, with the +
  const hadPlus = String(v).trim().charAt(0) === '+';
  if (d.startsWith('00')) d = d.slice(2);
  if (hadPlus || (d.length >= 11 && d.length <= 15)) return '+' + d;
  return '';
}

// 5. Merge. For non-travel intents, don't let the LLM invent lead data.
const takeLLM = (intent === 'travel_lead');
const merged = {};
for (const f of FIELDS) {
  const nv = takeLLM ? strip(llmFields[f]) : '';
  const kv = strip(knownF[f]);
  merged[f] = nv !== '' ? nv : kv;
}
merged.whatsapp_number = cleanPhone(merged.whatsapp_number);

// If the AI returned a destination but no normalized_destination, fall back to destination.
if (!merged.normalized_destination && merged.destination) {
  merged.normalized_destination = merged.destination;
}

// 6. Notes (running summary). Take the LLM's fresh summary when it gave one.
const newNotes = strip(parsed.notes);
const prevNotes = strip(norm.existing_notes);
const notes = newNotes !== '' ? newNotes : prevNotes;

// 7. Status: qualified once the core 4 are filled; in_progress if anything captured.
const qualified = QUALIFY.every((f) => merged[f] && merged[f] !== '');
const anyFilled = FIELDS.some((f) => merged[f] && merged[f] !== '');
const status = qualified ? 'qualified' : (anyFilled ? 'in_progress' : 'new');

// 8. DETERMINISTIC SCRIPTED REPLY — the AI only extracts fields; every line the
//    customer sees is fixed here, so the agent cannot improvise or go off-script.
//    Pick the message for the next missing field, in strict order:
//    destination → travel_date → pax → whatsapp_number → quick-assistance.
const hasDest  = !!(merged.destination || merged.normalized_destination);
const hasDate  = !!merged.travel_date;
const hasPaxF  = !!merged.pax;
const hasPhone = !!(merged.whatsapp_number && merged.whatsapp_number !== '');
const priorChat = norm.prior_chat === true;

// Ask quick-assistance once all four are captured and it isn't already answered.
const askQuickAssist = hasDest && hasDate && hasPaxF && hasPhone && !strip(knownF.quick_assistance);

let replyText;
if (askQuickAssist) {
  replyText = 'Thanks for your cooperation. Do you need quick assistance?';
} else if (!hasDest) {
  // First contact gets the full intro; a continuing chat just re-asks for destination.
  replyText = priorChat
    ? 'May I know which destination you are looking for?'
    : 'Hi, this is Rahul from Outbound Travellers. Thank you for contacting us. May I know which destination you are looking for?';
} else if (!hasDate) {
  replyText = 'Great choice! When are you planning to travel?';
} else if (!hasPaxF) {
  replyText = 'Great. May I know the number of people travelling?';
} else if (!hasPhone) {
  replyText = 'Thanks for the information. Could you please share your contact number so our travel consultant can help you with the trip details?';
} else {
  // All four captured and quick-assistance already answered.
  replyText = 'Thank you! Our travel consultant will get back to you shortly.';
}

// 9. CRM push is handled by the Button handler on a Yes click (not on the phone turn).
const crmPush = false;

// 10. Timestamps. Use the conversation epoch from Normalize as first_contact_ts so the
//     saved value matches the memory session key (both rotate together on a >48h reset).
const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
const firstContact = (norm.conv_first_contact && String(norm.conv_first_contact).trim())
  || (norm.existing_first_contact_ts && String(norm.existing_first_contact_ts).trim())
  || nowIST;

return [{
  json: {
    ig_user_id:          norm.ig_user_id,
    ig_username:         norm.ig_username,
    reply:               replyText,
    intent,
    is_lead:             !!(merged.whatsapp_number && merged.whatsapp_number !== ''),
    destination:         merged.destination,
    normalized_destination: merged.normalized_destination,
    travel_date:         merged.travel_date,
    pax:                 merged.pax,
    whatsapp_number:     merged.whatsapp_number,
    quick_assistance:    '',
    ask_quick_assistance: askQuickAssist,
    notes,
    status,
    crm_push:            crmPush,
    first_contact_ts:    firstContact,
    last_update_ts:      nowIST,
  },
}];
