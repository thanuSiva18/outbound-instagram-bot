// ─────────────────────────────────────────────────────────────────────────
// NODE: "Pick due nudges"  (Code node, Run Once for All Items)
// Workflow: "Outbound IG Lead Bot — 2 · Follow-up Nudges" (id GfDTRO3xDyZIWdnu)
//
// PURPOSE: follow up ONLY to collect the 5 lead fields, at most TWICE, then stop.
// Each nudge gently asks for the FIRST still-missing field (destination → name →
// pax → budget → whatsapp_number), personalised with what we already know.
//
// CADENCE (exactly 2 nudges, then STOP — never loops):
//   • Nudge 1: 10 min after the lead's last message (last_update_ts).
//   • Nudge 2: 30 min after nudge 1 was sent — ONLY if they did not reply to it.
//   • After 2 nudges: never again.
//
// ANTI-LOOP (why it can't spam 100x like before):
//   The real cap is a PERSISTENT static-data ledger ($getWorkflowStaticData),
//   keyed by ig_user_id, holding { count, ts }. It survives across scheduled runs
//   and n8n restarts, and is incremented HERE, in the picker, BEFORE the send —
//   so even if the ManyChat send or the sheet write fails, the next run sees the
//   higher count and will NOT re-nudge. Sheet nudge_count is only a backup floor.
//
// Policy-safe: skip qualified leads (we have all 5 — expert takes over), skip any
// lead with no missing field, only inside IG's 24h window. subscriber_id == ig_user_id.
// ─────────────────────────────────────────────────────────────────────────

const rows = $input.all().map(i => i.json);
const s = (v) => (v === undefined || v === null ? '' : String(v).trim());
const clean = (v) => s(v).replace(/^'/, '').trim(); // strip the leading ' Sheets uses for the phone
const nowMs = Date.now() + 5.5 * 60 * 60 * 1000; // IST frame to match stored ts
function parseTs(t) {
  t = s(t);
  if (!t) return 0;
  const m = t.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return 0;
  return Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]);
}

const store = $getWorkflowStaticData('global');
if (!store.nudges) store.nudges = {};
const ledger = store.nudges;

const MAX_NUDGES = 2;
const NUDGE1_AFTER_MIN = 10;   // nudge 1: 10 min of silence since lead's last message
const NUDGE2_AFTER_MIN = 30;   // nudge 2: 30 min after nudge 1 was sent
const WINDOW_MIN = 1440;       // IG 24h messaging window (anti-spam, policy)

// first still-missing field, in the order we collect them
function firstMissing(r) {
  if (!clean(r.destination)) return 'destination';
  if (!clean(r.name)) return 'name';
  if (!clean(r.pax)) return 'pax';
  if (!clean(r.budget)) return 'budget';
  if (!clean(r.whatsapp_number)) return 'whatsapp_number';
  return '';
}
function askFor(field) {
  switch (field) {
    case 'destination': return 'where would you love to travel?';
    case 'name': return 'may I know your name so I can plan it for you?';
    case 'pax': return 'how many of you will be travelling?';
    case 'budget': return 'roughly what budget are you thinking — per person or total?';
    case 'whatsapp_number': return "what's the best WhatsApp number for you? our expert will send the full plan there.";
    default: return 'shall we continue planning?';
  }
}

const out = [];
let idx = 0;
for (const r of rows) {
  const sub = s(r.ig_user_id); // ManyChat Contact Id == subscriber_id
  if (!sub) continue;
  if (s(r.status).toLowerCase() === 'qualified') continue;  // all 5 collected -> never nudge

  const led = ledger[sub] || {};
  const sheetNc = parseInt(s(r.nudge_count) || '0', 10) || 0;
  const nc = Math.max(parseInt(led.count || 0, 10) || 0, sheetNc);
  if (nc >= MAX_NUDGES) continue;                  // HARD STOP — already nudged twice

  const miss = firstMissing(r);
  if (!miss) continue;                             // nothing missing -> treat as complete, don't nudge

  const lu = parseTs(r.last_update_ts) || parseTs(r.first_contact_ts);
  if (!lu) continue;
  const silenceMins = (nowMs - lu) / 60000;
  if (silenceMins >= WINDOW_MIN) continue;         // outside 24h window -> never

  const lastNudgeMs = parseTs(led.ts) || parseTs(r.last_nudge_ts);

  let level = 0;
  if (nc === 0) {
    if (silenceMins >= NUDGE1_AFTER_MIN) level = 1;
  } else if (nc === 1) {
    const repliedSinceNudge = lastNudgeMs && lu > lastNudgeMs;
    const minsSinceNudge = lastNudgeMs ? (nowMs - lastNudgeMs) / 60000 : silenceMins;
    if (!repliedSinceNudge && minsSinceNudge >= NUDGE2_AFTER_MIN) level = 2;
  }
  if (!level) continue;

  // ---- gentle, field-specific copy ----
  const name = clean(r.name);
  const dest = clean(r.destination);
  const who = name ? (name + ', ') : 'there! ';
  const ask = askFor(miss);
  let text = '';
  if (level === 1) {
    const opener = dest
      ? ['just picking up your ' + dest + ' trip', 'still happy to help with your ' + dest + ' plan', 'whenever you have a sec on your ' + dest + ' trip']
      : ['just checking back in', 'whenever you have a quick sec', 'still here to help plan your trip'];
    text = 'Hi ' + who + opener[idx % opener.length] + ' 😊 ' + ask;
  } else {
    const opener2 = ['no rush at all', 'no pressure at all', 'totally at your pace'];
    text = 'Hi ' + who + opener2[idx % opener2.length] + ' 🙂 whenever you are ready — ' + ask;
  }
  idx++;
  const nowIST = new Date(nowMs).toISOString().replace('T', ' ').slice(0, 19);
  // Pre-increment the ledger NOW (before send) — this is the anti-loop guarantee.
  ledger[sub] = { count: nc + 1, ts: nowIST };
  out.push({ json: {
    subscriber_id: sub,
    ig_user_id: sub,
    ig_username: s(r.ig_username),
    name, destination: dest,
    nudge_num: level,
    new_nudge_count: nc + 1,
    missing_field: miss,
    nudge_text: text,
    last_nudge_ts: nowIST,
    // carry existing values so the update row stays intact
    whatsapp_number: clean(r.whatsapp_number), pax: clean(r.pax), budget: clean(r.budget),
    statusv: s(r.status), first_contact_ts: s(r.first_contact_ts), last_update_ts: s(r.last_update_ts),
  }});
}
return out;
