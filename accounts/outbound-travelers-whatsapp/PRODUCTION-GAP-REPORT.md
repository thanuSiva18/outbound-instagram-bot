# WhatsApp Bot — Production Gap Report
> Generated 2026-06-30 by a 13-agent audit of the LIVE workflow `qx4PSZuDK6b6Q642` against
> [PRODUCTION-SPEC.md](PRODUCTION-SPEC.md) (failure modes A–L). This is the point-in-time GAP
> snapshot; the spec is the target. Per-category raw findings: see the audit task output.

# Production Readiness Audit — Outbound Travelers WhatsApp Lead Bot
**Workflow:** `qx4PSZuDK6b6Q642` (ACTIVE) · host `n8n.srv1159219.hstgr.cloud` · webhook `wa-lead-bot` · phone_number_id `900006843195557`

---

## 1. SCORECARD

| Category | Implemented | Partial | Missing | n/a | Worst severity |
|---|---|---|---|---|---|
| A. Inbound & Security | 0 | 2 | 3 | 0 | **critical** (A1) |
| B. Dedup / Idempotency / Concurrency | 1 | 3 | 1 | 1 | high |
| C. Media (voice / CV / images) | 0 | 0 | 5 | 1 | high |
| D. Reply Formatting | 1 | 2 | 1 | 1* | low |
| E. State Machine / Qualification | 4 | 4 | 2 | 0 | **critical** (E9) |
| F. Extraction / Normalization | 4 | 3 | 0 | 5 | medium |
| H. CRM Push Contract | 0 | 4 | 2 | 0 | **critical** (H1/H2) |
| I. Applicant Routing (email-to-HR) | 0 | 0 | 8 | 0 | high |
| J. Resume handling (attach to HR email) | 0 | 0 | 6 | 0 | high |
| K. Observability / Error Handling | 0 | 3 | 1 | 0 | **critical** (K3/K4) |
| L. Deploy / Infra / Credentials | 1 | 4 | 1 | 1 | **critical** (L6) |

\*D4/D5 are n/a-leaning for the lean funnel. Categories C/I/J are net-new builds (in scope) — counted as "missing" because the feature is absent, not buggy.

---

## 2. GAP MATRIX (critical + high only)

| id | requirement | status | sev | fix (node / file) |
|---|---|---|---|---|
| **A1** | Verify X-Hub-Signature-256 HMAC; reject forged 401 | missing | crit | Add Raw-Body + Code HMAC verify before `Webhook`→`Lookup`; APP_SECRET in credential |
| A2 | One-flag kill-switch + post-auth real-inbound test | missing | high | IF gate on env `WA_BOT_ENABLED` after `Normalize input` (gated on A1) |
| A4 | Dedup by `message_id`, not text+4s window | partial | high | `Normalize input` Layer-1: key on `waMessage.id`, TTL 24h |
| A5 | Allow-list actionable types; validate sender 8–15 digits | partial | high | `Normalize input`: type allow-list + digit-length guard before building key |
| B1 | Record-level idempotency by Meta message_id | partial | high | `Normalize input` + `Save lead`: persist `last_msg_id` col, compare before send |
| B3 | Settle-wait + lock on the BUTTON path | partial | high | Route `Button handler` through `Claim lock`→Wait→`Read lock`→`Winner?` |
| C3 | Meta media resolve+download with Bearer | missing | high | New 2× HTTP Request nodes (graph.facebook media-id → file) |
| C5 | CV email-fail still completes applicant + notifies | missing | high | New Gmail/SMTP node, `onError:continueRegularOutput` + fallback reply |
| C6 | Non-text → transcribe or graceful "type it" + log | missing | high | New branch after `waMessage.id` guard in `Normalize input` |
| **E9** | Phrase-anchored opt-out → Unsubscribed, NO CRM push | missing | crit | Gate at top of `Normalize input`; add `&& status!=='unsubscribed'` to `Newly qualified?` |
| E1 | Returning-contact re-open / 48h reset gate | missing | high | Port reset block from `normalize.js:70-116` into live `Normalize input` |
| **H1** | Surface CRM 401/402 (Vercel leg 402 now, swallowed) | missing | crit | Error branch off `Send to Outbound CRM` (Flow 3) + `Push to CRM` (Flow 1) |
| **H2** | Retry+backoff, health row, reconciler | partial | crit | Add retry to Flow1 `Push to CRM`; health-row write; scheduled reconciler |
| H4 | Push body uses stale rich shape (no travel_date/qa) | partial | high | Rewrite `Send to Outbound CRM` jsonBody to Rahul shape per contract |
| I-e | Sticky applicant routing | missing | high | Persist `lead_type='applicant'`; read before keyword scan in `Normalize input` |
| J1 | Detect inbound resume document/voice | missing | high | `Normalize input` branch on `waMessage.type` document/audio |
| J2 | Meta media-id → URL → download binary | missing | high | New HTTP Request nodes (see C3) |
| J3 | Email resume attached to HR | missing | high | New Gmail/SMTP node → hr@outboundtravellers.com |
| J5 | message_id dedup so HR not double-emailed | missing | high | Key applicant dedup on `waMessage.id` in `Normalize input` |
| **K3** | Capture Meta send failures (LastSendError) | missing | crit | `Send reply (Meta API)`: error output → `send_errors` sheet row |
| **K4** | Working error sink (errorWorkflow inactive, no alert) | partial | crit | ACTIVATE `f8JebCcUmgk137Li` + add Gmail/Slack alert step |
| K1 | Sheets read fails → clean empty row not error obj | partial | high | `Normalize input` / `Combine lock + data`: `if(j&&j.error)row={}` |
| K2 | aiDegraded flag + high-sev health row | missing | high | `Parse + validate`: set `aiDegraded`, write health row on AI error output |
| **L6** | Inline Meta token rotation risk; stale workflows | partial | crit | Move token to httpHeaderAuth cred; activate error WF; delete `Temp - Clear lead` |
| L3 | Meta token must be a credential, not inline | partial | high | Convert `Send reply (Meta API)` header to httpHeaderAuth credential |
| L5 | n8n API JWT expires 2026-07-28 | missing | high | Doc re-issue + reminder ~3 days prior; credential changelog |

---

## 3. MUST-FIX BEFORE GO-LIVE (critical/high, NOT scope-gated, ordered)

1. **[A1 · critical] Authenticate the webhook.** Enable Raw Body on the `Webhook` node; add a Code node before any processing that computes `crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex')` and timing-safe-compares to the `sha256=` part of `headers['x-hub-signature-256']`. On mismatch → dedicated `Respond to Webhook` 401 + log sender/IP. Store APP_SECRET in a credential/env, never inline. Today anyone with the URL can drive OpenAI spend, Sheets writes, Meta sends, CRM pushes.

2. **[E9 · critical] Opt-out gate.** At the TOP of `Normalize input` (before dedup/lock/button branch), match phrase-anchored patterns (`^stop$`, `unsubscribe`, `stop messaging`, `do not message`) — NOT substring "stop". On match: one warm ack, `status='unsubscribed'`, park follow-up far-future, and **add `&& status!=='unsubscribed'` to the `Newly qualified?` IF** so opt-outs are never CRM-pushed. WhatsApp compliance blocker.

3. **[K3 · critical] Capture Meta send failures.** Set `Send reply (Meta API)` to `continueErrorOutput`; wire the error output to append `{ig_user_id, reply_text, meta_error_code, msg, ts}` to a `send_errors` sheet. The inline token WILL expire (401) and 24h-window rejections (470/131047) are routine; today the customer silently gets nothing and no one is alerted.

4. **[K4 + L6 · critical] Activate and arm the error sink.** Set `f8JebCcUmgk137Li` `active:true` and add a Gmail/SMTP/Slack alert step after `Log error` (currently it only appends a sheet row, and its own node swallows failures). Because every node uses `continueRegularOutput`, also add explicit logging on the Send/AI/CRM legs (items 3, 9, 5).

5. **[H1 · critical] Surface the CRM 402.** Add an error branch off Flow 3 `Send to Outbound CRM` (yH0weFfeYiobqdZq) and Flow 1 `Push to CRM` that classifies HTTP status and writes a visible `crm_push_failures` row on 4xx. **Resolve the Vercel 402 (billing-locked) with the CRM dev and re-enable the currently `disabled:true` `Send to Outbound CRM` node before go-live** — right now the new CRM receives zero pushes.

6. **[H2 · critical] CRM retry + reconciler.** Add `retryOnFail` to Flow 1 `Push to CRM`; on final failure append a health row; build a scheduled reconciler that re-POSTs `quick_assistance='yes'` rows older than 30 min with no CRM confirmation.

7. **[L6 / L3 · critical/high] Move the Meta token to a credential.** Convert `Send reply (Meta API)` Authorization (`Bearer EAASjYoz...`) to an httpHeaderAuth credential; confirm it is a permanent System-User token (not the 24h temp). Then it's rotatable in one place and a 401 becomes a catchable credential error.

8. **[E1 · high] Returning-contact reset gate.** Port the `normalize.js:70-116` reset block (GREETINGS regex, `parseIST`, `hoursSince>48`, field-clear) into the LIVE `Normalize input`, adapted to WA fields (`messages[0]`, `last_update_ts`). Without it, re-engaged old leads keep a stale "qualified" status and get no fresh funnel.

9. **[K2 · high] aiDegraded surfacing.** In `Parse + validate`, when the item arrives on the AI-Agent error output or text is unparseable, set `aiDegraded:true` and write a high-severity health row distinguishing `ai_no_output` (expired key/quota) from `ai_bad_json`. Keep serving the canned reply but make it loud. An expired OpenAI key would otherwise serve the fallback to every user silently.

10. **[K1 · high] Safe Sheets-read degrade.** In `Normalize input` and `Combine lock + data`, explicitly `if (j && j.error) j = {}` so a "sheet not found" read (seen in exec 59973) degrades to a clean empty row and a Read-lock failure forces a deterministic single-winner instead of `undefined===''` defeating dedup.

11. **[A4 · high] message_id dedup.** In `Normalize input` Layer-1, key on `waMessage.id` with 24h TTL instead of `from|text`+4s, so Meta retries after downtime process exactly once and identical human messages aren't collapsed.

12. **[A5 · high] Type allow-list + sender validation.** Replace the bare `messages[0].id` guard with an allow-list (`text`/`interactive`/`audio`/`document`), drop `statuses` entries, and reject `from` whose digit-count is outside 8–15 before it becomes the primary key.

13. **[B3 · high] Lock the button path.** Route `Button handler` through the same `Claim lock`→short Wait→`Read lock`→`Winner?` gate as the AI path (sub-second Yes/No taps currently race with zero ownership arbitration → double-send + double CRM push).

14. **[B1 · high] Record-level idempotency.** Persist real `waMessage.id` to a `last_msg_id` column and compare before send to close the Meta-retry duplicate that Layer-1 and Layer-3 both miss.

15. **[H4 · high] Fix the CRM push body.** Rewrite `Send to Outbound CRM` jsonBody to the Rahul shape from `docs/crm-integration-contract.md` (add `travel_date`, `travelers`, `quick_assistance`, top-level `status`; drop `budget`/`budget_text`). Even after the 402 is fixed, the current stale body would not populate the new fields.

16. **[L5 · high] n8n API JWT expiry.** `N8N_API_KEY` exp = 2026-07-28 (~28 days). Document re-issue, set a reminder ~3 days prior, start a credential changelog. Operational-only but blocks all maintenance if it lapses.

---

## 4. SHOULD-FIX / NICE-TO-HAVE

**Should-fix (medium):**
- **E4/E8** — add per-field `declined` flag + "not interested" warm back-off (check negation before extraction in `Normalize input`).
- **F5** — add a persisted `source` column (write-once coalesce) if reporting needs lead source.
- **B5** — daily dedup/reconciliation job grouping `whatsapp leads` by `ig_user_id` to catch split rows.
- **B4** — document the single-worker `$getWorkflowStaticData` constraint inline + in `account.md`; confirm single-main deploy.
- **L2** — delete ~40 `check_*/fix_*/go_live/setup_*` scratch scripts from repo root; commit exported JSON + `normalize.js` + `parse_validate.js` together so repo == live.

**Nice-to-have (low):**
- **D1/D2** — 2-line markdown/emoji sanitizer on `p.reply` in `Send reply` jsonBody; add prompt line "1–2 short lines, ≤1 emoji".
- **F-DEST** — small deterministic alias map for top destinations in `Parse + validate` after the LLM, before the verbatim fallback.
- **E5/E2** — guard against an empty/failed `Lookup` row silently downgrading a qualified lead; assert `autoWhatsapp` non-empty.
- **L1** — rename leftover `ig-lead-bot` webhookId / "Testing new bot" cachedResultName for ops clarity.
- **F6 / H6** — move dedup lock off `assigned_to` into a dedicated `lock_msg_id` column before any routing/attribution work.

---

## 5. NET-NEW BUILD SPECS (confirmed in scope)

### (a) Voice transcription
**Design on our stack:**
- In `Normalize input`, after the type allow-list (A5), branch when `waMessage.type==='audio'` (capture `waMessage.audio.id`).
- **HTTP node 1:** `GET https://graph.facebook.com/v19.0/{{audio_id}}` with `Authorization: Bearer <token>` (shared httpHeaderAuth cred from L3) → returns `.url`, `.mime_type`.
- **HTTP node 2:** `GET {{url}}` with the SAME Bearer header (Meta CDN requires it), `responseFormat=file` → binary `data`.
- **OpenAI transcription node** (Whisper) on the binary → transcript text.
- Feed transcript back as `user_message` into the SAME funnel (re-enter the AI path at `Claim lock`).

**Failure modes to bake in:**
- Guard empty/zero-length buffer after download → fall to "Sorry, I couldn't hear that — please type your answer" (C6) and ALWAYS log.
- Unpack the transcript defensively (`.text` / `.data[0].text` / nested) per the `Parse + validate:14-21` pattern; empty transcript ⇒ `aiDegraded` + deterministic "type it" reply, never feed a blank string to the Agent.
- Dedup on `waMessage.id` (text body is empty for audio, so the current Layer-1 skips it).

### (b) Applicant → email-to-HR with resume
**Design on our stack:**
- **Intent gate** at TOP of `Normalize input` (before travel prompt): word-boundary regex `/\b(job|career|vacancy|hiring|hr|resume|cv|apply|application|position|opening|internship)\b/i`. On match OR a `document` attachment → set sticky `lead_type='applicant'` written to a new sheet column; read it back BEFORE the keyword scan so one-word follow-ups (a bare name) stay in the applicant flow (**I-e**).
- **New `Career?` IF** after `Button click?` routing to an applicant sub-branch (bypasses the travel AI Agent).
- **Mini-collector** (own short prompt): name → role/position → brief details → request CV.
- **Media fetch:** same 2× HTTP Request nodes as (a) for `waMessage.document.id` (`.filename`, `.mime_type`).
- **Email node:** Gmail (OAuth2) or SMTP → `hr@outboundtravellers.com`, subject `New applicant: <name> — <role>`, body = collected fields + WhatsApp number, **attachment = downloaded binary** (`binaryPropertyName=data`, keep alive through Merge per n8n-binary skill).
- **Branding:** write `lead_type='applicant'`; ensure `Newly qualified?` excludes applicants so they are NOT pushed to the travel CRM.

**Failure modes to bake in:**
- Email node `onError:continueRegularOutput`: on send failure STILL mark applicant captured, reply "HR will follow up", log/alert (**C5**).
- Missing/failed/unsupported media: email the text fields with a "resume attachment failed" note + reply "please re-send your CV or email hr@..." (**J6**).
- Idempotency: gate the HR email on an `emailed_to_hr` marker AND `waMessage.id` so a Meta webhook retry of the resume message can't double-attach/double-send (**J5**).
- Need a Gmail/SMTP credential (none exists today — only OpenAI + Google Sheets); create in UI, record the id in `docs/n8n-credentials-checklist.md` (**I-g/J3**).

### (c) WF2 Follow-ups (guarded nudge workflow)
**Design on our stack:** a separate scheduled n8n workflow (NOT inline) that reads the `whatsapp leads` tab on a cron.
- Select rows where `status='in_progress'` AND `last_update_ts` older than threshold AND a `next_follow_up_ts` is due AND `follow_up_count < max`.
- Send via the SAME Meta API send (shared httpHeaderAuth cred), increment `follow_up_count`, set the next `next_follow_up_ts`.
- **Hard exclusions:** `status IN ('unsubscribed','paused','cold')`, `quick_assistance='yes'` (already converted), and `lead_type='applicant'`.

**Failure modes to bake in (the old IG "Follow-up Nudges" double-DM'd — design that out):**
- Per-row `follow_up_count` cap + a `last_follow_up_ts` debounce so two scheduler ticks can't both fire (idempotent select-then-write in one pass).
- Respect the WhatsApp 24h window — only free-form nudge inside 24h of last user message; otherwise require a template (or skip + log).
- Honor opt-out (E9): never nudge `unsubscribed`.
- Single-writer: ensure WF2 and the main bot can't both write a row in the same instant (reuse the `assigned_to`/lock pattern or a `next_follow_up_ts` claim).

---

## 6. TOP 10 RISKS (ranked)

1. **Unauthenticated webhook (A1)** — anyone with the URL forges inbound, driving spend, Sheets writes, sends on the business number, and CRM pushes. Single biggest go-live blocker.
2. **No opt-out handling (E9)** — "stop"/"unsubscribe" is funnelled and can still CRM-push; WhatsApp policy/compliance violation.
3. **Inline Meta token, silent send failures (L6 + K3)** — token will expire/rotate; `Send reply` swallows the 401 with no log → customers silently get nothing, no operator alert.
4. **CRM new-leg broken & invisible (H1/H2)** — Vercel returns 402 AND `Send to Outbound CRM` is `disabled:true`; every qualified lead lands in the sheet but not the new CRM, with zero logging or reconciler.
5. **Error sink inactive & alertless (K4)** — `f8JebCcUmgk137Li` is `active:false` and only appends a sheet row; 4 error execs in 10 min produced no operator signal. The bot has effectively no observability.
6. **AI silent fallback (K2)** — an expired OpenAI key serves the canned reply to every user indefinitely with no `aiDegraded` flag or health row.
7. **Button-path race (B3) + no message_id idempotency (B1/A4)** — fast Yes taps and Meta retries can double-send and double-push to CRM.
8. **Returning-contact reset missing (E1)** — re-engaged old leads keep a stale "qualified" status and get no fresh funnel; the reset logic exists in the repo but was dropped from the live node.
9. **Voice/resume silently dropped (C6/J1)** — both in scope; today a voice note or CV yields an empty `user_message` fed to the travel Agent, media vanishes, nothing logged. Job enquiries are mis-routed as travel leads.
10. **Operational fragility (L5 + L2)** — n8n API JWT expires 2026-07-28 (blocks all maintenance), and ~40 scratch scripts + stale/active duplicate workflows (esp. live `Temp - Clear lead by username`) create deploy/ops confusion.