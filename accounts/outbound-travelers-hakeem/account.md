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
- Unresolved merge tags are **stripped, not fatal**: `clean()` removes `{{...}}` and keeps
  the literal text around it, so `'Rathinavel,{{last_name}}'` lands as `Rathinavel`. A
  value that is *only* a tag (`'{{full_name}}'`, which is what ManyChat sends for a
  contact with no name set) still ends up empty — hence the `ig_username` fallback below.
- `name` falls back: `name` → `first_name` → `ig_username` → `username`. Send the Username
  field in the body or a nameless contact produces a blank column A.

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

- Endpoint: `POST https://187-127-191-151.sslip.io/tms/api/ingest`
  > This was briefly pointed at the Cloudflare-proxied `app.outboundtravelers.com` as an
  > improvement (it survives a VPS IP change, which is what broke the feed on 2026-08-01).
  > Reverted 2026-08-29: it timed out from the n8n box. The IP host is the one the sibling
  > "CRM Sync" workflow uses successfully, so it stays until the proxied host is proven
  > from n8n rather than from a laptop.
- **Timeout: 120s, not the 15s Faheem's node shipped with.** Measured latency of this
  endpoint from n8n on 2026-08-29 across 10 real CRM Sync pushes: min 342ms, **max
  48,678ms**, avg 17,792ms — 4 of 10 exceeded 15s. The original cap would have silently
  failed roughly 40% of qualified leads. ⚠️ The endpoint being that slow is itself a
  TMS-side problem worth chasing; 120s is a tourniquet, not a cure.
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
- Merge-tag stripping: `'ZZ TESTNAME,{{last_name}}'` → `ZZ TESTNAME` (execution `287425`)
- **CRM path reachable end to end** (execution `287432`): the push completed and returned
  a real HTTP response, so credential, URL and body shape are all correct.

## The one remaining blocker

Execution `287432` came back **422**:

```
source is required and must be one of:
  whatsapp, instagram_in, instagram_main, facebook, website
```

Production is running only five sources — it does not have `instagram2`/`facebook2`
either. Commit `5267cad` ("accept instagram2 / facebook2", 2026-08-27) was committed to
`crm/faheem-lead-source`, never merged to `main` and never deployed; `DEPLOY_LOG.md` has
no entry for it. So **neither partner account can reach the CRM today**, and the single
TMS deploy of `crm/hakeem-lead-source` unblocks both at once.

That same execution also measured the push at **90,947ms**. Anything under a ~2 minute
timeout would have dropped it.

## NOT yet verified

- A successful CRM write (`crm_result: created <uuid>`). Impossible until the deploy.
- A real end-to-end lead from ManyChat (needs Hakeem's flow pointed at the webhook).
