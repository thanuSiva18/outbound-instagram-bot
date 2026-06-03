# Plan — Follow-up Nudge Sequence (n8n-driven via ManyChat Send API)

> Goal: chase quiet, incomplete leads automatically — built entirely in n8n
> (scheduling + logic), using ManyChat's API only as the delivery pipe to Instagram.
> Status: APPROVED design, build pending ManyChat API token + nudge-flow ns.

## Why it must touch ManyChat at all
n8n cannot push a DM into someone's Instagram inbox by itself. During the live chat
that's fine — n8n replies through the webhook back to ManyChat. But a follow-up has no
incoming message to reply to, so n8n must actively SEND. The only pipes to Instagram
are ManyChat's Send API or the IG Graph API. We use **ManyChat Send API** (already our
IG bridge, simplest, safest).

## How ManyChat sending works (important constraints)
- Endpoint (Instagram): `POST https://api.manychat.com/fb/sending/sendFlow`
  body: `{ "subscriber_id": <id>, "flow_ns": "<flow namespace>" }`
  header: `Authorization: Bearer <MANYCHAT_API_TOKEN>`
  (sendFlow sends a pre-built ManyChat flow. There is also sendContent for inline
  content, but sendFlow is cleaner + respects IG rules.)
- **24-hour standard messaging window:** ManyChat/IG only deliver to a user whose last
  message was within 24h. Our nudges (30min, 2hr) are safely inside. Outside 24h the
  send fails/blocks — which is the correct, policy-safe behavior (we never spam).
- So in ManyChat we still create ONE tiny thing: a **flow** named e.g. "Nudge 1" and
  "Nudge 2" containing just the Send Message text. n8n triggers them by `flow_ns`.
  (This is the minimum ManyChat object; all timing/logic stays in n8n.)

## Architecture — a SECOND n8n workflow (scheduled), separate from the live chat one

```
Schedule Trigger (every 10 min)
   → Google Sheets: read all rows from `leads`
   → Code: filter to leads that NEED a nudge:
        status != 'qualified'
        AND last_update_ts is 30+ min ago (nudge1) or 2h+ ago (nudge2)
        AND within 24h of last_update_ts (IG window — else skip, too late)
        AND nudge_count < 2
   → For each due lead:
        HTTP Request → ManyChat sendFlow (subscriber_id, flow_ns = Nudge1 or Nudge2)
        → Google Sheets update row: nudge_count +1, last_nudge_ts = now
```

### Nudge timing logic (in the Code filter)
- nudge_count = 0 AND 30min ≤ since(last_update_ts) < 24h  → send Nudge 1
- nudge_count = 1 AND 2h   ≤ since(last_update_ts) < 24h  → send Nudge 2
- nudge_count ≥ 2  → never again
- status == 'qualified' → never nudge
- since(last_update_ts) ≥ 24h → skip (IG window closed; safe, no spam)

## Anti-spam / anti-ban safeguards (built in)
- Hard cap 2 nudges per lead (nudge_count column).
- Only inside IG's 24h window.
- Stops immediately when status flips to qualified.
- 10-min scan = low API volume.
- Each send updates last_nudge_ts so the next scan won't re-fire too soon.

## New sheet columns (L, M) on `leads`
- `nudge_count`   — integer, how many nudges sent (0/1/2)
- `last_nudge_ts` — IST timestamp of the last nudge
(The live chat workflow's Save lead will be extended to NOT clobber these — it only
writes the lead fields; nudge columns are owned by the nudge workflow. Need to confirm
appendOrUpdate doesn't blank them — likely add them to the live schema as passthrough.)

## ⚠️ subscriber_id — do we have it?
ManyChat sendFlow needs the **ManyChat subscriber_id**, NOT the ig_user_id.
ACTION: the live ManyChat External Request body must ALSO send ManyChat's subscriber id
so we can store it in the sheet (new column `subscriber_id`) for the nudge workflow to
target. Without it, we cannot send. (ig_user_id alone is not accepted by sendFlow.)
→ Add to ManyChat request body: "subscriber_id": "<ManyChat System Field: Subscriber Id>"
→ Add sheet column + Normalize/Parse passthrough.

## Nudge message text (in the ManyChat Nudge flows)
Nudge 1: "Hey! 😊 Just checking in — shall we continue planning your trip? I'm here
whenever you're ready! 🌴"
Nudge 2: "Hi again! 🙏 We've got some lovely packages for you. Reply here anytime and
I'll help you finish planning your dream trip! ✨"
(No WhatsApp number — qualified-only rule.)

## What Faheem provides
1. **ManyChat API token** (ManyChat → Settings → API, or Profile → API).
2. Create 2 ManyChat flows: "Nudge 1" + "Nudge 2" (just the text above) → give me each
   flow's **flow_ns** (or I guide where to copy it).
3. Add `subscriber_id` to the live External Request body (1 field).

## Build steps (once provided)
1. Add columns to sheet: subscriber_id, nudge_count, last_nudge_ts.
2. Update live workflow: capture subscriber_id (Normalize/Parse/Save) — passthrough only.
3. Build scheduled nudge workflow (schedule → read → filter → sendFlow → update).
4. Store MANYCHAT_API_TOKEN as an n8n credential (HTTP Header Auth), never in JSON.
5. Test: create an incomplete lead, wait, confirm nudge fires once, count increments,
   stops at 2, stops on qualified, skips after 24h.
```
