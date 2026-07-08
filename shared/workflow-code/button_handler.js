// ─────────────────────────────────────────────────────────────────────────
// NODE: "Button handler"  (Code node, "Run Once for All Items")
// Handles the Yes/No quick-assistance button click deterministically (no AI).
// Runs when Normalize input detects is_button_click = true.
//
// Working hours: Monday–Saturday, 9:00 AM – 5:30 PM IST. Sunday is a full holiday.
// Anything outside that (before 9:00, from 5:30 PM onward, or any time Sunday) = "after-hours".
//
//   Yes + within hours  → "Our travel consultant will reach you shortly."
//   Yes + after-hours   → "...will reach you during our working hours (9:00 AM – 5:30 PM)."
//   No                  → polite thank-you, end of chat.
//   Yes (either case)   → tag the lead quick_assistance = "yes" + push to CRM.
//
// ⚠️ Code node MUST return [{ json: { ... } }].
// ─────────────────────────────────────────────────────────────────────────

const norm = $('Normalize input').first().json;
const knownF = norm.known_fields || {};
const buttonValue = norm.button_value || '';

const OB = String.fromCharCode(123) + String.fromCharCode(123);
const CB = String.fromCharCode(125) + String.fromCharCode(125);
const strip = (v) => { const t = (v === undefined || v === null) ? '' : String(v).trim(); return (t.slice(0, 2) === OB && t.slice(-2) === CB) ? '' : t; };

// Current time in IST (UTC+5:30).
const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
const day = now.getUTCDay();                       // 0 = Sunday, 6 = Saturday
const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
const WORK_START = 9 * 60;                          // 9:00 AM
const WORK_END = 17 * 60 + 30;                      // 5:30 PM
const withinHours = (day !== 0) && (minutes >= WORK_START) && (minutes < WORK_END);  // Sunday (day 0) = full holiday

let reply = '';
let quickAssistance = '';
let crmPush = false;

if (buttonValue === 'yes') {
  quickAssistance = 'yes';
  crmPush = true;
  reply = withinHours
    ? 'Our travel consultant will reach you shortly.'
    : 'Thank you! Our travel consultant will reach you during our working hours (9:00 AM – 5:30 PM).';
} else if (buttonValue === 'no') {
  quickAssistance = 'no';
  crmPush = false;
  reply = 'Thank you! Have a great day. Our travel consultant will still connect with you soon.';
} else {
  // Fallback (should never happen — Button handler only runs on a Yes/No click).
  quickAssistance = '';
  crmPush = false;
  reply = 'Thank you! Our team will get back to you shortly.';
}

const nowIST = now.toISOString().replace('T', ' ').slice(0, 19);
const firstContact = (norm.conv_first_contact && String(norm.conv_first_contact).trim())
  || (norm.existing_first_contact_ts && String(norm.existing_first_contact_ts).trim())
  || nowIST;

return [{
  json: {
    ig_user_id:          norm.ig_user_id,
    ig_username:         norm.ig_username,
    reply:               reply,
    intent:              'travel_lead',
    is_lead:             true,
    destination:         strip(knownF.destination),
    normalized_destination: strip(knownF.normalized_destination),
    travel_date:         strip(knownF.travel_date),
    pax:                 strip(knownF.pax),
    whatsapp_number:     strip(knownF.whatsapp_number),
    quick_assistance:    quickAssistance,
    ask_quick_assistance: false,
    notes:               strip(norm.existing_notes) || ('Quick assistance: ' + quickAssistance),
    status:              'qualified',
    crm_push:            crmPush,
    first_contact_ts:    firstContact,
    last_update_ts:      nowIST,
    assigned_to:         '',
    msg_id:              norm.msg_id || '',
  },
}];
