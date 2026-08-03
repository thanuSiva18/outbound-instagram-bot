# CRM Lead Ingestion — Integration Contract (bot → CRM)

The agreed handshake between this Instagram bot (n8n, **our** side) and the custom
Outbound CRM (**other dev's** side). This file is the source of truth for the push.
If either side changes a field name, auth, or dedup rule — update this doc first.

> CRM source of truth: `Tms_Cloudflare-main/app/api/webhooks/[source]/route.ts`
> → `lib/lead-engine/engine.ts` (`captureLead`).

---

## Endpoint

> ⚠️ **Corrected 2026-08-03.** The Vercel URL below is **dead** and the `/api/webhooks/{source}`
> route is explicitly *not for bots* — it always returns 200 and silently swallows failures.
> Use `/tms/api/ingest`, which returns honest status codes. Source of truth:
> `Outbound-Full/LEAD_INGEST_API.md`.

```
POST https://187-127-191-151.sslip.io/tms/api/ingest
Content-Type: application/json
X-Api-Key: <bot key>
```

- ❌ `https://outbound-full.vercel.app/tms/api/webhooks/instagram` — dead (old Vercel host)
- ❌ `https://app.187-127-191-151.sslip.io/...` — **no `app.` prefix.** That subdomain has no
  nginx vhost; it falls through to the website backend (wrong TLS cert → n8n "SSL Issue",
  and 404 on `/tms/*`). This caused the 1–3 Aug 2026 outage.
- ✅ `https://app.outboundtravelers.com/tms/api/ingest` — stable alternative, Cloudflare-proxied,
  survives a VPS IP change. Preferred once verified under production load.
- `source` is a **hard enum**: `whatsapp` · `instagram_in` · `instagram_main` · `facebook` ·
  `website`. Anything else → **422**. It is NOT taken from the URL path.
- `?test=1` validates and echoes without persisting — use it to dry-run from n8n.

## Auth
- Header **`X-Api-Key: <bot key>`**, checked against server env `LEAD_INGEST_API_KEY`.
- Fail-closed: env unset → **503**. Missing/wrong key → **401**.
- In n8n this is credential **"Custom CRM Ingest Key (X-Api-Key)"** (`gI20n2XCpu3GzUFZ`).
- The old `META_APP_SECRET` / `X-Hub-Signature-256` HMAC scheme applies only to the legacy
  Meta-style webhook route, not to `/tms/api/ingest`.

## When we push
For the **Rahul scripted `.in` flow**, we push on the **Yes** quick-assistance button click.
The lead already has all four core fields (destination, travel_date, pax, whatsapp_number)
by that point, so the CRM receives a complete lead with `quick_assistance: yes`.

For the **legacy Zayn / main-account flows** (until migrated), the push still fires on the
first message where all 5 legacy fields become filled (`crm_push = qualified && !wasQualified`).

The CRM *also* dedupes (phone OR handle, open lead, last 14 days) as a backstop.

## Where this lives in n8n (the actual build)
Two workflows on `n8n.srv1159219.hstgr.cloud`:
- **Flow 1 — "Chat & Capture"** (`AfmPZXhWMetbxHTl`): the **Push to CRM** node POSTs the
  lead to the internal webhook `/webhook/crm-lead-sync` when `crm_push === true` OR
  `quick_assistance === 'yes'`.
- **Flow 3 — "CRM Sync"** (`yH0weFfeYiobqdZq`): `Webhook → Normalize for CRM` (coerces
  phone→digits, pax→int) then **fans out to two HTTP nodes**:
  - `Send to CRM` → Workpex (old CRM) — *still active during transition*.
  - `Send to Outbound CRM` → the new endpoint below — **dual-write**.

  The new-CRM body is built inline in `Send to Outbound CRM` (jsonBody expression),
  using the mapping table below. To cut Workpex off later, just disable the
  `Send to CRM` node — nothing else changes.

## Field mapping (bot → CRM body)
| Bot field | CRM field | Type | Transform |
|---|---|---|---|
| `ig_username` | `handle` | string | as-is — **dedup key** |
| `whatsapp_number` | `phone` | string | strip spaces — **dedup key** |
| `normalized_destination` / `destination` | `destination` | string | prefer normalized; fallback to raw |
| `travel_date` | `travel_date` | string | as-is, free text |
| `pax` | `travelers` | string | as-is |
| `quick_assistance` | `quick_assistance` | string | `yes` / `no` / empty |
| `ig_user_id` | `rawPayload.ig_user_id` | — | no CRM column — preserved in rawPayload |
| `pax` | `rawPayload.pax` | — | original text preserved |
| `status` | `rawPayload.bot_status` | — | CRM ignores top-level status (forces captured/New) |
| `notes` | `rawPayload.notes` | — | the running lead summary, handy at handoff |

**Required:** at least one of `phone` / `handle`. We always have both at push time.

## Example body we send (Rahul flow, Yes click)
```json
{
  "handle": "priya.travels",
  "phone": "+919876543210",
  "destination": "Jammu and Kashmir",
  "travel_date": "15th August",
  "travelers": "4",
  "quick_assistance": "yes",
  "rawPayload": {
    "ig_user_id": "17841400000000000",
    "pax": "4",
    "bot_status": "qualified",
    "notes": "Bali trip, 15 Aug, 4 pax, asked for quick assistance"
  }
}
```

## Response (success `200`)
```json
{ "ok": true, "captured": 1,
  "results": [ { "id": "v1StGXR8_Z5jdHi6B-myT", "deduped": false, "temperature": "hot" } ] }
```
- `results[0].id` = our `crm_id`. Optionally write it back to the leads sheet (see below).
- `deduped: true` → matched an existing open lead (score bumped, same id). Not an error.

## Open items / to confirm with CRM dev
- [ ] **Phone format:** we send **digits only with country code** (e.g. `919876543210`,
      via Flow 3 `Normalize for CRM`), not bare 10-digit. Confirm the CRM stores/searches
      that form. (Handle is the reliable dedup key regardless.)
- [ ] **`contactName` missing:** the Rahul flow no longer collects `name`. We send `handle`
      instead of `contactName`. Confirm the CRM accepts a missing/empty `contactName`.
- [ ] **`quick_assistance` field:** confirm the CRM accepts and stores this tag.
- [ ] Turn on `META_APP_SECRET` + HMAC signing before go-live (currently open endpoint).
      When enabled, we add a Code node before `Send to Outbound CRM` to sign the raw body.
- [ ] (Optional) Add a `crm_id` column to the leads sheet + write back `results[0].id`.
- [ ] **Cut over:** once the new CRM is verified, disable the `Send to CRM` (Workpex) node
      in Flow 3 to stop dual-writing.
