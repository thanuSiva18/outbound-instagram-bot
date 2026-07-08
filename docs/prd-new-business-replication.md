# PRD — Replicate the IG + WhatsApp + Facebook lead bot for a NEW travel business

**Status:** Draft · **Owner:** Faheem/Thanu · **Author:** Claude Code · **Date:** 2026-07-01

This document specifies cloning the existing **Outbound Travelers** 3-channel lead bot to a
**second, unrelated travel business** — its own Instagram, WhatsApp, and Facebook page.

Decisions already made (from planning):

| Question | Decision |
|---|---|
| Infrastructure | **Fully separate / isolated stack** — own credentials, own leads store, its own accounts. |
| Existing accounts | **Nothing exists yet** — this PRD includes a full account-setup checklist as Step 1. |
| Bot behaviour | **Exact clone of the current live "Rahul" scripted flow, rebranded** (only names/number/destinations/hours change). |
| Leads store | **Google Sheet only — no CRM yet** (the CRM push node is removed; can be added later). |

---

## 1. Goal & scope

Give the new business the **same proven automation** Outbound Travelers runs today:

- **Instagram DMs** → ManyChat (dumb pipe) → n8n → OpenAI (silent field-extractor) → **scripted** replies → Google Sheet.
- **Facebook Messenger** → same ManyChat + same n8n workflow, channel-aware.
- **WhatsApp** → direct Meta Cloud API (no ManyChat) → its own n8n workflow → Google Sheet.

**In scope**
- 1 Instagram account, 1 Facebook page, 1 WhatsApp Business number.
- Two n8n workflows (A: IG+FB via ManyChat, B: WhatsApp via Meta Cloud API).
- The 4-field scripted "Rahul-style" capture flow + Yes/No quick-assistance button.
- Google Sheet lead capture (one workbook, per-channel tabs).
- Full rebrand: persona name, business name, city, greeting, destinations, working hours, handoff number.

**Out of scope (for v1)**
- CRM / Workpex push (deferred — sheet only).
- Auto re-engagement / broadcasts, paid-ads routing, round-robin assignment.
- Any change to the *original* Outbound Travelers bots (this is a separate stack; do not touch them).

---

## 2. Business profile — **YOU FILL THIS IN** ⏳

Everything the rebrand needs. Nothing here exists yet, so these are the inputs to gather first.

| Field | Value (fill in) | Used where |
|---|---|---|
| Business name | `______` | System prompt, greeting, sheet |
| City / region | `______` | System prompt |
| Persona / agent name (e.g. "Rahul") | `______` | System prompt, greeting |
| Primary destinations / niche | `______` | System prompt tone |
| Exact greeting line | `"Hi, this is <name> from <business>. Thank you for contacting us. May I know which destination you are looking for?"` | System prompt |
| Instagram handle | `______` | ManyChat connection |
| Facebook page name | `______` | ManyChat connection |
| WhatsApp Business display number | `+91 __________` | WhatsApp bot + handoff link |
| Working hours | `Mon–Sat __:__–__:__ IST, Sun closed` (default: copy 9:00–17:30) | Button handler |
| Reply language | Simple English only (default), or add another | System prompt top rule |
| Folder slug for this business | `accounts/______/` | Repo layout |

> Fields to collect from **customers** stay the same as the original: **destination → travel_date → pax → whatsapp_number**, then the Yes/No quick-assistance button. (No `name`/`budget` — matches the current live flow.)

---

## 3. Architecture (identical design, isolated instance)

```
INSTAGRAM DM / FACEBOOK MESSENGER              WHATSAPP MESSAGE
        │                                             │
        ▼                                             ▼
   ManyChat (Default Reply → External Request)   Meta Cloud API (webhook)
        │  msg + known fields + channel               │  messages[0].from / text / button
        ▼                                             ▼
   n8n Workflow A  (webhook: <newbiz>-ig)        n8n Workflow B  (webhook: <newbiz>-wa)
        │                                             │
        ├─ Normalize input                            ├─ Normalize input (guards status callbacks)
        ├─ Claim lock  (dedup: burst DMs)             ├─ OpenAI (silent extractor, JSON mode)
        ├─ OpenAI (silent extractor, JSON mode)       ├─ Parse + validate (scripted reply)
        ├─ Parse + validate (scripted reply)          ├─ Read lead / Save lead (Sheet)
        ├─ Read lock → Winner? (drop losers)          └─ Send reply (Meta Graph API, async)
        ├─ Respond to Webhook (fast, <5s)
        ├─ Send reply (ManyChat /fb/ endpoint)
        └─ Lookup → Save lead (Sheet, after reply)
        │
        ▼
   Google Sheet (NEW workbook — own tabs: instagram / facebook / whatsapp)
```

Key design invariants copied verbatim (do **not** re-invent):
- **AI is a silent field-extractor.** It returns JSON only; every customer-facing reply is scripted in code (`parse_validate.js` / `button_handler.js`). The agent cannot improvise.
- **Reply first, persist second.** ManyChat times out ~10s, so Respond-to-Webhook fires before the Sheet write.
- **Dedup lock** (IG/FB): burst DMs run as parallel n8n executions; the sheet row's lock cell (`assigned_to`) settles to one winner; losers return `reply:"PENDING"` so ManyChat's gate drops them.
- **Time-based memory:** a returning lead continues within **48h**; after 48h idle the next message restarts at the greeting. Simple Memory session key = per-conversation epoch (`first_contact_ts`).
- **WhatsApp specifics:** phone auto-captured from `messages[0].from` (never asked → 3 questions instead of 4); Yes/No is a real interactive button (`interactive.button_reply`); status/delivery callbacks are guarded out early.

---

## 4. Prerequisites — account & credential setup checklist (Step 1, since nothing exists)

⚠️ **Lead time:** the WhatsApp/Meta path (business verification, number approval, display-name review) can take **several days**. Start this first.

### 4A. Meta / Facebook (owner + Claude assists with docs)
- [ ] Create a **Meta Business Manager** (business.facebook.com) for the new business.
- [ ] Create the **Facebook Page**.
- [ ] Create an **Instagram professional/business account**, linked to that Page.
- [ ] Create a **Meta developer app** (developers.facebook.com) with **WhatsApp** + **Messenger/Instagram** products.
- [ ] Under WhatsApp: create a **WhatsApp Business Account (WABA)**, add the **phone number** (must NOT already be on WhatsApp), get **display name** approved, complete **business verification**.
- [ ] Generate a **permanent System User token** (not the 24h temp token) with `whatsapp_business_messaging` scope.
- [ ] Note the **`phone_number_id`** (for the Graph API send URL).

### 4B. ManyChat (owner)
- [ ] New **ManyChat account/workspace** on a **Pro plan** (External Request / API needs Pro).
- [ ] Connect the new **Instagram** account and **Facebook** page.
- [ ] Create Custom User Fields: `destination`, `normalized_destination`, `travel_date`, `pax`, `whatsapp_number`, `quick_assistance`, `bot reply`. (`ig_user_id` / `ig_username` / `channel` come from ManyChat/system.)
- [ ] Build the **Default Reply → External Request** to Workflow A's webhook, with the PENDING gate — **keep UNPUBLISHED** until go-live. (Copy exactly from `docs/manychat-setup.md`.)
- [ ] Copy the ManyChat **Settings → API** token (for the n8n Send credential).

### 4C. n8n (Claude builds; owner provisions)
- [ ] **Decide the isolation level** (see §8 Open decision D1): a fully separate n8n instance/VPS, **or** a separate **n8n Project** on the existing server with all-new credentials. Recommendation below.
- [ ] Create three fresh credentials scoped to this business:
  - **OpenAI** (own API key / billing — see 4E),
  - **Google Sheets OAuth2** (own Google account — see 4D),
  - **ManyChat API** (token from 4B).
- [ ] Import/build **Workflow A** (IG+FB) and **Workflow B** (WhatsApp). Keep **inactive** until go-live.
- [ ] For WhatsApp: set the permanent Meta token inline in the `Send reply (Meta API)` node's Authorization header (redact in any committed JSON).
- [ ] Set both workflows' **Error workflow** to a new error-alert workflow (optional but recommended).

### 4D. Google (owner)
- [ ] Create a **new Google account/Sheet** for this business's leads (keeps it separate from Outbound).
- [ ] Create the workbook + tabs per §5 with exact headers in row 1.
- [ ] Share the sheet (Editor) with the Google account behind the n8n Google Sheets credential.

### 4E. OpenAI (owner)
- [ ] Separate **OpenAI API key** with its own billing (isolation requirement). Model `gpt-4o-mini`, JSON mode, temp 0.35 (same as current).

---

## 5. Google Sheet schema (leads store)

One new workbook, one tab per channel (or a single tab with a `channel` column). Row 1 headers, exact order:

**IG + Facebook tab (`instagram` / `facebook`) — 14 cols**
```
ig_user_id | ig_username | destination | normalized_destination | travel_date | pax |
whatsapp_number | status | quick_assistance | first_contact_ts | last_update_ts |
assigned_to | notes - AI | channel
```

**WhatsApp tab (`whatsapp`) — 13 cols** (no `channel`)
```
ig_user_id | ig_username | destination | normalized_destination | travel_date | pax |
whatsapp_number | status | quick_assistance | first_contact_ts | last_update_ts |
assigned_to | notes - AI
```

- **Match key = `ig_user_id`** (Append-or-Update). On WhatsApp, `ig_user_id` stores the raw sender phone (`messages[0].from`), and `whatsapp_number` holds the display value `+91 xxxxx xxxxx`.
- `status`: `new → in_progress → qualified` (flips to qualified when destination+travel_date+pax+whatsapp_number all filled).
- `quick_assistance`: `yes` / `no` / empty — set after the button tap. **No CRM push in v1** — the Yes branch just tags the sheet and replies (working-hours aware).
- `assigned_to` currently doubles as the dedup-lock cell; leave it for the lock. Timestamps in IST `YYYY-MM-DD HH:MM:SS`.

---

## 6. The two workflows to build

Both are clones of the live Outbound workflows (`AfmPZXhWMetbxHTl` for IG, `qx4PSZuDK6b6Q642` for WhatsApp) with rebranded content and new IDs/creds. The shared code (`shared/workflow-code/normalize.js`, `parse_validate.js`, `button_handler.js`) is **reused unchanged except for the config constants** (see §7).

**Workflow A — `<newbiz> · IG + FB Chat & Capture`** (channel-aware)
`Webhook (POST, path <newbiz>-ig)` → `Normalize input` → `Claim lock (Sheet)` → `OpenAI (JSON)` → `Parse + validate` → `Read lock (Sheet)` → `Winner? (IF)` → `Respond to Webhook` → `Send reply (ManyChat /fb/)` → `Lookup existing` → `Save lead (Sheet)`. Button taps route through `Button handler` (working-hours logic).

**Workflow B — `<newbiz> · WhatsApp Chat & Capture`** (direct Meta)
`Webhook (POST, path <newbiz>-wa)` → `Normalize input (guard status callbacks)` → `OpenAI (JSON)` → `Parse + validate` → `Read lead / Lookup` → `Save lead (Sheet)` → `Send reply (Meta Graph API, async)`. 3-field script (phone auto-captured); Yes/No via interactive button.

Build method: use the n8n-mcp tools per the existing conventions (validate every node, `validate_workflow` clean before activating). Keep both **inactive** until §9 go-live.

---

## 7. Rebrand checklist — what changes vs the original

**Changes (per new business):**
- **System prompt** (`shared/prompts/system_prompt.md` → new copy): persona name, business name, city, the exact greeting line, destination flavour, working-hours text.
- **Working hours** in `button_handler.js` config (default: copy Mon–Sat 9:00–17:30, Sun closed).
- **Sheet IDs / tab names** in all Sheets nodes (Lookup, Claim lock, Read lock, Save lead).
- **Webhook paths**: `<newbiz>-ig`, `<newbiz>-wa`.
- **Credentials**: new OpenAI, Google Sheets, ManyChat creds; new inline Meta WA token + `phone_number_id`.
- **Handoff number**: the new `+91` WhatsApp number and its `wa.me/…` link.
- **CRM push node: REMOVED** (v1 has no CRM). The Yes branch ends after tagging `quick_assistance=yes` + reply.
- **Source tag** (if any logging retained): `instagram_<newbiz>` etc.

**Stays identical (do NOT edit the logic):**
- Silent-extractor design, JSON output contract, parse/validate scripting, dedup lock, 48h memory, PENDING gate, reply-first ordering, WhatsApp status-callback guard, interactive-button parsing.

---

## 8. Repo layout for the new business

```
accounts/<newbiz>/
  account.md                     ← IDs, creds, webhook paths (like existing account.md files)
  chat-and-capture.workflow.json ← Workflow A reference export
  chat-and-capture-whatsapp.workflow.json ← Workflow B reference export
  manychat-setup.md              ← rebranded ManyChat steps
  meta-whatsapp-setup.md         ← rebranded Meta Cloud API steps
shared/prompts/system_prompt_<newbiz>.md   ← rebranded prompt (or per-account copy)
```
Shared code stays in `shared/workflow-code/` (reused). The system prompt is per-business.

---

## 9. Build phases / milestones

- **Phase 0 — Inputs & accounts (owner):** fill §2 profile; complete §4 checklist (Meta verification is the long pole — start now).
- **Phase 1 — n8n workflows (Claude):** build A + B, rebranded, validated, **inactive**. Create the new Sheet + tabs.
- **Phase 2 — Channel wiring (owner + Claude docs):** ManyChat Default Reply (unpublished) + Meta webhook verification.
- **Phase 3 — Test:** fake-payload tests, then real DMs/messages in each channel; confirm half-finished lead still writes `in_progress`; confirm 48h memory; confirm working-hours button replies.
- **Phase 4 — Go-live:** publish ManyChat Default Reply → activate both n8n workflows → send one test message per channel → confirm rows land.

---

## 10. Open decisions ⏳

- **D1 — n8n isolation level.** "Fully separate" can mean: (a) a **brand-new n8n instance on its own VPS** (strongest isolation, best if handing the client their own login; ~extra hosting cost), or (b) a **separate n8n Project on the existing server** with all-new credentials + own OpenAI/Google/Meta accounts (isolated data & billing, no new server). **Recommendation: (b)** unless the client needs their own server login — then (a). *Need your call.*
- **D2 — Single workbook vs per-business file.** Recommend one **new** workbook for this business with per-channel tabs.
- **D3 — Business profile values (§2).** Blocking for the prompt rebrand.
- **D4 — CRM later?** v1 is sheet-only; confirm CRM (Workpex or theirs) is a Phase-5, not now.

---

## 11. Definition of done

- [ ] New IG + FB + WhatsApp all connected on the new business's own accounts.
- [ ] Workflow A (IG+FB) and B (WhatsApp) deployed, validated clean, active.
- [ ] First message from a new user creates a Sheet row immediately; abandoned chat leaves an `in_progress` row.
- [ ] Bot follows the exact scripted flow, rebranded; never re-asks a known field; 48h memory works.
- [ ] WhatsApp phone auto-captured; Yes/No button works and is working-hours aware.
- [ ] Leads land in the **new** workbook, fully separate from Outbound Travelers.
- [ ] No secrets committed (Meta token, API keys redacted in repo; live values only in n8n).
- [ ] Original Outbound Travelers bots untouched and still working.
```
