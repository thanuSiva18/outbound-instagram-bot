# CRM Lead Ingestion — Integration Contract (bot → CRM)

The agreed handshake between this Instagram bot (n8n, **our** side) and the custom
Outbound CRM (**other dev's** side). This file is the source of truth for the push.
If either side changes a field name, auth, or dedup rule — update this doc first.

> CRM source of truth: `Tms_Cloudflare-main/app/api/webhooks/[source]/route.ts`
> → `lib/lead-engine/engine.ts` (`captureLead`).

---

## Endpoint
```
POST https://outbound-full.vercel.app/tms/api/webhooks/instagram
Content-Type: application/json
```
- The `instagram` path segment becomes the lead's `source` in the CRM.
- Prefer the vercel URL (don't use the direct sslip.io VPS host).

## Auth
- **Today:** none (server secret unset → signature check skipped).
- **To secure (recommended, do before go-live):** server sets `META_APP_SECRET`,
  bot signs the **raw JSON body** and sends:
  `X-Hub-Signature-256: sha256=<hex HMAC-SHA256(rawBody, secret)>`.
  Compute the HMAC in a Code node before the HTTP Request node. Secret shared out-of-band.

## When we push
Exactly **once per lead**, on the single message where it first becomes `qualified`
(all 5 fields filled). Driven by the `crm_push` flag from `Parse + validate`
(`crmPush = qualified && !wasQualified`). We never push on later messages.
The CRM *also* dedupes (phone OR handle, open lead, last 14 days) as a backstop.

## Where this lives in n8n (the actual build)
Two workflows on `n8n.srv1159219.hstgr.cloud`:
- **Flow 1 — "Chat & Capture"** (`AfmPZXhWMetbxHTl`): on `crm_push`, the **Push to CRM**
  node POSTs the lead to the internal webhook `/webhook/crm-lead-sync`. Body now carries
  `name, contact_number, destination, travelers, budget, ig_username, ig_user_id, status, notes`.
- **Flow 3 — "CRM Sync"** (`yH0weFfeYiobqdZq`): `Webhook → Normalize for CRM` (coerces
  budget→number, pax→int, phone→digits) then **fans out to two HTTP nodes**:
  - `Send to CRM` → Workpex (old CRM) — *still active during transition*.
  - `Send to Outbound CRM` → the new endpoint below — **dual-write**.

  The new-CRM body is built inline in `Send to Outbound CRM` (jsonBody expression),
  using the mapping table below. To cut Workpex off later, just disable the
  `Send to CRM` node — nothing else changes.

## Field mapping (bot → CRM body)
| Bot field (Parse+validate) | CRM field        | Type        | Transform |
|----------------------------|------------------|-------------|-----------|
| `name`                     | `contactName`    | string      | as-is |
| `ig_username`              | `handle`         | string      | as-is — **dedup key** |
| `whatsapp_number`          | `phone`          | string      | strip spaces — **dedup key** |
| `destination`              | `destination`    | string      | as-is |
| `budget`                   | `budget`         | **number**  | coerce `"50k"`→`50000`, `"1.5L"`→`150000`; **omit if not numeric** (e.g. "medium / flexible") |
| `ig_user_id`               | `rawPayload.ig_user_id` | —    | no CRM column — preserved in rawPayload |
| `pax`                      | `rawPayload.pax` | —           | no CRM column — preserved in rawPayload |
| `budget` (original text)   | `rawPayload.budget_text` | —    | keep per-person/total wording for sales |
| `status`                   | `rawPayload.bot_status`  | —    | CRM ignores top-level status (forces captured/New) |
| `notes`                    | `rawPayload.notes`       | —    | the running lead summary, handy at handoff |

**Required:** at least one of `phone` / `handle`. We always have both at qualify time.

## Example body we send
```json
{
  "contactName": "Priya Nair",
  "handle": "priya.travels",
  "phone": "+919876543210",
  "destination": "Maldives",
  "budget": 150000,
  "rawPayload": {
    "ig_user_id": "17841400000000000",
    "pax": 2,
    "bot_status": "qualified",
    "budget_text": "1.5L total",
    "notes": "• LEAD: Maldives, 2 pax, 1.5L ..."
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
- [ ] **Vague budget → `0`:** "medium / flexible" budgets serialize to `budget: 0`
      (original wording preserved in `rawPayload.budget_text`). Confirm the CRM treats
      `0` as "unknown", not a real ₹0 lead that scores cold.
- [ ] Turn on `META_APP_SECRET` + HMAC signing before go-live (currently open endpoint).
      When enabled, we add a Code node before `Send to Outbound CRM` to sign the raw body.
- [ ] (Optional) Add a `crm_id` column to the leads sheet + write back `results[0].id`.
- [ ] **Cut over:** once the new CRM is verified, disable the `Send to CRM` (Workpex) node
      in Flow 3 to stop dual-writing.
