# Incident — CRM lead ingestion down 1–3 Aug 2026

**Impact:** 100% of leads failed to reach the CRM for ~81 hours. Google Sheets capture was
unaffected, so the loss was invisible on dashboards. **389 unique leads** were recovered and
backfilled.

| | |
|---|---|
| Started | 2026-08-01 07:48 IST |
| Detected | 2026-08-03 ~16:30 IST (a human noticed, not an alert) |
| Fixed | 2026-08-03 17:08 IST |
| Leads lost then recovered | 389 unique (431 failed pushes) |
| Cause | Infrastructure — nginx vhost, not automation |

## Root cause

The n8n CRM nodes posted to `https://app.187-127-191-151.sslip.io/tms/api/ingest`.

That hostname **has no nginx vhost** on the VPS. `/etc/nginx/sites-enabled/` defines
`187-127-191-151.sslip.io`, `app.outboundtravelers.com` and `api.outboundtravelers.com` —
but nothing for `app.187-127-191-151.sslip.io`. No `default_server` is declared either, so
nginx fell back to the first-loaded vhost: `api.outboundtravelers.com`, the **website
backend** on `:8787`.

Two failures stacked:

1. **TLS** — the fallback vhost serves a cert for `api.outboundtravelers.com`. Requesting
   `app.187-127-191-151.sslip.io` fails hostname validation, which n8n reports as
   *"SSL Issue: consider using the 'Ignore SSL issues' option"*.
2. **Routing** — even ignoring TLS, that backend 404s on `/tms/*`
   (`{"error":"Not found"}`). The ERP lives on `:8788`, reachable only via the correct vhost.

Nothing in n8n had changed. `/tms/api/ingest` still existed in the code, unchanged. The
`app.` vhost disappeared during the manual deploy activity on 1 Aug.

## Why it went unnoticed for three days

| Workflow | Node | Behaviour |
|---|---|---|
| `My workflow` (`8yGvAmoeoeT4pI2K`) | `Send to Custom CRM (main page)` | `onError: continueRegularOutput` — error swallowed into the node output, **execution reported success** |
| `CRM Sync` (`yH0weFfeYiobqdZq`) | `Send to Outbound CRM` | `onError: stopWorkflow` — 183 visible errors, but no alerting configured |

The main capture path wrote the sheet, failed the CRM call, and showed green. The CRM Sync
"successes" were also misleading: those runs stopped at `Normalize for CRM`, which returns
`[]` via its 15-minute idempotency guard — duplicate pushes correctly suppressed, not
deliveries. Net delivery across both paths was zero.

## Fix

One word — remove `app.` from the URL in three nodes:

```
- https://app.187-127-191-151.sslip.io/tms/api/ingest
+ https://187-127-191-151.sslip.io/tms/api/ingest
```

Applied to `Send to Custom CRM (main page)` (`8yGvAmoeoeT4pI2K`), `Send to Outbound CRM`
(`yH0weFfeYiobqdZq`), and `Push to CRM` (`kXgHAw867UsUlowS`). Pre-change JSON backups are in
[`../accounts/_backups/`](../accounts/_backups/).

Also applied, so this cannot hide again:
- `Send to Custom CRM (main page)` → `onError: stopWorkflow` (fails loudly instead of swallowing)
- Both production workflows → `settings.errorWorkflow = f8JebCcUmgk137Li` ("Error Alerts")

## Backfill

Replayed from n8n's own execution history rather than reconstructed from Sheets, so field
values are the originals. Deduped by phone, keeping the most complete push per lead.

- 431 failed pushes → **389 unique leads** (152 WhatsApp, 237 Instagram main)
- Dry run (`?test=1`): 389/389 valid, 0 rejected
- Live: **389 succeeded, 0 failed — 286 created (201), 103 deduped onto existing leads (200)**
- Sent with `enquired_at` carrying the **true 1–3 Aug capture time**, so the lead engine
  pools them for manual triage instead of auto-assigning 389 stale leads to two reps.
  **They sit in the Pre-Sales Bucket and need working through.**

The temporary backfill workflow was deleted after use (it embedded 389 customers' PII behind
an open webhook). Its payloads are **not** in this repo.

## Verification

29 leads delivered across both paths in the first hour post-fix, zero errors, against a prior
~40% error rate on CRM Sync and 100% CRM-node failure on My workflow.

## Follow-ups (infrastructure side)

1. **Declare a `default_server`** in nginx that returns 444/404 for unknown hostnames. Today a
   missing vhost silently serves the wrong application — that is what turned a typo-scale
   problem into a three-day outage.
2. **Move to a stable hostname.** `187-127-191-151.sslip.io` encodes the VPS IP and dies the
   day the IP changes. `app.outboundtravelers.com/tms/api/ingest` already works with a valid
   cert.
3. **⚠️ CI deploy wipes uncommitted production code.** `.github/workflows/deploy-backend.yml`
   runs `git reset --hard origin/main`. On 3 Aug the VPS had 123 modified + 139 untracked
   files (~26,855 real diff lines) in `/opt/outbound`, including whole features present only
   on the server (`app/admin/audit/`, `app/admin/portal/`, `app/api/attention/`). A reset to
   `origin/main` was observed firing at 12:03 UTC during this incident's investigation.
   Commit and push the server's local work **before** relying on CI, or CI will keep
   reverting it. This is the documented "features disappear" cycle.
