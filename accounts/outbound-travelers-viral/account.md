# Outbound Travelers — `.in` viral reel flow (comment → DM capture)

The **viral video flow** on the `.in` Instagram page. Triggered when someone comments on a
reel; ManyChat runs the whole conversation **natively** (no AI, no n8n round-trip mid-chat).
n8n is only a **sink** at the end.

This is deliberately a different shape from the `.in` AI bot
([`../outbound-travelers-in/account.md`](../outbound-travelers-in/account.md)), which is
Default-Reply → n8n → OpenAI → reply. The two share only the Instagram inbox.

## Flow

```
User comments on Post or Reel (#53)
  → Send Message #3   "Hey {Full Name} 👋 … Plan my trip! 😊"  (button)
  → Q1 destination        (Waiting for Text)
  → Q2 which month        (Waiting for Text)
  → Q3 how many members   (Waiting for Text)
  → Q4 E-mail             (Waiting for Text)
  → Q5 WhatsApp number    (Waiting for Phone)
  → Send Message #10  "Thanks for sharing your number! 😊"
  → Randomizer 50/50 → Set assignee = Jasmine / Jensica
  → Actions #1  External Request → n8n   (step "5")
```

**One request, at the end.** It fires *after* the Randomizer, so `assignee` is always
populated. This matches the proven `instagram live one` flow shape.

> **Why not progressive capture?** It was built and tested (n8n handles steps 1–5 and
> updates one row in place), but the single end-request shape was chosen for simplicity.
> To add drop-off capture later, put the same body in Q1–Q4's *Action on reply* with
> `step` = 1..4. ⚠️ If you do, you **must** also clear the 5 custom fields right after the
> "Plan my trip!" button — otherwise a returning contact's stale answers make Q1 look
> complete and push a wrong lead to the CRM on question 1.

## ManyChat

- Account: `.in` page (same ManyChat account as the AI bot — fields are shared by design)
- Custom fields used: `destination1`, `travel_date`, `travelers`, `email_id`,
  `Whatsapp_number`, `assignee`
- ⚠️ `travel_date` and `Whatsapp_number` are **also used by the `.in` AI bot**. Shared
  intentionally (team convention). Residual effect: a viral lead who later DMs the page
  may have their travel month pre-filled instead of re-asked.
- Request body (all values inserted with the field picker, not typed):

```json
{
  "step": "5",
  "ig_user_id": "<Contact Id>",   "ig_username": "<Username>",
  "name": "<Full Name>",          "destination": "<destination1>",
  "travel_date": "<travel_date>", "travelers": "<travelers>",
  "email": "<email_id>",          "contact_number": "<Whatsapp_number>",
  "assignee": "<assignee>"
}
```

## n8n

- Instance: `https://n8n.srv1159219.hstgr.cloud`
- Workflow: **"Outbound.in — Viral Reel Capture (comment→DM)"** (`kXgHAw867UsUlowS`) — ACTIVE
- Webhook: `viral-lead-in` → `https://n8n.srv1159219.hstgr.cloud/webhook/viral-lead-in`
- Error workflow: "Error Alerts" (`f8JebCcUmgk137Li`)
- JSON reference: [`viral-reel-capture.workflow.json`](./viral-reel-capture.workflow.json)

```
Webhook → Respond OK (instant) → Normalize → Lookup existing row
  → Preserve first values → Save lead → All 5 answers in?
        └─ true → Push to CRM → Write crm_result
```

- Responds `{"ok":true}` immediately — ManyChat never waits on the sheet or CRM.
- `Normalize` scrubs unresolved `{{cuf_…}}` merge tags to empty, parses `"4 members"` → `4`,
  and normalizes assignee casing to exactly `Jasmine` / `Jensica`.
- CRM push is gated on **all five** fields present, never on the step number.

## Leads store (Google Sheet)

- File: **"Lead manager"** (`1GBSVxZXVFfPpOUKBHMNoPYoqXmGiOyMV8jptXHy6K5U`),
  tab `New viral leads 1` (gid `1635965080`)
- Credential in n8n: **"Google Sheets (Service Account)"** (`SjmGyVegUeZAEzO7`)
- Match key: **`ig_user_id`** (column J, added for this build) — Append-or-Update, so a
  contact never produces duplicate rows.

| A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| `Name ` | `Destination` | `Travel date` | `Number of Travelers` | `Mail id` | `Number` | `Lead date` | `Assignee` | `crm_result` | `ig_user_id` | `status` |

- ⚠️ **`Name ` has a trailing space.** n8n matches headers literally — do not "fix" it
  without repointing the node mapping.
- `Lead date` is a month-year label (`"August 2026"`), preserved from the first write.
- `status`: `new` → `in_progress` → `qualified` (all five present).
- `crm_result`: `created <id>` / `deduped <id>`, written only after the CRM push.
- Columns J and K were added by this build; A–I already existed and match the
  `Jasmine 2.2` / `Jensica 2.2` rep tabs.

## CRM

- Endpoint: `POST https://187-127-191-151.sslip.io/tms/api/ingest`
- Credential in n8n: **"Custom CRM Ingest Key (X-Api-Key)"** (`gI20n2XCpu3GzUFZ`)
- `source: "instagram_in"` — the enum is enforced server-side; anything else returns **422**
- `campaign: "viral-reel"` plus a `notes` line marks these as reel-driven. The whole body is
  spread into `raw_payload`, so `email` is preserved even though the CRM has no email column.
- Contract: [`../../docs/crm-integration-contract.md`](../../docs/crm-integration-contract.md)

> ⚠️ The hostname has **no `app.` prefix**. `app.187-127-191-151.sslip.io` has no nginx
> vhost and falls through to the website backend (wrong cert + 404). See the incident note
> below. A stable alternative exists at `https://app.outboundtravelers.com/tms/api/ingest`
> (Cloudflare-proxied), which survives a VPS IP change.

## Isolation from the existing flows

Nothing here shares n8n resources with the older automations:

| | Existing | This flow |
|---|---|---|
| n8n workflow | `8yGvAmoeoeT4pI2K`, `AfmPZXhWMetbxHTl`, `yH0weFfeYiobqdZq` | `kXgHAw867UsUlowS` |
| Webhook path | `5d6ecc00-…`, `ig-lead-bot`, `crm-lead-sync` | `viral-lead-in` |
| Sheet tab | `New IG Leads 6`, `Jasmine/Jensica 2.1`, `leads_v2` | `New viral leads 1` |

## Verified

- Partial capture, update-in-place across messages (no duplicate rows)
- `"4 members"` → `4`; `"jensica"` → `Jensica`; unresolved merge tags → empty
- CRM dry-run (`?test=1`) accepted; live push returns `created <uuid>`
- Real end-to-end lead: `Kashmir · Next month · 12 · 9488181528 · Jasmine · qualified`
  → `crm_result: created 09869104-f0b5-44dd-b97e-5212bf7191b5`
