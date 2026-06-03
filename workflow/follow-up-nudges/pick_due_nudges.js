// ─────────────────────────────────────────────────────────────────────────
// NODE: "Pick due nudges"  (Code node, Run Once for All Items)
// Workflow: "Outbound IG Lead Bot — 2 · Follow-up Nudges" (id GfDTRO3xDyZIWdnu)
// Scheduled every 10 min. Decides which leads get a follow-up nudge right now,
// with personalized + varied copy. Policy-safe: only inside IG's 24h window,
// max 2 nudges, never nudges a qualified lead.
//
// subscriber_id for ManyChat sendContent == the ManyChat Contact Id, which we
// store in the `ig_user_id` column.
// ─────────────────────────────────────────────────────────────────────────

const rows = $input.all().map((i) => i.json);
const s = (v) => (v === undefined || v === null ? '' : String(v).trim());
const nowMs = Date.now() + 5.5 * 60 * 60 * 1000; // IST frame to match stored ts

function parseTs(t) {
  t = s(t);
  if (!t) return 0;
  const m = t.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

const out = [];
let idx = 0;
for (const r of rows) {
  const sub = s(r.ig_user_id);            // ManyChat Contact Id == subscriber_id
  if (!sub) continue;
  if (s(r.status).toLowerCase() === 'qualified') continue;
  const nc = parseInt(s(r.nudge_count) || '0', 10) || 0;
  if (nc >= 2) continue;
  const lu = parseTs(r.last_update_ts) || parseTs(r.first_contact_ts);
  if (!lu) continue;
  const mins = (nowMs - lu) / 60000;
  if (mins >= 1440) continue;             // outside IG 24h window -> never (policy)
  let level = 0;
  if (nc === 0 && mins >= 30) level = 1;
  else if (nc === 1 && mins >= 120) level = 2;
  if (!level) continue;

  const name = s(r.name);
  const dest = s(r.destination);
  const hi = name ? ('Hi ' + name + '! ') : 'Hey! ';
  let text = '';
  if (level === 1) {
    const v1 = [
      hi + (dest ? ('Still dreaming of ' + dest + '? \u{1F334} I saved your details — shall we finish planning?') : 'Your dream trip is just a couple of messages away ✈️ Want to pick up where we left off?'),
      hi + (dest ? ('I kept your ' + dest + ' plan ready \u{1F4DD} Let’s lock in the best deal whenever you are free!') : 'I kept your trip details safe \u{1F4DD} Ready to continue whenever you are!'),
      hi + (dest ? ('Quick check-in on your ' + dest + ' trip \u{1F60A} shall we continue?') : 'Quick check-in on your trip plan \u{1F60A} shall we continue?'),
    ];
    text = v1[idx % v1.length];
  } else {
    const v2 = [
      hi + (dest ? ('Our ' + dest + ' packages are filling up fast this season \u{1F525} want me to get yours ready?') : 'Our seasonal packages are filling up fast \u{1F525} want me to get yours ready?'),
      hi + 'Our travel experts have some lovely offers right now \u{1F381} shall we finish planning your trip?',
      hi + (dest ? ('Just one step away from your ' + dest + ' getaway ✨ reply and I’ll sort the rest!') : 'Just a step away from your getaway ✨ reply and I’ll sort the rest!'),
    ];
    text = v2[idx % v2.length];
  }
  idx++;

  const nowIST = new Date(nowMs).toISOString().replace('T', ' ').slice(0, 19);
  out.push({ json: {
    subscriber_id: sub,
    ig_user_id: sub,
    ig_username: s(r.ig_username),
    name, destination: dest,
    nudge_num: level,
    new_nudge_count: nc + 1,
    nudge_text: text,
    last_nudge_ts: nowIST,
  } });
}
return out;
