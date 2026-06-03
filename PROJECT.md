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
│  Webhook → Lookup existing lead (Sheets) → Normalize input (Code)                   │
│      → AI Agent  ├─ OpenAI Chat Model (gpt-4o-mini, JSON)                            │
│                  └─ Simple Memory (per ig_user_id)                                   │
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

**Where the "memory" lives:** two places, both keyed on `ig_user_id` — (a) ManyChat's
Custom User Fields ride along on every request, and (b) the **Lookup existing lead**
node re-reads the saved row at the start of every run. The AI Agent also has a
**Simple Memory** buffer for in-session turns. No separate database.

---

## 3. The n8n instance & workflows

- **Instance URL:** `https://n8n.srv1159219.hstgr.cloud` (Hostinger VPS)
- **Webhook URL (give this to ManyChat):** `https://n8n.srv1159219.hstgr.cloud/webhook/ig-lead-bot`

### Workflows on the instance

| Workflow | ID | State | Belongs to this project? |
|----------|----|-------|--------------------------|
| **Outbound IG Lead Bot — 1 · Chat & Capture** | `AfmPZXhWMetbxHTl` | 🟢 **active** | ✅ yes — the live bot |
| **Outbound IG Lead Bot — 2 · Follow-up Nudges** | `GfDTRO3xDyZIWdnu` | ⚪ inactive | ✅ yes — built, not switched on |
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
| 3 | **Normalize input** | `n8n-nodes-base.code` | Cleans the webhook + known fields, builds the **full system prompt** with the gender-matched persona + returning-user flags. → [normalize.js](workflow/chat-and-capture/normalize.js) |
| 4 | **AI Agent** | `@n8n/n8n-nodes-langchain.agent` (**typeVersion 3**) | The LLM orchestrator. |
| 4a | **OpenAI Chat Model** | `@n8n/n8n-nodes-langchain.lmChatOpenAi` | `gpt-4o-mini`, JSON response mode. Sub-node of AI Agent — the OpenAI credential attaches *here*. |
| 4b | **Simple Memory** | `@n8n/n8n-nodes-langchain.memoryBufferWindow` | Per-user in-session buffer. |
| 5 | **Parse + validate** | `n8n-nodes-base.code` | Parses the LLM JSON, reads `intent`, validates the WhatsApp number, merges fields, computes `status`, sets `is_lead`. → [parse_validate.js](workflow/chat-and-capture/parse_validate.js) |
| 6 | **Respond to Webhook** | `n8n-nodes-base.respondToWebhook` | Sends `reply` + fields back to ManyChat **fast** (before the sheet write). |
| 7 | **Is lead?** | `n8n-nodes-base.if` | Gates the sheet write on `is_lead` so office-info / career / casual queries never create rows. |
| 8 | **Save lead** | `n8n-nodes-base.googleSheets` | Append-or-Update on the `leads` tab, match key `ig_user_id`. |

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

## 5. Flow 2 — Follow-up Nudges (built, off)

**Workflow:** `Outbound IG Lead Bot — 2 · Follow-up Nudges` (`GfDTRO3xDyZIWdnu`), **inactive**, 5 nodes.
Chases quiet, incomplete leads automatically. Design notes: [followup-nudges-plan.md](docs/followup-nudges-plan.md).

### Nodes (in execution order)

| # | Node | Type | What it does |
|---|------|------|--------------|
| 1 | **Every 10 min** | `n8n-nodes-base.scheduleTrigger` | Runs the scan every 10 minutes. |
| 2 | **Read leads** | `n8n-nodes-base.googleSheets` | Reads all rows from the `leads` tab. |
| 3 | **Pick due nudges** | `n8n-nodes-base.code` | Picks who's due, writes personalized/varied copy. Policy-safe. → [pick_due_nudges.js](workflow/follow-up-nudges/pick_due_nudges.js) |
| 4 | **Send nudge (ManyChat)** | `n8n-nodes-base.httpRequest` | Calls the ManyChat Send API to deliver the nudge to Instagram. |
| 5 | **Mark nudged** | `n8n-nodes-base.googleSheets` | Increments `nudge_count`, writes `last_nudge_ts`. |

### Nudge policy (anti-spam, anti-ban — enforced in `pick_due_nudges.js`)
- **Nudge 1** when `nudge_count = 0` and last activity is **30 min – 24 h** ago.
- **Nudge 2** when `nudge_count = 1` and last activity is **2 h – 24 h** ago.
- **Hard cap 2 nudges** per lead, ever.
- **Never** nudge a `qualified` lead.
- **Only inside Instagram's 24 h messaging window** — outside it the send is skipped (correct, no spam).
- No WhatsApp number in nudges (that's qualified-only).

### Before it can go live — still needed
1. **ManyChat API token** → store as an n8n **HTTP Header Auth** credential (never in JSON).
2. Add a **`subscriber_id`** field to the ManyChat External Request body (Send API needs the
   ManyChat subscriber id, *not* `ig_user_id`) and a `subscriber_id` sheet column.
   - ⚠️ Today [pick_due_nudges.js](workflow/follow-up-nudges/pick_due_nudges.js) uses `ig_user_id`
     as the `subscriber_id`. Confirm that ManyChat accepts the Contact Id here, or switch to the
     real subscriber id once it's captured.
3. Add sheet columns **`subscriber_id`, `nudge_count`, `last_nudge_ts`** (see [§8](#8-google-sheet-the-store)).
4. Make Flow 1's **Save lead** treat the nudge columns as passthrough so it doesn't blank them.
5. Activate the workflow + test the full nudge lifecycle.

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
5. **whatsapp_number** — 10-digit Indian mobile (strip `+91`/spaces; junk → left empty so the bot re-asks once)

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
| D | `whatsapp_number` | lead field (10 digits) |
| E | `destination` | lead field |
| F | `pax` | lead field |
| G | `budget` | lead field |
| H | `status` | `new` / `in_progress` / `qualified` |
| I | `first_contact_ts` | IST `YYYY-MM-DD HH:MM:SS`, preserved across updates |
| J | `last_update_ts` | IST, set to "now" every message |
| K | `assigned_to` | blank in v1; routing fills it later |

**`first_contact_ts` preservation:** Append-or-Update overwrites mapped columns, so the **Lookup
existing lead** node reads the prior `first_contact_ts` and reuses it; only new rows stamp "now".

### Pending columns for Flow 2 (add when the nudge flow goes live)
| Col | Header | Meaning |
|-----|--------|---------|
| L | `subscriber_id` | ManyChat subscriber id (needed by the Send API) |
| M | `nudge_count` | 0 / 1 / 2 |
| N | `last_nudge_ts` | IST timestamp of the last nudge |

---

## 9. Credentials

> **Names & IDs only — never the secret values.** All secret material lives in n8n's
> credential store (and the MCP token in Claude Code's env). See [§12](#12-security--secrets).
> Setup steps: [docs/n8n-credentials.md](docs/n8n-credentials.md).

| Credential | n8n name | n8n ID | Type | Used by |
|------------|----------|--------|------|---------|
| OpenAI | `OpenAi account` | `hVkKnR0gPFSyIVu4` | OpenAI | Flow 1 · OpenAI Chat Model (gpt-4o-mini) |
| Google Sheets | `Google Sheets account` | `Bnb4dKAXJwcqzUWj` | Google Sheets OAuth2 API | Flow 1 · Lookup/Save · Flow 2 · Read/Mark |
| ManyChat API | *(pending)* | — | HTTP Header Auth (`Authorization: Bearer …`) | Flow 2 · Send nudge — **not yet created** |

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
│   └── follow-up-nudges/             → Flow 2 (GfDTRO3xDyZIWdnu)
│       └── pick_due_nudges.js        "Pick due nudges" Code node
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
- [x] **Flow 2 built** (`GfDTRO3xDyZIWdnu`, 5 nodes) — scheduled, **not yet activated**.
- [x] Old draft archived; workflows renamed to the branded pair.

### Pending
- [ ] Confirm test rows landed in the `leads` tab (`ig_test_001`–`005`).
- [ ] **ManyChat wired** (Faheem) — Default Reply → External Request → the webhook URL.
- [ ] Real DM tests in Tamil / Tanglish / English; tune the prompt (edit **both** copies).
- [ ] **Flow 2 go-live prerequisites** — see [§5](#5-flow-2--follow-up-nudges-built-off) (ManyChat token, `subscriber_id`, sheet columns L–N, passthrough, activate).
- [ ] **Regenerate `N8N_MCP_TOKEN`** before go-live.

### Out of scope for v1 (future)
Auto-WhatsApp message on qualify · CRM round-robin assignment · dormant-lead re-engagement
broadcasts (beyond the 2-nudge sequence).

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
