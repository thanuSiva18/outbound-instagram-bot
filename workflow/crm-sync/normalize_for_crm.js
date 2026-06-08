// ─────────────────────────────────────────────────────────────────────────
// NODE: "Normalize for CRM"  (Code node, "Run Once for All Items")
// Workflow: "Outbound IG Lead Bot — 3 · CRM Sync (Workpex)" (yH0weFfeYiobqdZq)
//
// Flow 3 receives the qualified lead from Flow 1's "Push to CRM" node (POST to
// /webhook/crm-lead-sync) and forwards it to the Workpex CRM intake form. The
// raw values the bot captured are free text; the Workpex form has stricter
// fields, so this node normalizes THREE of them before "Send to CRM":
//
//   • travel_budget — free-text budget -> number
//       "50k"/"50k per person" -> 50000 ; "1.5L"/"1.5 lakh" -> 150000 ;
//       "50000" -> 50000 ; bare "50" (< 100) -> 50000 ; "medium"/junk -> 0
//   • members       — pax free text -> integer
//       Workpex "Number Of Members" is an input type=number. Digits win
//       ("4 people" -> 4); else spelled-out words ("five members" -> 5,
//       "a couple" -> 2, "solo" -> 1); else "". Never throws.
//   • phone         — WhatsApp number -> digits only, country code kept, no +/spaces
//       "+91 93441 05896" -> "919344105896" ; "+971 50 123 4567" -> "971501234567".
//       Best shape for a `tel` field + click-to-call + wa.me links. Drops a 00
//       international-dial prefix.
//
// NOTE: Workpex "Destination" is a FIXED dropdown (24 options: Kashmir, Manali,
// Andaman, Phu Quoc, Bali, Thailand, Malaysia, Meghalaya, Munnar, Kerala, Dubai,
// Vietnam, Rajasthan, Goa, Maldives, Golden Triangle, Delhi, Agra, Langkawi,
// Singapore, Srilanka, Lakshadweep, Hyderabad, Shimla). The bot accepts ANY
// destination on Earth, so off-list values (Paris, Ladakh, China…) are passed
// through raw by "Send to CRM". Plan: expand the Workpex form (add destinations
// or an "Other" free-text field) so every bot answer fits. See PROJECT.md §5A.
//
// ⚠️ Webhook payload lives under $json.body — read via $('Webhook').
// ⚠️ Code node MUST return [{ json: { ... } }].
// ─────────────────────────────────────────────────────────────────────────

const body = $('Webhook').first().json.body || {};

// --- budget -> number ---
// Read a unit (k / lakh / cr) ONLY when it is attached to the number. This avoids
// the trap where words like "total" or "per person" contain letters (the 'l' in
// "total") that were previously mistaken for a lakh/k suffix (30k total -> 30L bug).
function toBudget(input) {
  const s = String(input || '').toLowerCase().replace(/₹|rs\.?|inr|,/g, '');
  const m = s.match(/(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l|k)?/);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  if (isNaN(n)) return 0;
  const unit = m[2] || '';
  if (unit === 'crore' || unit === 'cr') n *= 10000000;
  else if (unit === 'lakh' || unit === 'lac' || unit === 'l') n *= 100000;
  else if (unit === 'k') n *= 1000;
  else if (n < 100) n *= 1000;   // bare small number like "50" -> 50,000
  return Math.round(n);
}
const budget = toBudget(body.budget);

// --- pax -> integer ---
// 1) digits win ("4 people" -> 4, "2 adults +1 kid" -> 2).
// 2) else spelled-out words ("five members" -> 5, "a couple" -> 2, "solo" -> 1).
// 3) else '' (blank) — never throws.
function toMembers(input) {
  const t = String(input || '').toLowerCase().trim();
  if (!t) return '';
  const d = t.match(/\d+/);
  if (d) return parseInt(d[0], 10);
  // checked high-to-low so "twenty" isn't shadowed by "two"/"ten"
  const words = [['twenty',20],['nineteen',19],['eighteen',18],['seventeen',17],['sixteen',16],['fifteen',15],['fourteen',14],['thirteen',13],['twelve',12],['eleven',11],['ten',10],['nine',9],['eight',8],['seven',7],['six',6],['five',5],['four',4],['three',3],['couple',2],['pair',2],['two',2],['one',1],['solo',1],['single',1],['alone',1]];
  for (let i = 0; i < words.length; i++) {
    if (new RegExp('\\b' + words[i][0] + '\\b').test(t)) return words[i][1];
  }
  return '';
}
const members = toMembers(body.travelers);

// --- phone -> digits only, keep country code, drop + / spaces / leading 00 ---
let phone = String(body.contact_number || '').replace(/\D/g, '');
if (phone.startsWith('00')) phone = phone.slice(2);

return [{ json: { travel_budget: budget, members, phone } }];
