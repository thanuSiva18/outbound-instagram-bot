# Outbound Travelers — `.in` page  (live AI bot — Rahul scripted flow)

The **`.in`** Instagram page's bot — currently **live**. The AI is a **silent field
extractor only** (it never writes messages); every reply the customer sees is
**scripted deterministically** in the `Parse + validate` / `Button handler` code, so
the agent can't improvise or go off-script. Fixed collection order:

1. destination          — AI also returns a normalized/spell-corrected `normalized_destination`
2. travel_date
3. pax
4. whatsapp_number
5. quick-assistance Yes/No button

**Memory rule:** time-based — remember within **48h** (a returning lead continues),
forget after 48h idle (next message restarts at the greeting). The Simple Memory
session is keyed to a per-conversation epoch (`first_contact_ts`) so it expires with
the 48h window.

**Scripted replies:** greeting → "Great choice! When are you planning to travel?" →
"Great. May I know the number of people travelling?" → "Thanks for the information.
Could you please share your contact number…" → "Thanks for your cooperation. Do you
need quick assistance?" (Yes/No buttons).

**Working hours (Button handler):** Mon–Sat 9:00 AM–5:30 PM IST (Sunday = full holiday,
always after-hours). Yes within hours → "…reach you shortly"; Yes after hours →
"…during our working hours (9:00 AM – 5:30 PM)"; No → polite close. Yes also tags
`quick_assistance=yes` and pushes to CRM.

**Send API:** ManyChat `https://api.manychat.com/fb/sending/sendContent` (the `/fb/`
endpoint — `/ig/` 404s for some subscribers).

> Canonical source of truth = the **live n8n workflow** (`AfmPZXhWMetbxHTl`). The JSON
> in this folder is a human-readable reference; for a byte-perfect backup use n8n's own
> **Workflow → Download**.

## Instagram / ManyChat — TWO accounts since 2026-09-10
This page is served by **two separate ManyChat accounts**, one per channel. ManyChat API tokens
and subscriber IDs are **account-scoped**, so a reply must go out on the same account the message
came in on. `Send reply (ManyChat)` therefore sits behind a `Route channel?` switch.

| Channel | ManyChat account | n8n credential |
|---|---|---|
| **Instagram** `outboundtravellers.in` | the original account | **"ManyChat API"** (`WRHI5I3GZm4zJCrl`) |
| **Facebook** `outboundtravelers.in` | **new** account `5567255` (created 2026-08-27) | **"ManyChat API — Outbound.in FB (acct 5567255)"** (`JxRGU6CA1s9vbhMs`) |

- Routing key: `Normalize input` derives `channel_label` — `instagram` if `channel === 'instagram'`,
  otherwise `facebook`. `Route channel?` sends `facebook` to `Send reply (ManyChat FB)` and
  everything else to `Send reply (ManyChat)`.
- ⚠️ ManyChat must send **`"channel": "facebook"`** on the Facebook entry point. n8n relays the
  value verbatim as the Send-API content `type`, and `facebook` is the value ManyChat accepts for
  a FB page (`messenger` is not — the older main-page doc guesses wrong here).
- ⚠️ **Custom-field IDs are per-account.** The new account's fields are a fresh block
  (`destination` = `14952100`, `travel_date` = `14952107`, `pax` = `14952106`,
  `Whatsapp_number` = `14952110`, `bot reply` = `14952096`). Always insert values with ManyChat's
  **field picker** inside the new account — pasting another account's body ships literal
  `{{cuf_…}}` text, which `Normalize` scrubs to empty. That is the bug that cost Faheem 100 leads.
- ManyChat: Default Reply → External Request → n8n webhook (no keyword flows).
  See [`../../docs/manychat-setup.md`](../../docs/manychat-setup.md).

## Facebook capture pipeline — `4x1i98GjUICyNmVI` (built 2026-09-10)

The `.in` **Facebook** page does NOT use the AI bot. It runs a **native ManyChat scripted
flow** (comment/keyword → questions in ManyChat → one External Request at the end), copied from
Hakeem's proven automation. n8n is a pure **sink**, so **no ManyChat Send-API token is used on
this path**.

- Workflow: **"Outbound.in — FB Capture (ManyChat)"** (`4x1i98GjUICyNmVI`) — **ACTIVE**
- Webhook: `outbound-in-fb-lead-bot`
  → `https://n8n.srv1159219.hstgr.cloud/webhook/outbound-in-fb-lead-bot`
- Sheet: **same as the AI bot** — "OB leads" / tab `instagram_in` (gid `1286047384`)
- CRM: **same as the AI bot** — POST `…/webhook/crm-lead-sync` (shared dual-push,
  Workpex + Custom CRM), `source: 'facebook'`, 120s timeout

```
Webhook → Respond OK {"ok":true} (instant) → Normalize → Lookup existing row
  → Preserve first values → Save lead → Ready for CRM? → Push to CRM
```

- **Append-or-Update on `ig_user_id`**, so a repeat enquiry updates one row instead of
  duplicating. Contact Id must be sent; `Normalize` falls back to `phone:<digits>` if absent.
- `Preserve first values` reads the **`instagram_in`** column names (`destination`,
  `travel_date`, `whatsapp_number`, `assigned_to`, `name`, `first_contact_ts`, `status`) — the
  Hakeem original read *his* tab's capitalised headers, which would have silently preserved
  nothing here and re-pushed to the CRM on every message.
- `push_now` gates the CRM so it fires only on the turn a lead **becomes** qualified.
- `Write crm_result` was dropped — `instagram_in` has no `crm_result` column.
- `Save lead` is `onError: continueRegularOutput` **on purpose**: a sheet failure must never
  cost the CRM push. Hakeem's original had no error handling, so a sheet problem killed the
  whole run.
- ⚠️ The CRM body must read `$('Preserve first values').item.json`, **not** `$json` — at the
  Push node `$json` is whatever `Ready for CRM?` passed through (the Save-lead item, which is
  an error object while `A1` is blank). Using `$json` posted an empty body and the CRM answered
  `422 Phone number is required`.
- `assigned_to` carries the assignee here. It doubles as the AI bot's dedup-lock cell, but the
  AI bot only ever writes it on rows for its own Instagram contacts, so the two never collide.

Verified 2026-09-10 (executions `358018` / `358019` / `358740`): phone canonicalised
`9750052877 → 919750052877` and displayed `+91 97500 52877`, `channel: facebook`,
`status: qualified`, Workpex `Form submitted successfully`, Custom CRM `ok: true` with
`source: 'facebook'`, and the sheet row appended with all 11 mapped columns.

### ⚠️ `Save lead` uses `append`, NOT `appendOrUpdate` — and why

Nobody on the team has edit access to "OB leads", so the blank `instagram_in!A1` header
cannot be restored. Column A therefore **cannot be written or matched by n8n at all**.
Three routes were tried and all fail:

| attempt | result |
|---|---|
| `matchingColumns: ['col_1']` | `Column names were updated after the node's setup` — `col_1` is a name n8n's sheet *reader* invents; the *writer* resolves literal header text |
| `matchingColumns: ['']` (the literal blank header) | `The column "" could not be found` |
| Sheets REST API via HTTP Request node | `401 Expected OAuth 2 access token` — n8n only signs service-account JWTs *inside* Google nodes, never from the generic HTTP node, and no OAuth credential exists any more |

`appendOrUpdate` keyed on `whatsapp_number` was considered and **rejected as unsafe**:
185 existing rows have an empty `whatsapp_number` (the AI bot's in-progress leads), so a
Facebook lead arriving without a phone would match one of them and **overwrite a real
lead**. `append` can never clobber a row, so it wins.

Accepted costs until A1 is fixed:
- **Column A stays empty on Facebook rows** — no subscriber id is stored, so the watchdog
  cannot see these rows either.
- A contact who completes the flow twice produces **two rows**. The CRM still dedupes on
  phone (verified `deduped: true`), so there is no duplicate CRM lead.

**When someone with sheet access sets `A1` to `ig_user_id`:** switch `Save lead` back to
`appendOrUpdate`, set `matchingColumns: ['ig_user_id']`, add `ig_user_id` to the mapping,
and repoint `Lookup existing row`'s `lookupColumn` from `whatsapp_number` to `ig_user_id`.
Both nodes carry a `notes` field in n8n saying exactly this.

> One test row, **`ZZ CLAUDE FINALTEST`** (`zz_claude_final`, Andaman), is in the tab from
> execution `358740`. It was deliberately **not** deleted: removing a row needs a computed
> row index on a live sheet, and an off-by-one would destroy a real customer lead. Delete
> it by hand when someone has access.

## n8n
- Instance: `https://n8n.srv1159219.hstgr.cloud`
- Project: Outbound Travelers (`outboundtravelers1@gmail.com`)
- Workflow: **"Outbound IG Lead Bot — 1 · Chat & Capture"** (`AfmPZXhWMetbxHTl`) — **ACTIVE**
- Webhook path: `ig-lead-bot`
  → URL `https://n8n.srv1159219.hstgr.cloud/webhook/ig-lead-bot`
- Error workflow: "Error Alerts" (`f8JebCcUmgk137Li`)
- Companion flows: CRM Sync (`yH0weFfeYiobqdZq`), Comment Seed (`9y02z4wHfm1y4Q6V`)
- Test workflow: `N1D44nSBQjAyo2CQ`, webhook `ig-lead-bot-rahul-test` (inactive, used for safe validation)

## Leads store (Google Sheet)
- File: **"OB leads"** (`1B2bpou1p6ZISE0nGWjxhSY23ezlzjuysDtZ9AuB4EVg`), tab **`instagram_in`**
  (gid `1286047384`) — verified against the live workflow 2026-09-10.
- Google Sheets credential in n8n: **"Google Sheets (Service Account)"** (`SjmGyVegUeZAEzO7`)
- ⚠️ **Row 1 header text is load-bearing.** n8n's Sheets nodes match columns by *name*, so
  blanking or renaming a header silently breaks every node that references it — and because
  these nodes run `onError: continueRegularOutput`, **the execution still reports `success`
  while the lead is discarded.** On 2026-09-10 cell **A1** (`ig_user_id`) was found empty:
  `Lookup existing lead`, `Save lead`, `QA Save` and `Flag send failure` were all failing
  (`Column names were updated after the node's setup`), so 100% of `.in` leads were being
  dropped and the watchdog recovered nothing (it read `ig_user_id` as `undefined`).
  Diagnose by reading the watchdog's `Read leads` output: a blank header appears as `col_1`.
- Live header row (16 cols, order is irrelevant — only the names matter):
  `ig_user_id` · `ig_username` · `name` · `whatsapp_number` · `destination` ·
  `normalized_destination` · `travel_date` · `pax` · `budget` · `quick_assistance` ·
  `status` · `channel` · `first_contact_ts` · `last_update_ts` · `assigned_to` · `notes - AI`
  (`assigned_to` doubles as the dedup-lock cell)
- ⚠️ **Superseded:** `"Testing new bot"` (`1T89p6…`) / tab `leads_v2` is the OLD store. It is no
  longer read or written by this bot — only `Save lead (old sheet mirror)` in the REWRITE flow
  (`hJyzlj8So1Hyx2Ci`) still writes there. `../../docs/google-sheet-schema.md` still documents the
  old 13-column A–M layout and is stale for this account.

## LLM
- OpenAI credential in n8n: **"OpenAi account (WORKING June 2026)"** (`xNZip6hDSsmAroMc`)
- Model: `gpt-4o-mini`, JSON response mode, temperature 0.35

## CRM
- Push on **Yes** quick-assistance click → POST `https://n8n.srv1159219.hstgr.cloud/webhook/crm-lead-sync`
- Source tag: `instagram`
- Contract: [`../../docs/crm-integration-contract.md`](../../docs/crm-integration-contract.md)

## WhatsApp handoff
- Number: **+91 9597959728** → `https://wa.me/919597959728`
