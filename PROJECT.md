# PROJECT.md — Outbound Travelers · Instagram Lead Bot (n8n)

> **The single source of truth for this project, A–Z.** Flows, nodes, credentials,
> sheet schema, business facts, status, and everything needed to run, hand off, or
> rebuild it. No secret *values* live here (only credential *names/IDs*) — see
> [§12 Security](#12-security--secrets).
>
> Last reconciled with the live n8n instance: **2026-06-01**.

---

## Table of contents
1. [What this is](#1-what-this-is)
2. [System map](#2-system-map)
3. [The n8n instance & workflows](#3-the-n8n-instance--workflows)
4. [Flow 1 — Chat & Capture (live)](#4-flow-1--chat--capture-live)
5. [Flow 2 — Follow-up Nudges (built, off)](#5-flow-2--follow-up-nudges-built-off)
5A. [Flow 3 — CRM Sync (Workpex)](#5a-flow-3--crm-sync-workpex-live)
6. [The conversation brain](#6-the-conversation-brain)
7. [The 5 fields & intents](#7-the-5-fields--intents)
8. [Google Sheet (the store)](#8-google-sheet-the-store)
9. [Credentials](#9-credentials)
10. [ManyChat wiring](#10-manychat-wiring)
11. [Business facts the bot uses](#11-business-facts-the-bot-uses)
12. [Security & secrets](#12-security--secrets)
13. [Repo layout](#13-repo-layout)
14. [Status & open tasks](#14-status--open-tasks)
15. [Glossary](#15-glossary)

---

## 1. What this is

An n8n automation that turns **Outbound Travelers'** Instagram DMs into a
human-feeling AI travel consultant. It chats naturally, collects **5 lead fields**
over the conversation, and saves every lead to Google Sheets — **zero leads lost**,
even half-finished ones. A second (scheduled) flow re-nudges quiet, incomplete leads.

**The core problem it fixes:** the old ManyChat → Sheets stack only wrote a row on
*flow completion*, so stalled conversations vanished. This build writes/updates the
row from the **first message** and on **every message**.

**Division of labour:**

| Part | Role |
|------|------|
| **Instagram** | the channel (DMs) |
| **ManyChat** | dumb pipe — forwards every DM to n8n, stores field values, sends the reply back. **No conversation logic.** |
| **n8n** | orchestrator (the body) |
| **OpenAI (gpt-4o-mini)** | the brain — reads each message, writes the reply, extracts fields, classifies intent |
| **Google Sheets** | the store **and** the memory (the row is re-read each message) |

---

## 2. System map

```
Instagram DM
   │
   ▼
ManyChat  (Default Reply → External Request — fires on EVERY message)
   │   POST: message_text, ig_user_id, ig_username, ig_fullname, + all known field values
   ▼
┌─────────────────────────── n8n: Flow 1 — Chat & Capture ───────────────────────────┐
│  Webhook → Lookup existing lead (Sheets, incl. notes) → Normalize input (Code)      │
│      → AI Agent  ├─ OpenAI Chat Model (gpt-4o-mini, JSON)                            │
│                  └─ Simple Memory (window buffer, per ig_user_id)                    │
│      → Parse + validate (Code) → Respond to Webhook  ◄── reply goes back FAST (<5s)  │
│      → Is lead? (IF) → Save lead (Sheets, append-or-update by ig_user_id)            │
└─────────────────────────────────────────────────────────────────────────────────────┘
   │  reply
   ▼
ManyChat sends reply to the user + writes returned `fields` back into Custom User Fields
   (that write-back IS the memory carried into the next message)

╭───────── n8n: Flow 2 — Follow-up Nudges (scheduled, currently OFF) ─────────╮
│  Every 10 min → Read leads (Sheets) → Pick due nudges (Code)               │
│      → Send nudge (ManyChat Send API) → Mark nudged (Sheets)               │
╰───────────────────────────────────────────────────────────────────────────╯
```

**Why the Sheets write happens *after* Respond to Webhook:** ManyChat's External
Request times out at ~10s. Reply first, persist second — the user never waits on a
sheet write.

**Where the "memory" lives — 3 layers (production design, all keyed on `ig_user_id`):**
1. **Simple Memory** (`memoryBufferWindow`, window 40) attached to the AI Agent — the agent sees
   the actual recent messages **synchronously**, independent of the sheet. Primary continuity
   mechanism; the reason the bot can't blank out mid-chat.
2. **KNOWN FIELDS** — structured values, merged from the **Lookup existing lead** sheet row AND the
   field values ManyChat passes in the webhook body (whichever is filled). Two structured channels.
3. **Notes summary** — a running summary in the `notes - AI` column (col L); the LLM rewrites it
   each turn and Normalize injects it next message as `NOTES SO FAR: …`. Durable + human-readable.

> **Why 3 layers (history).** The bot first shipped (2026-06-03) with **notes-only** memory after
> the Simple Memory node was removed. Live testing showed it lost context after ~2 fast messages:
> **Save lead** writes *after* Respond-to-Webhook, so a quickly-sent next message's Lookup read an
> empty row and the bot re-introduced itself ("I don't have previous details…"). Fix: **Simple
> Memory was restored** (synchronous, sheet-independent) and kept **alongside** notes + ManyChat
> fields. Verified end-to-end (hi → ladakh → thanu → "8" no longer resets; multi-field dumps
> captured at once; "did you forget?" recalls correctly). Simple Memory is in-process (lost on n8n
> restart); the sheet notes + fields are the durable backstop. New lead → all empty → normal fresh
> flow. No separate database.

---

## 3. The n8n instance & workflows

- **Instance URL:** `https://n8n.srv1159219.hstgr.cloud` (Hostinger VPS)
- **Webhook URL (give this to ManyChat):** `https://n8n.srv1159219.hstgr.cloud/webhook/ig-lead-bot`

### Workflows on the instance

| Workflow | ID | State | Belongs to this project? |
|----------|----|-------|--------------------------|
| **Outbound IG Lead Bot — 1 · Chat & Capture** | `AfmPZXhWMetbxHTl` | 🟢 **active** | ✅ yes — the live bot |
| **Outbound IG Lead Bot — 2 · Follow-up Nudges** | `GfDTRO3xDyZIWdnu` | 🟢 **active** | ✅ yes — gentle 15/30-min nudges, live |
| **Outbound IG Lead Bot — 3 · CRM Sync (Workpex)** | `yH0weFfeYiobqdZq` | 🟢 **active** | ✅ yes — pushes each qualified lead to Workpex CRM (activated 2026-06-06) |
| `[ARCHIVED] Outbound Travellers Instagram AI Agent (old draft — superseded)` | `nnBV8vrvYsMIL6IE` | ⚪ inactive | ⚠️ retired early draft — kept for reference only |
| `My workflow` | `8yGvAmoeoeT4pI2K` | 🟢 active | ❌ **not this project** — left untouched |

> **Naming convention:** the two project workflows are prefixed
> `Outbound IG Lead Bot — N · <stage>` so they sort together and read in run-order in
> the n8n list. The repo mirrors this: `workflow/chat-and-capture/` and
> `workflow/follow-up-nudges/`.
>
> **Note on "archive":** the n8n MCP has no true archive operation, so the old draft
> was deactivated and renamed with an `[ARCHIVED]` prefix instead. To *truly* archive
> (or delete) it, do it in the n8n UI — it's already off and harmless where it is.

---

## 4. Flow 1 — Chat & Capture (live)

**Workflow:** `Outbound IG Lead Bot — 1 · Chat & Capture` (`AfmPZXhWMetbxHTl`), **active**, 10 nodes.

### Nodes (in execution order)

| # | Node | Type | What it does |
|---|------|------|--------------|
| 1 | **Webhook** | `n8n-nodes-base.webhook` | POST entrypoint at `/webhook/ig-lead-bot`. ⚠️ Payload lives under `$json.body`. |
| 2 | **Lookup existing lead** | `n8n-nodes-base.googleSheets` | Reads the row for this `ig_user_id` (returning-user memory). |
| 3 | **Normalize input** | `n8n-nodes-base.code` | Cleans the webhook + known fields, reads the saved **notes** (col `notes - AI`), builds the **full system prompt** with the persona + returning-user flags + injected `NOTES SO FAR`. → [normalize.js](workflow/chat-and-capture/normalize.js) |
| 4 | **AI Agent** | `@n8n/n8n-nodes-langchain.agent` (**typeVersion 3**) | The LLM orchestrator. |
| 4a | **OpenAI Chat Model** | `@n8n/n8n-nodes-langchain.lmChatOpenAi` | `gpt-4o-mini`, JSON response mode. Sub-node of AI Agent — the OpenAI credential attaches *here*. |
| 4b | **Simple Memory** | `@n8n/n8n-nodes-langchain.memoryBufferWindow` | Window buffer (length 40), `sessionKey = ig_user_id`. Synchronous in-session memory — the agent sees the recent messages. In-process (lost on n8n restart); notes + fields are the durable backstop. |
| 5 | **Parse + validate** | `n8n-nodes-base.code` | Parses the LLM JSON, reads `intent`, validates the WhatsApp number, merges fields, keeps the running `notes` (falls back to prior notes if the LLM omits it), computes `status`, sets `is_lead`. → [parse_validate.js](workflow/chat-and-capture/parse_validate.js) |
| 6 | **Respond to Webhook** | `n8n-nodes-base.respondToWebhook` | Sends `reply` + fields back to ManyChat **fast** (before the sheet write). `notes` are internal — NOT sent to ManyChat. |
| 7 | **Is lead?** | `n8n-nodes-base.if` | Gates the sheet write on `is_lead` so office-info / career / casual queries never create rows. |
| 8 | **Save lead** | `n8n-nodes-base.googleSheets` | Append-or-Update on the `leads` tab, match key `ig_user_id`. Writes the running summary to `notes - AI`. |

> **Memory note:** memory is **3 layers** — Simple Memory (synchronous, in-session) + KNOWN FIELDS
> (sheet row ∪ ManyChat body) + the persisted `notes - AI` summary. See [§2](#2-system-map) and
> [§8](#8-google-sheet-the-store).

**Connections:** `Webhook → Lookup existing lead → Normalize input → AI Agent → Parse + validate → Respond to Webhook → Is lead? → Save lead`. (OpenAI Chat Model & Simple Memory attach to AI Agent via `ai_languageModel` / `ai_memory`.)

> ⚠️ **AI Agent must be typeVersion 3, not 3.1** — 3.1 fails to activate via the n8n API on this instance.

### Webhook request body (what ManyChat sends)
```json
{
  "message_text": "<user's last DM>",
  "ig_user_id":   "<ManyChat Contact / IG user id>",
  "ig_username":  "<IG @handle>",
  "ig_fullname":  "<IG full name, used for gender guess>",
  "name": "", "whatsapp_number": "", "destination": "", "pax": "", "budget": ""
}
```

### Webhook response (what n8n returns)
```json
{
  "reply": "…message to send to the user (English only)…",
  "intent": "travel_lead | office_info | career | customer_query",
  "fields": { "name": "", "whatsapp_number": "", "destination": "", "pax": "", "budget": "" },
  "status": "new | in_progress | qualified | info_only"
}
```

---

## 5. Flow 2 — Follow-up Nudges (LIVE)

**Workflow:** `Outbound IG Lead Bot — 2 · Follow-up Nudges` (`GfDTRO3xDyZIWdnu`), 🟢 **active** (since 2026-06-03), 6 nodes.
Chases quiet, incomplete leads automatically with **gentle, low-pressure** copy. Design notes:
[followup-nudges-plan.md](docs/followup-nudges-plan.md).

### Nodes (in execution order)

| # | Node | Type | What it does |
|---|------|------|--------------|
| 1 | **Every 2 min** | `n8n-nodes-base.scheduleTrigger` | Runs the scan every 2 minutes (so the 10-min / +30-min marks are hit closely). |
| 2 | **Read leads** | `n8n-nodes-base.googleSheets` | Reads all rows from the `leads` tab. |
| 3 | **Pick due nudges** | `n8n-nodes-base.code` | Picks who's due, writes gentle/varied copy. Policy-safe. → [pick_due_nudges.js](workflow/follow-up-nudges/pick_due_nudges.js) |
| 4 | **Send nudge (ManyChat)** | `n8n-nodes-base.httpRequest` (**typeVersion 4.3** — see warning) | Calls the ManyChat Send API to deliver the nudge. `onError: continueErrorOutput` — a failed send routes to the error output (node 6), **not** to Mark nudged, so a lead is never marked without an actual delivery. |
| 5 | **Mark nudged** | `n8n-nodes-base.googleSheets` | On **successful** send only: sets `nudge_count` + `last_nudge_ts` (append-or-update by `ig_user_id`). Auto-creates those columns on first nudge if absent. |
| 6 | **Send failed (skip)** | `n8n-nodes-base.noOp` | Sink for failed sends (Send nudge error output). Ends the branch so failures aren't marked or retried into duplicate marks. |

**Connections:** `Every 5 min → Read leads → Pick due nudges → Send nudge → Mark nudged` (success, main[0]);
`Send nudge → Send failed (skip)` (error, main[1]).

### Nudge policy (anti-spam, anti-ban — enforced in `pick_due_nudges.js`)
- **Nudge 1** when `nudge_count = 0` and the lead has been silent **≥ 10 min** since their last message.
- **Nudge 2 (final)** when `nudge_count = 1`, **30 min after nudge 1 was sent**, and **only if the lead
  did not reply to nudge 1**. After this, stop.
- **Hard cap 2 nudges** per lead, ever — then we leave them alone.
- **Never** nudge a `qualified` lead.
- **Only inside Instagram's 24 h messaging window** — outside it the send is skipped (correct, no spam).
- **Field-specific copy:** each nudge gently asks for the **first still-missing** of the 5 fields
  (destination → name → pax → budget → whatsapp_number), personalised with what's already known — so the
  follow-up exists purely to complete the 5 info, never generic spam.
- A lead with **no missing field** is skipped (extra safety on top of the `qualified` skip).
- Tone is **gentle, no pressure, no scarcity** — every nudge gives the lead an easy out.

> **🔒 Anti-loop (why it can't spam 100× like the first version did):** the authoritative cap is a
> **persistent static-data ledger** (`$getWorkflowStaticData('global').nudges`, keyed by `ig_user_id`,
> holding `{count, ts}`). It survives every scheduled run + n8n restarts, and is **incremented in the
> picker BEFORE the send** — so even if the ManyChat send or the `Mark nudged` sheet write fails, the
> next run sees the higher count and won't re-nudge. The sheet `nudge_count` column is only a backup
> floor (via `Math.max`). The original bug was that the sheet had no `nudge_count` column, so the write
> silently failed and the count never moved → infinite nudges. This design removes that failure mode.
>
> **Timing:** nudge-1 timing is measured from `last_update_ts` (the lead's last message); nudge-2 timing
> is measured from the **ledger's last-nudge `ts`** (so it's 30 min *after nudge 1*, and is suppressed if
> `last_update_ts` is newer than the nudge = they replied).

### Status (reconciled 2026-06-08)
- 🟢 **LIVE / active** (activated 2026-06-08). Cadence **10 min / +30 min**, schedule every **2 min**,
  field-specific gentle copy, loop-proof ledger. Skips qualified leads and leads with no missing field.
- ⏳ **Confirm on first real nudge:** that ManyChat accepts `ig_user_id` as the Send-API `subscriber_id`
  (a failed send is loop-safe — it routes to the no-op sink and the ledger still increments — but the
  nudge won't deliver until the id is right). Check a `Send nudge (ManyChat)` execution result.
- ✅ **ManyChat API credential exists** in n8n — `ManyChat API` (HTTP Header Auth, id `WRHI5I3GZm4zJCrl`), wired to the Send nudge node.
- ✅ Timing set to **15 / 30 min**, schedule tightened to **5 min**, copy rewritten **gentle/non-pushy**, failed-send handling added (error output → no-op sink).
- ✅ `n8n_validate_workflow` passes clean (0 errors).

> ⚠️ **NODE VERSION CONSTRAINT (this instance, n8n 1.121.3).** Activation kept failing with
> `Cannot read properties of undefined (reading 'execute')` because the Send nudge node was
> **HTTP Request typeVersion 4.4, which this n8n build does not ship** — the node resolved to `undefined`
> (and rendered with a broken icon). **Fixed by downgrading to 4.3** (the version the active `My workflow`
> uses here). General rule for this instance: **do not use node typeVersions newer than what the live
> workflows already use** — known caps are **HTTP Request ≤ 4.3** and **AI Agent = 3.0 (not 3.1)**. The
> n8n API *can* activate fine once versions are valid.

### Still to confirm after activation
1. **`subscriber_id`**: today `pick_due_nudges.js` uses `ig_user_id` (ManyChat Contact Id) as the Send API
   `subscriber_id`. Confirm ManyChat accepts the Contact Id here; if not, capture the real subscriber id
   (add it to the External Request body + a `subscriber_id` sheet column) and switch.
2. Sheet columns **`nudge_count`, `last_nudge_ts`** are auto-created by **Mark nudged** on the first
   successful nudge. If your Google Sheets node build doesn't auto-create, add them manually (cols M–N).
   Watch Flow 1's **Save lead** for a one-time "column names updated" notice when they first appear
   (trailing columns are normally tolerated at runtime; re-open + re-save Save lead if it complains).
3. Test the full nudge lifecycle (15-min nudge → 30-min nudge → stop) against a real quiet lead.

---

## 5A. Flow 3 — CRM Sync (Workpex) (LIVE)

**Workflow:** `Outbound IG Lead Bot — 3 · CRM Sync (Workpex)` (`yH0weFfeYiobqdZq`), 🟢 **active**
(since 2026-06-06), 3 nodes. Pushes each **newly qualified** lead into the **Workpex CRM** intake form.

### How a lead reaches the CRM (the full chain)

The trigger lives in **Flow 1**, not here — Flow 1 owns the "fire exactly once" logic:

1. **Flow 1 · Parse + validate** computes `crm_push = qualified && !wasQualified` — i.e. `true` **only on
   the single message where the lead first becomes `qualified`** (compared against the previously-known
   fields). So Workpex receives each lead **exactly once**, never on every later message.
2. **Flow 1 · Save lead → Newly qualified? (IF `crm_push == true`) → Push to CRM (HTTP Request)** —
   POSTs to Flow 3's webhook `https://n8n.srv1159219.hstgr.cloud/webhook/crm-lead-sync` with a JSON body
   (note the CRM-side field names differ from the bot's vocabulary):

   | Body key sent | Source (lead field) |
   |---------------|---------------------|
   | `name`           | name |
   | `contact_number` | whatsapp_number |
   | `destination`    | destination |
   | `travelers`      | pax |
   | `budget`         | budget (free text) |

   `Push to CRM` has `onError: continueRegularOutput`, so a CRM hiccup never breaks the chat flow.
3. **Flow 3** receives it and forwards to Workpex (nodes below).

### Flow 3 nodes (in execution order)

| # | Node | Type | What it does |
|---|------|------|--------------|
| 1 | **Webhook** | `n8n-nodes-base.webhook` (2.1) | POST entrypoint at `/webhook/crm-lead-sync`. Payload under `$json.body`. |
| 2 | **Normalize for CRM** | `n8n-nodes-base.code` (2) | Coerces 3 fields to the shapes the Workpex form needs: **budget**→number (`50k`→50000, `1.5L`→150000, junk/`flexible`→0), **pax**→integer (`"4 people"`→4), **phone**→digits-only with country code (`+91 93441 05896`→`919344105896`). → [normalize_for_crm.js](workflow/crm-sync/normalize_for_crm.js) |
| 3 | **Send to CRM** | `n8n-nodes-base.httpRequest` (**4.3** — see instance version cap) | POSTs to the Workpex intake form `https://admin.workpex.com/form/527c22ad-a7f7-4586-8f72-9024a0ff1eac` as **query params**. `onError: continueRegularOutput`, `retryOnFail` (3 tries, 2 s apart) so a transient Workpex failure doesn't drop the lead silently. |

**Connections:** `Webhook → Normalize for CRM → Send to CRM`.

### Workpex form — actual field types (read from the live form 2026-06-06)

| Workpex field | Form input type | Notes / constraint |
|---------------|-----------------|--------------------|
| First Name | `text` | free text |
| Phone | `tel` | accepts our digits-only `919…` |
| Number Of Members | **`number`** | must be numeric — why we coerce pax to an integer |
| Budget | `text/select` | we send a number |
| **Destination** | **`select` (fixed dropdown)** | only 24 options — see below |

**Destination dropdown options (the only values the form natively offers):** Kashmir · Manali · Andaman ·
Phu Quoc · Bali · Thailand · Malaysia · Meghalaya · Munnar · Kerala · Dubai · Vietnam · Rajasthan · Goa ·
Maldives · Golden Triangle · Delhi · Agra · Langkawi · Singapore · Srilanka · Lakshadweep · Hyderabad · Shimla.

### Workpex form field mapping (the `Send to CRM` query params)

| Workpex param | Value (from) |
|---------------|--------------|
| `lead_firstname`     | `body.name` |
| `lead_phone`         | `Normalize for CRM` → `phone` (digits-only, e.g. `919344105896`) |
| `Destination`        | `body.destination` (passed through raw — see dropdown caveat) |
| `Number Of Members`  | `Normalize for CRM` → `members` (integer) |
| `Budget`             | `Normalize for CRM` → `travel_budget` (number) |

> ⚠️ The Workpex param names are **literal** (capitalised, with spaces: `Number Of Members`, `Destination`,
> `Budget`) — they match the actual Workpex form fields. The phone-style params are snake_case
> (`lead_firstname`, `lead_phone`). Don't "tidy" these — they must match Workpex exactly.

### Status (reconciled 2026-06-06)
- ✅ **LIVE / active.** Validates clean (0 errors). Verified end-to-end 2026-06-06 with messy inputs:
  pax `"4 people"`→`4`, phone `+91 93441 05896`→`919344105896`, budget `"1.5L total"`→`150000`,
  Workpex returned **HTTP 200**. (Plus earlier successful executions on 2026-06-03.)
- ⚠️ **Test leads `ZZ Test Lead (delete me)` and `ZZ Test Lead 2 (delete me)` should be deleted in Workpex.**

### Known limitations / open decisions
- 🔴 **Destination is a fixed dropdown of 24 values, but the bot accepts ANY place on Earth.** Off-list
  destinations (Paris, Ladakh, China, "anywhere"…) are POSTed raw to a `select` field. The form returns
  HTTP 200 either way, so a dropped/rejected value looks identical to success — **unverified** how Workpex
  stores an off-list value (only on-list values, Bali/Thailand, have been tested). **Decision: expand the
  Workpex form** — add the missing popular destinations and/or an **"Other" free-text** field so every bot
  answer fits. (Done on the Workpex admin side, not in n8n.) Until then, popular SEA/India destinations are
  covered; the true destination is always preserved in the Google Sheet `notes - AI` for the expert.
- **Budget = 0 for vague budgets.** Leads with `"medium / flexible"` / no figure send `Budget = 0` (the bot
  intentionally doesn't pressure for a number). The sales side fills the real figure. To send the raw text
  instead, add a separate text field on the Workpex form.
- **Silent success.** Workpex returns `{"status":200}` regardless of field-level validation; `Send to CRM`
  now retries 3× on transient errors, but a *200-with-dropped-field* can't be detected here. Spot-check
  Workpex against the Google Sheet periodically.
- **Indirect hop.** The chat→CRM path goes Flow 1 → internal webhook → Flow 3. It works, but **Flow 3
  must stay active** or `Push to CRM` POSTs into an unregistered webhook (404, silently swallowed by
  `onError`). Alternative (not done): fold Normalize for CRM + the Workpex POST directly into Flow 1 and
  retire Flow 3 — one fewer moving part.

---

## 6. The conversation brain

The system prompt is the core asset. It exists in **two places that must stay in sync**:

- **Canonical reference:** [prompts/system_prompt.md](prompts/system_prompt.md) — readable, for tuning.
- **Live runtime copy:** embedded as a template literal inside
  [normalize.js](workflow/chat-and-capture/normalize.js) (the **Normalize input** node), which
  injects the gender signals, known fields, and returning-user flags at runtime.

> When you tune the prompt, edit **both**. The live one wins; the `.md` is the human copy.

### Persona — gender-matched
The bot picks a name from the customer's likely gender (guessed from name-in-chat → IG full
name → username, in that priority):

| Customer appears… | Bot is… |
|-------------------|---------|
| female | **Rahul** (male consultant) |
| male | **Harshita** (female consultant) |
| unclear / unisex | **Harshita** |

It introduces itself by name + agency in the **first** reply to a new user, keeps that name the
whole chat, and never re-introduces for returning users. (An earlier single-persona draft used
the name *"Priya"* — that name is **retired**; the live bot is Rahul/Harshita.)

### Language rule (hard)
**Understand any language, reply only in English.** It reads Tamil / Tanglish / Malayalam /
Hindi / anything and answers the real meaning — but every reply is in simple, clear English,
even if the user insists on another language. Warm, casual, human texting style, 1–2 short
sentences, ≤1 approved emoji.

### Serious-moment handling
On illness / grief / tragedy / anger / disappointment signals: **zero emoji**, acknowledge first,
never pivot to travel in the same message. (Full rules in the prompt.)

---

## 7. The 5 fields & intents

### The 5 lead fields (collected in this order, one at a time)
1. **name**
2. **destination** — *any real place on Earth* (custom packages worldwide; only refuse impossible places like Mars)
3. **pax** — number travelling
4. **budget** — capture amount **and** per-person vs total
5. **whatsapp_number** — Indian 10-digit mobile → **stored as `+91 9xxxx xxxxx`** (e.g. `+91 93441 05896`). **International numbers given with their own country code (e.g. `+971…` UAE) are accepted and kept with the `+`** (not forced to India). Strip spaces/dashes/leading 0/00; junk → left empty so the bot re-asks once. (Save lead prepends a `'` so Sheets keeps the `+` as text — see [§8](#8-google-sheet-the-store).)

A lead is **`qualified`** only when **all 5** are present.

### Intents (classified on every message)
| Intent | Trigger | Behaviour | Writes to sheet? |
|--------|---------|-----------|------------------|
| **travel_lead** | any travel interest | run the 5-field flow | ✅ yes |
| **office_info** | address / hours / phone / "are you open" | answer from [business facts](#11-business-facts-the-bot-uses) | ❌ no |
| **career** | jobs / hiring / resume | redirect to careers page | ❌ no |
| **customer_query** | visa, "what's included", existing booking, "are you a bot" | brief answer; WhatsApp only if genuinely serious | ❌ no (v1) |

The sheet stays **lead-only**: only `travel_lead` (or an already-existing lead row) sets
`is_lead = true`, and the **Is lead?** node gates the write. Design notes:
[intent-routing-plan.md](docs/intent-routing-plan.md).

### Status values
`new` → `in_progress` → `qualified` (the flip to **qualified** is the **handoff trigger** for
downstream CRM/Tele-Sales). Non-lead replies may carry `info_only`.

---

## 8. Google Sheet (the store)

- **Sheet ID:** `1T89p6LhpjwNJ_kqh5WT6DAj3Jt242Gs1JaTNzDCJJio`
- **Tab:** `leads` (lowercase — matched exactly)
- **File name:** "Testing new bot"
- Template header row: [docs/leads_sheet_template.csv](docs/leads_sheet_template.csv) · full notes: [docs/google-sheets-schema.md](docs/google-sheets-schema.md)

### Columns (row 1 — exact order, header text matched by name)

| Col | Header | Meaning |
|-----|--------|---------|
| A | `ig_user_id` | **match key** for append-or-update. First msg creates the row; every msg updates it. |
| B | `ig_username` | IG @handle |
| C | `name` | lead field |
| D | `whatsapp_number` | lead field, stored **with the `+91` country code, spaced** as `+91 9xxxx xxxxx` (e.g. `+91 93441 05896`) — validated as a 10-digit Indian mobile, then formatted. ⚠️ The **Save lead** `whatsapp_number` mapping prepends a `'` (`={{ "'" + … }}`) so Google Sheets stores it as **text** and keeps the leading `+` (USER_ENTERED cell format otherwise treats `+…` as a formula and drops the `+`). |
| E | `destination` | lead field |
| F | `pax` | lead field |
| G | `budget` | lead field |
| H | `status` | `new` / `in_progress` / `qualified` |
| I | `first_contact_ts` | IST `YYYY-MM-DD HH:MM:SS`, preserved across updates |
| J | `last_update_ts` | IST, set to "now" every message |
| K | `assigned_to` | blank in v1; routing fills it later. **Unmapped** by Save lead (left untouched) but present in the node schema so column order matches. |
| L | `notes - AI` | **detailed, self-contained lead summary** = the bot's cross-message memory AND the human handoff brief. The LLM rewrites it each turn as a full **bullet-point** snapshot (one `• ` bullet per line: LEAD · STAGE · STORY · MOOD & INTENT · CONTEXT · HANDLED · NEXT STEP) so any teammate can read just this cell and understand the lead; Normalize injects it next message as `NOTES SO FAR`. Header is literally `notes - AI` (spaces + dash) — Save/Lookup match it by that exact text. Empty for a brand-new lead. |

**`first_contact_ts` preservation:** Append-or-Update overwrites mapped columns, so the **Lookup
existing lead** node reads the prior `first_contact_ts` and reuses it; only new rows stamp "now".

> ⚠️ **Save lead schema order matters.** The Google Sheets node compares its cached column
> schema against the live header row and errors (`Column names were updated after the node's
> setup`) if they drift. The node schema must list every header in physical order through
> `notes - AI`, including the unmapped `assigned_to`. If you add/reorder sheet columns, update
> the node's schema to match.

### Pending columns for Flow 2 (add when the nudge flow goes live — now M onward, since L is `notes - AI`)
| Col | Header | Meaning |
|-----|--------|---------|
| M | `subscriber_id` | ManyChat subscriber id (needed by the Send API) |
| N | `nudge_count` | 0 / 1 / 2 |
| O | `last_nudge_ts` | IST timestamp of the last nudge |

---

## 9. Credentials

> **Names & IDs only — never the secret values.** All secret material lives in n8n's
> credential store (and the MCP token in Claude Code's env). See [§12](#12-security--secrets).
> Setup steps: [docs/n8n-credentials.md](docs/n8n-credentials.md).

| Credential | n8n name | n8n ID | Type | Used by |
|------------|----------|--------|------|---------|
| OpenAI | `OpenAi account` | `hVkKnR0gPFSyIVu4` | OpenAI | Flow 1 · OpenAI Chat Model (gpt-4o-mini) |
| Google Sheets | `Google Sheets account` | `Bnb4dKAXJwcqzUWj` | Google Sheets OAuth2 API | Flow 1 · Lookup/Save · Flow 2 · Read/Mark |
| ManyChat API | `ManyChat API` | `WRHI5I3GZm4zJCrl` | HTTP Header Auth (`Authorization: Bearer …`) | Flow 2 · Send nudge — **created & wired** |

- **N8N_MCP_TOKEN** — the token Claude Code uses to reach the n8n MCP server. Lives in the
  environment / MCP config, **never** in a file. ⚠️ Was shared in plaintext during planning —
  **regenerate before go-live.**

---

## 10. ManyChat wiring

ManyChat is a **dumb pipe**: no keyword/quick-reply flow. Full steps for Faheem:
[docs/manychat-setup.md](docs/manychat-setup.md). In short:

1. **Connect Instagram** (IG Professional account linked to a Facebook Page).
2. **Create Custom User Fields** (Text): `name`, `whatsapp_number`, `destination`, `pax`, `budget`.
   (`ig_user_id` / `ig_username` come from ManyChat system fields.)
3. **Automation → Default Reply → External Request** (fires on **every** DM):
   `POST` the [request body](#webhook-request-body-what-manychat-sends) to the
   [webhook URL](#3-the-n8n-instance--workflows), header `Content-Type: application/json`.
4. **Response mapping:** send `reply` back as the IG message; write each value in `fields` into
   the matching Custom User Field (this is the cross-message memory).
5. **Confirm** the request fires on every message (not just flow completion) and fields persist.

When Flow 2 ships, also add `subscriber_id` to the request body and create two ManyChat "Nudge"
flows the Send API can target.

---

## 11. Business facts the bot uses

| | |
|--|--|
| **Agency** | Outbound Travelers — premium travel agency, Nagercoil, Tamil Nadu, South India |
| **Address** | First Floor, Me Diagnostic Centre, No.15-274E, Nagercoil, Tamil Nadu 629003 |
| **Phone** | 079040 27064 |
| **Hours** | Mon–Sat 9am–6pm · **Sunday closed** |
| **Map** | https://share.google/idBAL5lUH8U9qzXmR |
| **Website** | https://www.outboundtravelers.com |
| **Careers** | https://www.outboundtravelers.com/careers |
| **Sales WhatsApp** *(serious/qualified leads ONLY)* | +91 9597959728 · https://wa.me/919597959728 |

> The WhatsApp number is a **gate for hot leads** — shared only with a qualified `travel_lead`
> (all 5 fields) or someone explicitly asking to talk/book/get a quote. Never for office-info,
> career, or casual questions.

**Audience context:** Tier-2/3 South Indian families in Tamil Nadu; peak DM activity 9 PM–1 AM;
they write Tamil / Tanglish / English. Leads are organic (higher intent, higher trust
expectations) — tone is warm and premium, never pushy.

---

## 12. Security & secrets

- **No secret values in this repo, the workflow JSON, or any committed file.** They live only in:
  - n8n's credential store (OpenAI key, Google OAuth, future ManyChat token), and
  - Claude Code's env / MCP config (`N8N_MCP_TOKEN`).
- [.gitignore](.gitignore) covers `.env`, `*.token`, `*.key`, `secrets/`, `*.pem`.
- [.env.example](.env.example) holds placeholder keys only.
- ⚠️ **Regenerate `N8N_MCP_TOKEN` before go-live** — it was shared in plaintext during planning.
- The Code nodes strip unresolved ManyChat merge tags (`{{…}}`) so stray placeholders never land
  in the sheet or the prompt.

---

## 13. Repo layout

```
.
├── README.md                         Quick overview + pointer here
├── PROJECT.md                        ← THIS FILE (the A–Z source of truth)
├── CLAUDE.md                         Original build brief (history / rationale)
├── .env.example                      Placeholder env keys (no secrets)
├── .gitignore
├── prompts/
│   └── system_prompt.md              Canonical conversation prompt (keep in sync w/ normalize.js)
├── workflow/
│   ├── chat-and-capture/             → Flow 1 (AfmPZXhWMetbxHTl)
│   │   ├── normalize.js              "Normalize input" Code node (embeds the live prompt)
│   │   └── parse_validate.js         "Parse + validate" Code node
│   ├── follow-up-nudges/             → Flow 2 (GfDTRO3xDyZIWdnu)
│   │   └── pick_due_nudges.js        "Pick due nudges" Code node
│   └── crm-sync/                     → Flow 3 (yH0weFfeYiobqdZq)
│       └── normalize_for_crm.js      "Normalize for CRM" Code node (budget/pax/phone → Workpex push)
└── docs/
    ├── google-sheets-schema.md       Sheet columns + ID
    ├── leads_sheet_template.csv       Header row template
    ├── n8n-credentials.md            Credential setup steps + confirmed names/IDs
    ├── manychat-setup.md             ManyChat wiring steps (Faheem)
    ├── intent-routing-plan.md        Intent design notes
    └── followup-nudges-plan.md       Nudge-sequence design notes
```

---

## 14. Status & open tasks

### Done
- [x] Repo + offline artifacts (prompt, code nodes, docs) — reorganized & consistently named.
- [x] n8n-mcp connected; OpenAI + Google Sheets credentials created in n8n.
- [x] Google Sheet ID + `leads` tab confirmed.
- [x] **Flow 1 deployed, validated, ACTIVE** (`AfmPZXhWMetbxHTl`). Webhook live.
- [x] 5/5 edge-case tests passed (all-at-once → qualified, bare "hi" → new, junk-phone re-ask, Tanglish language-match, off-topic deflect).
- [x] **Flow 2 LIVE** (`GfDTRO3xDyZIWdnu`, 6 nodes) — gentle copy, **15 / 30-min** cadence (then stop),
      5-min schedule, failed-send error handling, ManyChat credential wired, validates clean, **activated 2026-06-03**.
      Activation had been blocked by an unsupported node version (HTTP Request 4.4 → fixed to 4.3); see [§5](#5-flow-2--follow-up-nudges-live).
- [x] Old draft archived; workflows renamed to the branded pair.
- [x] **Flow 3 — CRM Sync (Workpex) LIVE** (`yH0weFfeYiobqdZq`, 3 nodes), activated **2026-06-06**.
      Each newly-qualified lead is pushed once to the Workpex intake form (Flow 1 `crm_push` flag →
      `Push to CRM` → Flow 3 `Parse Budget` → `Send to CRM`). Verified end-to-end (HTTP 200 from
      Workpex; budget `50k`→`50000`). See [§5A](#5a-flow-3--crm-sync-workpex-live).
- [x] **Production memory — 3 layers** (2026-06-03): added the `notes - AI` running summary (col L),
      then — after live testing showed notes-only memory dropped context on fast messages — **restored
      Simple Memory** (window 40, per `ig_user_id`) as the synchronous primary, kept **alongside**
      notes + ManyChat field merge. Prompt v3 also: never re-introduce after msg 1, never deny memory,
      ignore trip dates/duration, capture multi-field dumps at once. End-to-end verified (hi → ladakh
      → thanu → "8" holds context; China dump captured with dates ignored; "did you forget?" recalls).
      Test rows `ig_test_notes_001`, `ig_test_mem_777`, `ig_test_dump_778` left in the sheet — safe to delete.

### Pending
- [ ] Confirm test rows landed in the `leads` tab (`ig_test_001`–`005`).
- [ ] **ManyChat wired** (Faheem) — Default Reply → External Request → the webhook URL.
- [ ] Real DM tests in Tamil / Tanglish / English; tune the prompt (edit **both** copies).
- [ ] **Flow 2 post-go-live checks** — now active; confirm `subscriber_id` acceptance by ManyChat + the
      auto-created `nudge_count`/`last_nudge_ts` columns on the first real nudge. See [§5](#5-flow-2--follow-up-nudges-live).
- [ ] **Regenerate `N8N_MCP_TOKEN`** before go-live.

### Pending — CRM
- [ ] **Delete the test lead `ZZ Test Lead (delete me)`** in the Workpex CRM (created 2026-06-06 during verification).
- [ ] Confirm with the sales team that Workpex shows the lead fields correctly (esp. `Budget = 0` for vague-budget leads).

### Out of scope for v1 (future)
Auto-WhatsApp message on qualify · CRM round-robin assignment (Workpex push is done; round-robin
*assignment* is not) · dormant-lead re-engagement broadcasts (beyond the 2-nudge sequence).

---

## 15. Glossary

| Term | Meaning |
|------|---------|
| **Lead field** | one of the 5 things collected: name, destination, pax, budget, whatsapp_number |
| **Intent** | classification of each message: travel_lead / office_info / career / customer_query |
| **qualified** | status when all 5 fields are captured — the handoff trigger |
| **Append-or-Update** | Google Sheets op that creates the row first time, updates it after, keyed on `ig_user_id` |
| **Custom User Field (CUF)** | ManyChat per-subscriber variable; carries field state between messages |
| **Send API** | ManyChat API used by Flow 2 to push a nudge into a user's IG inbox |
| **24 h window** | Instagram only lets you message a user within 24 h of their last message |
| **Faheem** | the team member who owns the ManyChat + n8n UI side |
```
