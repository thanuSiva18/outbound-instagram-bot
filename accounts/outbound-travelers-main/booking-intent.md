# Booking intent (ERP lead priority) — MAIN page (@outboundtravelers)

The ERP sorts every new lead into P1 / P2 / P3 from one field, `booking_intent`.
The client answers one question; the value goes to the ERP only — never to the client or salesperson.

| Button label     | Value sent to ERP | ERP pipeline |
|------------------|-------------------|--------------|
| Within a day     | `within_day`      | P1           |
| Within a week    | `within_week`     | P2           |
| Just enquiring   | `enquiring`       | P3           |
| *(no answer)*    | *(key omitted)*   | ERP default  |

## Where it lives

- **ManyChat** (main "Outbound Travelers" account, page id `189277140932636`):
  custom field **`booking_intent`** (text) — id **`15112365`**, created 2026-10-29 via API.
- **n8n** — live **"My workflow"** (`8yGvAmoeoeT4pI2K`), branch `Webhook3`
  (`/webhook/5d6ecc00-f91b-4452-a06a-b38c3a0e154d`) → node **`Send to Custom CRM (main page)`**.
  The node reads `body.booking_intent`, accepts the 3 values **or** the 3 button labels
  (case/space-insensitive), and omits the key for anything else — unset field, unresolved
  `{{cuf_…}}` tag, `null`, `unknown`, free text. Backup before the change:
  [`../_backups/8yGvAmoeoeT4pI2K.pre-booking-intent-2026-10-29.json`](../_backups/8yGvAmoeoeT4pI2K.pre-booking-intent-2026-10-29.json).
- The AI replica `mO9gd0VJISdzlB5x` is still inactive and does **not** have this yet.

## ManyChat flow — what to build

Do this in **every** flow whose External Request posts to the `5d6ecc00-…` webhook
(both the Jasmine and the Jensica paths).

1. **Clear stale answers.** At the very start of the flow add an Action
   **Clear Custom Field → `booking_intent`**. ManyChat fields persist per subscriber, so a returning
   client who skips the question would otherwise re-send last time's answer.
2. **Ask the question** as the last step **before** the External Request (after the phone number):
   a **User Input** block, reply type **Multiple choice**, text
   `When are you planning to book your trip?`, choices exactly `Within a day`, `Within a week`,
   `Just enquiring`, **Save response to custom field → `booking_intent`**.
3. **Never block the lead.** Turn on the block's **Skip** button and route both the skip path and
   the "user typed text instead" path straight to the External Request. A client who doesn't
   answer must still be sent — n8n then leaves the field out.
4. **External Request body** — add one line, inserting the value with ManyChat's **field picker**
   (do not paste `{{cuf_…}}` text from another account):
   `"booking_intent": "{{booking_intent}}"`
5. **Do not** echo the answer in any message to the client or in any salesperson notification.

## Status (2026-10-29)

> **Change of design:** Instagram does not allow quick replies on a data-collection question, so the
> question is a **typed reply** ("1 / 2 / 3"). `Code in JavaScript7` parses it once
> (`1`/`1️⃣`/"tomorrow" → `within_day`, `2`/"this week" → `within_week`, `3`/"just enquiring" →
> `enquiring`, anything unclear → empty). The ERP node sends that value; the
> **New IG Leads 6** tab gets the label in its **`Booking Intent`** column. The Jasmine/Jensica tabs don't get it.

- [x] ManyChat field created (`15112365`); IG + FB flows: typed question + body line
- [x] n8n deployed 14:50 UTC (Code7 + sheet2 + ERP node), 42/42 local tests
- [x] ERP test mode (`?test=1`): 1 / 2️⃣ / 3 / tomorrow / just enquiring / no answer / `{{cuf}}` / unclear — all `ok`
- [x] Live: real leads arrived with `3` → `enquiring` and `1` → `within_day`
- [x] Retry (5×, 5 s) on the 3 sheet nodes, deployed 15:02 UTC — Google "too many requests" was dropping leads
- [x] 8 leads lost earlier on 2026-10-29 replayed 15:03–15:08 (2 skipped: client succeeded later)
- [ ] Repeat client with a more urgent second answer — with ERP team once their feature is on
- [ ] ERP team told the live start date (2026-10-29)
- [ ] Same work on `.in`, partner and WhatsApp bots

## Rollout to the other accounts (2026-10-29)

| Account | ManyChat field id | n8n | Sheet column | ERP source | Verified live |
|---|---|---|---|---|---|
| Main IG + FB | `15112365` | `8yGvAmoeoeT4pI2K` (Webhook3) | New IG Leads 6 | `instagram_main` | ✅ |
| `.in` IG (@outboundtravelers.in) | `15113069` | same Webhook3 — no n8n change | New IG Leads 6 | `instagram_main` | ✅ 17:54 UTC |
| Hakeem IG + FB | `15112834` | `0jNVpuJHZyWDrMuf` | hakeem leads | `instagram3` / `facebook3` | ✅ IG · FB only via ERP test mode |
| Faheem IG + FB | `15113052` | `rX6hu1ArPRNEwBHP` | faheem leads | `instagram4` / `facebook4` | ✅ IG + FB |

Hakeem/Faheem push a contact to the ERP once (`push_now`), so a repeat client's more urgent
answer does not reach the ERP. `.in` leads are tagged `instagram_main` by the shared Webhook3 path.
