# Runbook — recovering from the 2026-08-22 WhatsApp outage

Companion to [`incident-2026-08-22-whatsapp-ai-outage.md`](incident-2026-08-22-whatsapp-ai-outage.md).
Do these in order. Step 1 gates everything else.

---

## Step 1 — Restore the bot ✅ DONE 2026-08-24 09:08:02 UTC

Credits landed on OB-3. First healthy AI turn 09:08:02 UTC / 14:38 IST
(`"manali"` → `"Manali sounds wonderful! 🏔️"`, with `destination` captured again).
Total outage **45h 43m**. The rest of this step is kept for reference if it recurs.

**Nothing else works until this is done.** The bot has been answering every customer with
*"Thanks so much for messaging Outbound Travellers! 😊 Our team will get back to you very
shortly."* since 2026-08-22 11:24 UTC. That sentence IS the failure — it is what
`Parse + validate` emits when the AI returns nothing.

The WhatsApp bot authenticates with **one specific OpenAI account**:

| n8n credential | id | used by |
|---|---|---|
| `OpenAI - .in Page (OB-1)` | `6u2h5oY9xOCzQksf` | Instagram bots (currently zero traffic) |
| **`OpenAI - WhatsApp (OB-3)`** | **`XhT24Tqns6iamHur`** | **WhatsApp bot — this is the one that is dry** |

Credits added to any other OpenAI account or project will not help. In the OpenAI
dashboard, confirm you are in the **organisation and project that issued the key stored in
OB-3**. The dashboards look identical across accounts, which is the easy mistake here.

Pick whichever is fastest:

- **(a)** Add credits to the OB-3 account.
- **(b)** If a different OpenAI account already has credit, open n8n →
  *Credentials* → `OpenAI - WhatsApp (OB-3)` → paste that account's API key → Save.
  The key never leaves your browser. Takes about 30 seconds and the bot recovers
  immediately.

**Verify** (do not skip — "I added credits" has already been wrong once):
send `hi` to the business number from any phone. A real reply names a destination question,
e.g. *"May I know which destination you are planning for?"* If you get the
*"Thanks so much for messaging…"* line again, OB-3 still has no credit.

No redeploy, no workflow edit, no restart. Recovery is immediate once the account has funds.

---

## Step 2 — Message the leads that were lost ✅ DONE 2026-08-24

Workflow: **`Outbound — WhatsApp Lead Recovery Sender (2026-08-22 incident)`**
(id `T8rWkmCjOD2yE9Mw`). Ran 15:19 → 17:52 IST, then **deactivated** once the queue drained.

| Result | |
|---|---|
| Messages sent | **154** (154 distinct numbers — no one messaged twice) |
| Send failures | **0** |
| Replied to the apology | **50 (32.5%)** |
| Reached `qualified` | **36** |
| Pushed to the CRM | **44** |
| Named a destination | 41 — Kashmir (6), Andaman (4), Vietnam (3), Bali, Manali, Thailand, Kerala, Munnar |
| Unhealthy turns since | 0 |

So 44 leads that were dead for 45 hours are now in the CRM. Two leads aged out of the 24h
window before their turn; everyone else in the queue was reached.

To reuse this for a future incident: rebuild `TARGETS` in `Pick next lead`, set
`SKIP_IF_INBOUND_AFTER` to the recovery time, run once with `DRY_RUN = true` and read an
execution, then set it to `false` and Activate. Deactivate when the queue drains — it does
not stop itself, and an idle Active workflow burns ~1,440 pointless executions a day.

Built-in safety, all verified in production:

| Guard | Behaviour |
|---|---|
| Rate | one message per minute (`MAX_PER_RUN`) |
| 24h window | re-checked at send time; expired leads skipped, never sent |
| Quiet hours | nothing before 9am or after 9pm IST |
| Duplicate protection | ledger keyed by number; survives stop/start |
| **Auto-pause** | **3 consecutive Meta rejections and it stops itself** |
| Failures | recorded with Meta's reason, never blindly retried |

**The 24h window is why speed matters.** WhatsApp only allows free-form messages within 24
hours of the customer's last message, and the pool drained at roughly 7–10 leads per hour
while we waited. Because the queue happened to be ordered oldest-first, the leads closest to
expiry went first and only 2 were lost to it.

**113 leads expired before the campaign could reach them** — they can only be recovered by
phone or an approved WhatsApp template. Call list:
`_incident-2026-08-22-whatsapp-ai-outage-DATA-DO-NOT-COMMIT/EXPIRED-leads-call-list.csv`
(113 rows, 51 flagged HIGH priority: messaged more than once, or already named a destination).

---

## Step 3 — Deploy the monitoring so this cannot repeat silently

Branch **`ops/automation-monitoring`** is pushed and open for PR:
https://github.com/outboundmanagementsystem-afk/Outbound-Full/pull/new/ops/automation-monitoring

Pushing the branch does **not** deploy — `deploy-backend.yml` only fires on `main`.

1. Add to `server/.env` **on the VPS** (`/opt/outbound/server/.env`):

   ```
   N8N_API_URL=https://n8n.srv1159219.hstgr.cloud/api/v1
   N8N_API_KEY=<same value as outbound-instagram-bot/.env>
   N8N_PUBLIC_URL=https://n8n.srv1159219.hstgr.cloud
   OPS_INGEST_TOKEN=<32-byte random string>
   RESEND_API_KEY=<from resend.com>
   RESEND_FROM=Outbound Ops <onboarding@resend.dev>
   OPS_ALERT_TO=z3connect.operations@gmail.com
   ```

   Without `RESEND_API_KEY` and `OPS_ALERT_TO` everything still records, but alerts are only
   written to the log and reach nobody — which is precisely the failure this incident was
   about. Resend's `onboarding@resend.dev` sender works before you verify a domain, so there
   is no reason to wait.

2. Merge the branch to `main`. GitHub Actions applies migration `0060` and reloads PM2.

3. Confirm it is live:

   ```bash
   curl -s https://187-127-191-151.sslip.io/health
   curl -s -H "x-ops-token: <OPS_INGEST_TOKEN>" \
        https://187-127-191-151.sslip.io/ops/automation-health | head -40
   ```

   PM2 logs should show `[ops] collector on — every 120s, alert at 3 failures/10min`.

### What you get afterwards

- Every run of every n8n workflow lands in `ops.automation_runs` with its own verdict:
  `ok` / `degraded` / `failed`. **`degraded` = n8n said success but the automation did not do
  its job** — the exact blind spot that hid this outage and the 3 Aug one.
- Email on 3 failed-or-degraded runs in 10 minutes, then at most one per hour per workflow,
  plus one on recovery.
- Errors that never self-heal (`openai_no_credits`, `provider_auth_failed`) email on the
  **first** occurrence. Replayed against this incident that is 11:24:57 UTC — the very first
  failed reply, instead of never.

Useful queries once deployed:

```sql
-- is anything unhealthy right now?
SELECT * FROM ops.automation_health_24h ORDER BY degraded_runs + failed_runs DESC;

-- leads that got the canned line in a given window
SELECT started_at, lead_key, lead_status, crm_pushed
  FROM ops.automation_runs
 WHERE health = 'degraded' AND started_at BETWEEN $1 AND $2
 ORDER BY started_at;
```

---

## Still open

- [ ] **Gemini fallback** on the AI Agent, so a dry OpenAI account degrades instead of dying.
      Needs a Gemini API key. Note `GEMINI_API_KEY` already appears in the VPS env list in
      `deploy/vps-restore-deploy.sh`, so one may already exist.
- [ ] **Fix the wiring in `HfFqcCEDZJIoGd8e`.** `AI Agent`'s error output shares a
      destination node with its success output, which is what makes an AI failure invisible.
      Give it its own path so it registers as a real n8n error. Deliberately not done while
      production was degraded.
- [ ] `accounts/outbound-travelers-whatsapp/account.md` names the OpenAI credential as
      `xNZip6hDSsmAroMc`; production uses `XhT24Tqns6iamHur`. Doc is stale.
- [ ] `AfmPZXhWMetbxHTl` (IG Chat & Capture) is ACTIVE but has **zero executions** in the
      whole retained window. Unrelated to this incident. Worth a look — it may be dead too.
- [ ] Turn on prepaid auto-recharge on the OpenAI accounts.
- [ ] The `Outbound — Error Alerts (all bots)` workflow only writes to a Google Sheet. Once
      the ops collector is live it supersedes it; either wire it to the new alerting or
      retire it, but do not leave it looking like coverage when it notifies nobody.
