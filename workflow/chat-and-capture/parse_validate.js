// ─────────────────────────────────────────────────────────────────────────
// NODE: "Parse + validate"  (Code node, "Run Once for All Items")
// Parses the AI Agent JSON output, reads the classified `intent`, validates the
// WhatsApp number, merges fields over known ones, and computes status.
//
// Sheet stays LEAD-ONLY: only travel_lead (or an existing lead row) sets
// is_lead=true; the downstream "Is lead?" IF node gates the Google Sheets write
// so career / office_info / casual customer_query never create rows.
// ⚠️ Code node MUST return [{ json: { ... } }].
// ─────────────────────────────────────────────────────────────────────────

// All 5 are mandatory — a lead is "qualified" only once every one is captured.
const QUALIFY = ['name', 'destination', 'pax', 'budget', 'whatsapp_number'];
const FIELDS = ['name', 'whatsapp_number', 'destination', 'pax', 'budget'];

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

// 3. Safe fallback — malformed JSON must not crash the flow.
if (!parsed || typeof parsed !== 'object') {
  parsed = { reply: 'Sorry, could you say that again? \u{1F642}', intent: 'customer_query', fields: {}, status: 'in_progress' };
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
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0'))  d = d.slice(1);
  return d.length === 10 ? d : '';
}

// 5. Merge. For non-travel intents, don't let the LLM invent lead data — keep
//    only the existing known values.
const takeLLM = (intent === 'travel_lead');
const merged = {};
for (const f of FIELDS) {
  const nv = takeLLM ? strip(llmFields[f]) : '';
  const kv = strip(knownF[f]);
  merged[f] = nv !== '' ? nv : kv;
}
merged.whatsapp_number = cleanPhone(merged.whatsapp_number);

// 6. Status: qualified once the QUALIFY fields are in; in_progress if anything
//    is captured; new otherwise.
const qualified = QUALIFY.every((f) => merged[f] && merged[f] !== '');
const anyFilled = FIELDS.some((f) => merged[f] && merged[f] !== '');
const status = qualified ? 'qualified' : (anyFilled ? 'in_progress' : 'new');

// 7. Timestamps; preserve original first_contact_ts if the row existed.
const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
const firstContact = (norm.existing_first_contact_ts && String(norm.existing_first_contact_ts).trim()) || nowIST;

// 8. is_lead → gates the sheet write. True for travel_lead, or if a lead row
//    already exists for this user (so we keep updating it).
const hadRow = FIELDS.some((f) => strip(knownF[f]) !== '');
const isLead = (intent === 'travel_lead') || hadRow;

return [{
  json: {
    ig_user_id:   norm.ig_user_id,
    ig_username:  norm.ig_username,
    reply:        (parsed.reply && String(parsed.reply).trim()) || 'Got it! \u{1F64F}',
    intent,
    is_lead:      isLead,
    name:            merged.name,
    whatsapp_number: merged.whatsapp_number,
    destination:     merged.destination,
    pax:             merged.pax,
    budget:          merged.budget,
    status,
    first_contact_ts: firstContact,
    last_update_ts:  nowIST,
  },
}];
