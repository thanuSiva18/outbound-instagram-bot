// ─────────────────────────────────────────────────────────────────────────
// NODE: "Parse + validate"  (Code node, "Run Once for All Items")
// Parses the OpenAI JSON output, validates the WhatsApp number, merges new
// fields over known ones, and computes status. Never crashes the workflow.
//
// ⚠️ Code node MUST return [{ json: { ... } }].
// Reads known fields back from the "Normalize input" node by name.
// ─────────────────────────────────────────────────────────────────────────

const FIELDS = ['name', 'whatsapp_number', 'destination', 'pax', 'budget'];

// 1. Grab the raw LLM text wherever the OpenAI node placed it.
const up = $json || {};
let raw = '';
if (up.message && typeof up.message.content === 'string') raw = up.message.content;
else if (up.choices && up.choices[0] && up.choices[0].message) raw = up.choices[0].message.content;
else if (typeof up.text === 'string') raw = up.text;
else if (typeof up.content === 'string') raw = up.content;
else raw = '';

// 2. Strip stray ```json fences, then parse safely.
let parsed = null;
try {
  const cleaned = String(raw).replace(/```json/gi, '').replace(/```/g, '').trim();
  if (cleaned) parsed = JSON.parse(cleaned);
} catch (e) {
  parsed = null;
}

// 3. Safe fallback — malformed JSON must not crash the flow (CLAUDE.md §9).
if (!parsed || typeof parsed !== 'object') {
  parsed = { reply: 'Sorry, could you say that again? 🙂', fields: {}, status: 'in_progress' };
}
const llmFields = (parsed.fields && typeof parsed.fields === 'object') ? parsed.fields : {};

// 4. Known fields forwarded from Normalize.
const norm  = $('Normalize input').first().json;
const known = norm.known_fields || {};

// 5. Validate whatsapp_number: digits only, strip +91 / leading 0, expect 10.
function cleanPhone(v) {
  if (!v) return '';
  let d = String(v).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0'))  d = d.slice(1);
  return d.length === 10 ? d : ''; // junk → empty so the bot re-asks once
}

// 6. Merge: keep known value unless a non-empty new value arrived.
const merged = {};
for (const f of FIELDS) {
  const nv = (llmFields[f] !== undefined && llmFields[f] !== null) ? String(llmFields[f]).trim() : '';
  const kv = (known[f] !== undefined && known[f] !== null) ? String(known[f]).trim() : '';
  merged[f] = nv !== '' ? nv : kv;
}
merged.whatsapp_number = cleanPhone(merged.whatsapp_number);

// 7. Compute status from completeness (overrides whatever the LLM guessed).
const filled = FIELDS.filter((f) => merged[f] && merged[f] !== '').length;
const status = filled === FIELDS.length ? 'qualified' : (filled > 0 ? 'in_progress' : 'new');

// 8. Timestamp in IST (UTC+5:30) as "YYYY-MM-DD HH:MM:SS".
const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  .toISOString().replace('T', ' ').slice(0, 19);

return [{
  json: {
    ig_user_id:   norm.ig_user_id,
    ig_username:  norm.ig_username,
    reply:        (parsed.reply && String(parsed.reply).trim()) || 'Got it! 🙏',
    name:            merged.name,
    whatsapp_number: merged.whatsapp_number,
    destination:     merged.destination,
    pax:             merged.pax,
    budget:          merged.budget,
    status,
    last_update_ts:  nowIST,
    // first_contact_ts is set only when the row is created — see docs/google-sheet-schema.md
    first_contact_ts: nowIST,
  },
}];
