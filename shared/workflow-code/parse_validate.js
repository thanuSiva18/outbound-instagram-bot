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

// 8. Should we ask the quick-assistance question? Only on the turn where we first
//    become qualified, and only if quick_assistance isn't already answered.
const askQuickAssist = qualified && !strip(knownF.quick_assistance) && !!parsed.ask_quick_assistance;

// 9. CRM push is handled by the Button handler when the user clicks Yes.
//    We do NOT push on the phone-number turn because the quick-assistance
//    answer may change the lead tag.
const crmPush = false;

// 10. Timestamps; preserve original first_contact_ts if the row existed.
const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
const firstContact = (norm.existing_first_contact_ts && String(norm.existing_first_contact_ts).trim()) || nowIST;

return [{
  json: {
    ig_user_id:          norm.ig_user_id,
    ig_username:         norm.ig_username,
    reply:               (parsed.reply && String(parsed.reply).trim()) || 'Got it! 🙏',
    intent,
    is_lead:             true,
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
