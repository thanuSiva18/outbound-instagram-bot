# Incident — WhatsApp bot answering blind 22–24 Aug 2026

**Impact:** the WhatsApp lead bot replied to every customer with a canned holding line and
captured nothing for ~44 hours. n8n reported **`success` on all 504 runs**, so no dashboard,
no error count and no alert ever showed a problem. **248 unique leads** need a callback.

| | |
|---|---|
| Started | 2026-08-22 16:54 IST (11:24:57 UTC) |
| Detected | 2026-08-24 ~12:00 IST (a human noticed, not an alert) |
| **Resolved** | **2026-08-24 09:08:02 UTC / 14:38 IST** (credits added to OB-3) |
| **Total duration** | **45h 43m** |
| Cause | OpenAI account out of credits — but see "why it went unnoticed" |
| AI turns attempted / failed | 441 / 441 (100%) |
| Distinct leads affected | 248 (216 never reached the CRM, 244 never qualified) |
| n8n executions marked `error` | **0** |

Last healthy AI reply: execution `260686`, 2026-08-22 11:21:48 UTC.
First failed AI reply: execution `260696`, 2026-08-22 11:24:57 UTC.
Clean cutover with no intermittency — the signature of a hard billing cutoff.

Recovery was equally clean: last failure 09:05:35 UTC, first healthy turn 09:08:02 UTC
(`"manali"` → `"Manali sounds wonderful! 🏔️"` with `destination` captured again). No
redeploy and no workflow change were needed, which confirms the diagnosis: the only thing
ever wrong was the account balance behind credential `XhT24Tqns6iamHur`.

The first fix attempt failed because credits were added to a different OpenAI account.
There are three OpenAI credentials in this n8n and their dashboards look identical; always
confirm the organisation/project that issued the key stored in **OB-3**.

## Root cause

The n8n credential `XhT24Tqns6iamHur` ("OpenAI - WhatsApp (OB-3)") ran out of prepaid credits.
Every call from the `OpenAI Chat Model` node returned:

```
NodeApiError: OpenAI: Rate limit reached
  description: You have no credits remaining. Add credits to continue using the API
               at https://platform.openai.com/settings/organization/billing/
```

Note the shape of that error: OpenAI reports a **dry account as a 429 whose message reads
"Rate limit reached"**. Only the description says why. Anyone reading just the message would
conclude the bot was being throttled and would wait it out. It was never going to recover on
its own.

The Instagram bots were unaffected — they use a different credential
(`6u2h5oY9xOCzQksf`, "OpenAI - .in Page (OB-1)").

## Why it went unnoticed for two days

This is the **second consecutive incident with the same root shape** — see
[`incident-2026-08-03-crm-outage.md`](incident-2026-08-03-crm-outage.md), where
`onError: continueRegularOutput` swallowed the CRM failure and the execution reported
success for 81 hours. The trigger differs; the blindness is identical.

In workflow `HfFqcCEDZJIoGd8e`:

1. `AI Agent` is set to `onError: continueErrorOutput`, and **both its success output and
   its error output are wired into the same `Parse + validate` node**. Downstream, an AI
   failure is indistinguishable from an AI success.
2. `Parse + validate` receives an item with no `output` field, treats it as malformed JSON,
   and takes its safe-fallback branch, emitting
   `"Thanks so much for messaging Outbound Travellers! 😊 Our team will get back to you very shortly."`
3. No node error propagates, so the execution status is **`success`**.
4. Because the run "succeeded", the configured `errorWorkflow` (`f8JebCcUmgk137Li`) never
   fired.
5. That error workflow is only `Error Trigger → Log error (v2) → Google Sheet`. It notifies
   **no one**. Even a correctly-detected failure would only have appended a row to a tab
   nobody reads.

The bot therefore looked healthy from every angle available: customers got replies, n8n
was solid green, and the error tab stayed empty.

### The specific damage

`destination` is extracted by the AI only — the deterministic regex backstop in
`Parse + validate` deliberately skips it ("too open to regex"). With the AI dead,
`destination` was never captured, so `qualified` was unreachable, so the quick-assistance
step never fired and `crm_push` stayed false for almost every lead.

| Measured over the outage window | |
|---|---|
| AI-length runs classified | 504 |
| n8n said `success` | 504 |
| Actually degraded | 441 |
| AI attempts failed | 441 / 441 |
| Leads reaching `qualified` | 5 |
| Leads pushed to CRM | 38 |
| Distinct affected leads | 248 |

## Recovery

Lead list for callbacks (customer data, kept out of git, same convention as the 3 Aug
incident):

```
_incident-2026-08-22-whatsapp-ai-outage-DATA-DO-NOT-COMMIT/
  affected-leads.csv     248 rows — number, name, first message, destination if any
  affected-leads.json    same, structured
  outage-summary.json    the counts above
```

106 of the 248 sent more than one message, so they engaged and got the same canned line
each time. Those are the warmest and should be called first.

## Fix

**Immediate (billing, human):** add credits at
platform.openai.com/settings/organization/billing. The bot recovers on its own within a
minute — no redeploy, no workflow change.

**Systemic (shipped):** the reason to build something here is that the trigger was
mundane and the blindness was not. A credit top-up fixes today. It does nothing about the
next `continueRegularOutput` that hides the next failure.

Migration `0042_ops_automation_log.sql` plus `server/src/ops/*` in `Outbound-Full` add:

- `ops.automation_runs` — one slim row per execution, with **our own verdict** alongside
  n8n's: `health` is `ok` / `degraded` / `failed`, where `degraded` means "n8n said success
  but the automation did not do its job". That is precisely this incident's blind spot.
- `server/src/ops/collector.js` — polls the n8n REST API every 2 minutes, looks *inside*
  each execution, and records the verdict. **It changes nothing in n8n**, so the live lead
  bots stay untouched and any workflow added later is covered the first time it runs.
- Alert rule: 3 failed-or-degraded runs in 10 minutes emails the developer via Resend, then
  at most one email per hour per workflow while it stays broken, plus one on recovery.
  Replayed against this incident's real execution timestamps that rule first fires at
  **2026-08-22 11:55:17 UTC — 33.5 minutes in, instead of never.** The lag is entirely
  traffic-driven: leads were arriving slowly that hour, so it took 33 minutes to get 3
  failures inside one 10-minute window.
- Because of that, error classes that *never* self-heal (`openai_no_credits`,
  `provider_auth_failed`) alert on the **first** occurrence instead of waiting for a burst.
  A dry OpenAI account is not going to start working again, so making it prove itself only
  wastes leads. On this incident that fires at **11:24:57 UTC — the very first failed
  reply.** The 60-minute cooldown still applies, and the list is tunable via
  `OPS_ALERT_IMMEDIATE_CLASSES`.
- `ops.automation_health_24h` — per-workflow qualification and AI-failure rates, so slow
  degradation that never trips a threshold is still visible.

The regression test `server/src/ops/classify.test.js` is built from execution `263391` of
this incident: n8n status `success`, OpenAI reporting no credits. If that test ever accepts
`health: "ok"`, the blind spot is back.

## Follow-ups

- [ ] Add OpenAI credits (only this restores service).
- [ ] Set `RESEND_API_KEY` + `OPS_ALERT_TO` in `server/.env`, or alerts are logged as
      warnings and reach nobody — the exact failure mode this incident is about.
- [ ] Call the 248 leads in `affected-leads.csv`, warmest (multi-message) first.
- [ ] Fix the wiring properly in `HfFqcCEDZJIoGd8e`: give `AI Agent`'s error output its own
      path, so an AI failure is an n8n error rather than a silent canned reply. Deliberately
      **not** done during this incident to avoid editing a live customer-facing workflow
      while it was already degraded.
- [ ] Add a Gemini fallback model on the AI Agent so a dry OpenAI account degrades instead
      of dying. Key not yet supplied.
- [ ] `accounts/outbound-travelers-whatsapp/account.md` lists the OpenAI credential as
      `xNZip6hDSsmAroMc`; production actually uses `XhT24Tqns6iamHur`. Doc is stale.
- [ ] `AfmPZXhWMetbxHTl` (IG Chat & Capture) is ACTIVE but has **zero executions** in the
      entire retained window. Unrelated to this incident, but worth a look.
- [ ] Consider prepaid-balance auto-recharge on the OpenAI account.
