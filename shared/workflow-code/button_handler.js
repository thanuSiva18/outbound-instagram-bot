// ─────────────────────────────────────────────────────────────────────────
// NODE: "Button handler"  (Code node, "Run Once for All Items")
// Handles Yes/No quick-assistance button clicks deterministically.
// Runs when Normalize input detects is_button_click = true.
//
// Working hours (Mon–Sat): 9:00 AM – 5:30 PM IST.
// Sunday: always after-hours (office closed) → "tomorrow" message.
// ⚠️ Code node MUST return [{ json: { ... } }].
// ─────────────────────────────────────────────────────────────────────────

const norm = $('Normalize input').first().json;
const knownF = norm.known_fields || {};
const buttonValue = norm.button_value || '';

const OB = String.fromCharCode(123) + String.fromCharCode(123);
const CB = String.fromCharCode(125) + String.fromCharCode(125);
const strip = (v) => { const t = (v === undefined || v === null) ? '' : String(v).trim(); return (t.slice(0, 2) === OB && t.slice(-2) === CB) ? '' : t; };

// Current time in IST (UTC+5:30)
const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
const day = now.getUTCDay();        // 0 = Sunday, 1 = Monday, ...
const hour = now.getUTCHours();
const minute = now.getUTCMinutes();

let reply = '';
let quickAssistance = '';
let crmPush = false;

if (buttonValue === 'yes') {
  quickAssistance = 'yes';
  crmPush = true;
  if (day === 0) {
    reply = 'Thank you. Our travel consultant will reach you during working hours tomorrow (Monday, 9:00 AM – 5:30 PM).';
  } else if (hour > 9 || (hour === 9 && minute >= 0)) {
    // 9:00 AM or later
    if (hour < 17 || (hour === 17 && minute <= 30)) {
      reply = 'Our travel consultant will reach you shortly.';
    } else {
      reply = 'Thank you. Our travel consultant will reach you during working hours (9:00 AM – 5:30 PM).';
    }
  } else {
    reply = 'Thank you. Our travel consultant will reach you during working hours (9:00 AM – 5:30 PM).';
  }
} else if (buttonValue === 'no') {
  quickAssistance = 'no';
  crmPush = false;
  reply = 'Thank you for your time. Our travel consultant will still connect with you soon. Have a great day!';
} else {
  // Fallback (should never happen)
  quickAssistance = '';
  crmPush = false;
  reply = 'Thanks so much for messaging Outbound Travellers! 😊 Our team will get back to you very shortly.';
}

const nowIST = now.toISOString().replace('T', ' ').slice(0, 19);
const firstContact = (norm.existing_first_contact_ts && String(norm.existing_first_contact_ts).trim()) || nowIST;

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
    notes:               strip(norm.existing_notes) || `Quick assistance: ${quickAssistance}`,
    status:              'qualified',
    crm_push:            crmPush,
    first_contact_ts:    firstContact,
    last_update_ts:      nowIST,
    assigned_to:         '',
    msg_id:              norm.msg_id || '',
  },
}];
