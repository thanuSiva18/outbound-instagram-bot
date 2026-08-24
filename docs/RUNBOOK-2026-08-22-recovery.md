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

## Step 2 — Message the leads that were lost

**Do not start this before Step 1 is verified.** Every lead you message will reply, and if
the AI is still dead they hit the same canned line a second time.

Workflow: **`Outbound — WhatsApp Lead Recovery Sender (2026-08-22 incident)`**
(id `T8rWkmCjOD2yE9Mw`).

**Current state — primed and safe.** Active, `DRY_RUN = true`,
`SKIP_IF_INBOUND_AFTER = 2026-08-24T09:08:00Z`, 272 leads loaded. It runs once a minute and
logs the lead it *would* message. **Nothing has been sent** — verified: executions take the
`Dry run (nothing sent)` branch and the Send node has never run.

Preview of every message is at
`_incident-2026-08-22-whatsapp-ai-outage-DATA-DO-NOT-COMMIT/DRY-RUN-messages.txt`.

**To go live, one change:** open `Pick next lead`, change `const DRY_RUN = true;` to
`const DRY_RUN = false;`, Save. Sending begins within a minute, one message per minute.

It stops on its own when the queue empties. Deactivate any time; progress is kept.

Built-in safety, all verified before handover:

| Guard | Behaviour |
|---|---|
| Rate | one message per minute (`MAX_PER_RUN`) |
| 24h window | re-checked at send time; expired leads are skipped, never sent |
| Quiet hours | nothing before 9am or after 9pm IST |
| Duplicate protection | ledger keyed by number; survives stop/start |
| **Auto-pause** | **3 consecutive Meta rejections and it stops itself** |
| Failures | recorded with Meta's reason, never blindly retried |

⚠️ `919488108394` (Thanu siva N) is in the target list — you will message yourself.
Harmless, and a useful live test. Remove it from `TARGETS` in `Pick next lead` if you'd
rather not.

**The eligible list decays.** WhatsApp only allows free-form messages within 24 hours of the
customer's last message. At handover: 160 eligible, 104 already expired, and roughly 7–10
leave the eligible pool per hour. The 104 expired leads are in `affected-leads.csv` and can
only be reached by phone or an approved WhatsApp template.

---

## Step 3 — Deploy the monitoring so this cannot repeat silently

Branch **`fix/automation-observability`** is pushed and open for PR:
https://github.com/outboundmanagementsystem-afk/Outbound-Full/pull/new/fix/automation-observability

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

2. Merge the branch to `main`. GitHub Actions applies migration `0042` and reloads PM2.

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
