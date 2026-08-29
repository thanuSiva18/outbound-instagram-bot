# Hakeem Mohammad — partner account (FB + IG scripted capture)

The **second partner book of business**, built 2026-08-29 as a copy of
[`../outbound-travelers-faheem/`](../outbound-travelers-faheem/faheem-fb-ig-capture.workflow.json).
Same shape — ManyChat runs the whole conversation natively (no AI, no n8n round-trip
mid-chat) and n8n is only a **sink** at the end — but a **separate ManyChat account**,
its own sheet tab and its own CRM sources, so partner-level attribution survives.

> ⚠️ Separate ManyChat account means **separate custom-field IDs**. Faheem's field ids
> (`destination1`, `pax`, `Whatsapp_number`, `travel_date`, `assignee`) do **not** exist
> here. Every value in the request body must be inserted with the ManyChat **field
> picker** inside Hakeem's own account. Pasting Faheem's body ships literal
> `{{cuf_…}}` text, which `Normalize` scrubs to empty — that is the 2026-08-29 bug that
> cost Faheem 100 leads' worth of blank Destination columns.

## n8n

- Instance: `https://n8n.srv1159219.hstgr.cloud`
- Workflow: **"Outbound — Hakeem FB+IG Capture (ManyChat)"** (`0jNVpuJHZyWDrMuf`) — ACTIVE
- Webhook: `hakeem-lead-bot` → `https://n8n.srv1159219.hstgr.cloud/webhook/hakeem-lead-bot`
- Error workflow: "Error Alerts" (`f8JebCcUmgk137Li`) — ⚠️ currently **disabled**, so a
  silent feed stop pages nobody. Same exposure as Faheem's.
- JSON reference: [`hakeem-fb-ig-capture.workflow.json`](./hakeem-fb-ig-capture.workflow.json)

```
Webhook → Respond OK (instant) → Normalize → Lookup existing row
  → Preserve first values → Save lead → Ready for CRM? → Push to CRM → Write crm_result
```

- Responds `{"ok":true}` immediately — ManyChat never waits on the sheet or the CRM.
- CRM push is gated on `destination && phone_valid`, never on a step number.
- ⚠️ The node's `webhookId` is a UUID here, not the path string Faheem's uses. Both
  register fine; do not "fix" it — n8n needs *a* `webhookId` or the production URL 404s.

## ManyChat request body

All values are **field-picker pills**; only `channel` is typed text.

```json
{
  "ig_user_id": "<Contact Id>",
  "name": "<Full Name>",
  "destination": "<destination field>",
  "contact_number": "<WhatsApp number field>",
  "travel_date": "<travel date field>",
  "assignee": "<assignee field>",
  "channel": "instagram"
}
```

- `"channel"` must be `"facebook"` on the Facebook entry point and `"instagram"` on the
  Instagram one. It decides the CRM source; omitting it silently files every FB lead as
  `instagram3`.
- `ig_user_id` is the preferred row key. If ManyChat omits it, `Normalize` falls back to
  `phone:<digits>` so the lead still lands — but a contact who later gives a different
  number then creates a second row. Send the Contact Id.
- `assignee` is normalised to exactly `Jasmine` / `Jensica`; anything else lands empty.

## Leads store (Google Sheet)

- File: **"Lead manager"** (`1GBSVxZXVFfPpOUKBHMNoPYoqXmGiOyMV8jptXHy6K5U`), tab gid `2112455396`
- Credential in n8n: **"Google Sheets (Service Account)"** (`SjmGyVegUeZAEzO7`)
- Match key: **`ig_user_id`** — Append-or-Update, so a contact never duplicates.

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| `Name` | `Destination` | `Travel date` | `Number` | `Lead date` | `Assignee` | `crm_result` | `ig_user_id` | `Status` |

- ⚠️ `Name` here has **no** trailing space — unlike `New IG Leads 6`, where the header is
  `Name ` *with* one. n8n matches headers literally.
- `Lead date` is a month-year label (`"August 2026"`), preserved from the first write.
- `Status`: `new` → `in_progress` → `qualified` (destination + valid phone).

## CRM

- Endpoint: `POST https://app.outboundtravelers.com/tms/api/ingest`
  (the Cloudflare-proxied hostname, **not** the raw VPS IP Faheem's workflow still uses —
  it survives a VPS IP change, which is what broke the feed on 2026-08-01)
- Credential in n8n: **"Custom CRM Ingest Key (X-Api-Key)"** (`gI20n2XCpu3GzUFZ`)
- `source: "instagram3"` / `"facebook3"`, `campaign: "hakeem-fb-ig"`
- The source enum is enforced server-side; anything else returns **422**. Added in
  `Tms_Cloudflare-main/app/api/ingest/route.ts` — **requires a TMS deploy to take effect.**
- Contract: [`../../docs/crm-integration-contract.md`](../../docs/crm-integration-contract.md)

## Isolation from the other flows

| | Faheem | Hakeem |
|---|---|---|
| n8n workflow | `rX6hu1ArPRNEwBHP` | `0jNVpuJHZyWDrMuf` |
| Webhook path | `faheem-lead-bot` | `hakeem-lead-bot` |
| Sheet tab gid | `115831154` | `2112455396` |
| CRM sources | `instagram2` / `facebook2` | `instagram3` / `facebook3` |
| CRM campaign | `faheem-fb-ig` | `hakeem-fb-ig` |
| ManyChat account | Faheem's | Hakeem's (separate custom fields) |

## Verified (2026-08-29)

- Webhook registered and reachable — `POST /webhook/hakeem-lead-bot` → `200 {"ok":true}`
- Sheet tab `2112455396` readable and writable by the service account; all 8 mapped
  columns landed correctly (execution `287387`)
- CRM gate correctly **closed** on an invalid phone — no push, no partial lead

## NOT yet verified

- **The CRM push has never run.** It is blocked until `instagram3`/`facebook3` ship to
  production. Until then every qualified lead writes `crm_result: FAILED …422`.
- A real end-to-end lead from ManyChat (needs Hakeem's flow pointed at the webhook).
