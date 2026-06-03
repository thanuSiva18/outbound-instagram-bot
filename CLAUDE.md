# CLAUDE.md — Outbound Travelers · Instagram Lead-Capture Bot (n8n)

> This file is the original **build brief** for Claude Code — kept for history and rationale.
> When something here is marked **[CONFIRM]**, ask Faheem before building — do not assume.
>
> ⚠️ **For the current, reconciled state of the project (live flow IDs, credentials,
> sheet schema, status), see [PROJECT.md](./PROJECT.md) — that is the source of truth.**
> Where this brief and PROJECT.md disagree (e.g. this says default `gpt-4o`; the build
> shipped `gpt-4o-mini`; the persona is now Rahul/Harshita, not "Priya"), PROJECT.md wins.

---

## 1. Mission

Build an n8n workflow that turns Outbound Travelers' Instagram DMs into a
**human-feeling AI travel consultant** that naturally collects 5 fields over a
conversation and saves them to Google Sheets — with **zero leads lost**, even
half-finished ones.

The 5 fields to collect:

| field             | notes                                             |
|-------------------|---------------------------------------------------|
| `name`            | the lead's name                                   |
| `whatsapp_number` | 10-digit Indian mobile (strip +91 / spaces)       |
| `destination`     | target destination (Thailand, Bali, Malaysia…)    |
| `pax`             | number of people travelling                       |
| `budget`          | per-person or total — capture which               |

**The hard requirement that everything else serves:** it must feel like a real
agent, not a form. No button menus, no rigid step-by-step flow. The LLM drives
the conversation.

---

## 2. Critical design principle (read this twice)

**Do NOT build this as a ManyChat quick-reply / button flow.** That is the #1
reason bots feel robotic. Instead:

- **ManyChat** = dumb pipe to Instagram DMs + storage of current field values in
  Custom User Fields. It runs **no conversation logic**.
- **n8n** = the orchestrator (the brain's body).
- **OpenAI** = the brain. It reads each message, decides the natural reply, AND
  extracts whatever fields the user volunteered.
- **Google Sheets** = the store.

The "memory" between messages is the **extracted fields**, not the full
transcript. This keeps the system stateless and cheap. The LLM is told what's
already known and only ever asks for the gaps.

---

## 3. Background context (why some choices are non-negotiable)

- Audience: Tier-2/3 South Indian families, **Tamil Nadu**. Peak DM activity
  **9 PM–1 AM**. They speak **Tamil, Tanglish, and English** — the bot must
  match the user's language automatically.
- Leads are **organic** (Instagram), so intent is higher and decay is slower
  than paid — but brand-trust expectations are higher. The tone must be warm
  and premium, never pushy.
- A previous stack (ManyChat → Google Sheets) had a **capture gap**: the webhook
  fired only on *flow completion*, so stalled conversations vanished and had to
  be manually rescued. **This build must fix that** by firing on *every* message
  and writing/updating the row from the very first message.

---

## 4. Tools you (Claude Code) have

### 4.0 Repos & one-time setup (do this first)

This build leans on two open-source projects by czlonkowski. Set up **both**
before building — the skills depend on the MCP being connected.

| repo | what it is | URL |
|------|-----------|-----|
| **n8n-mcp** | MCP server: node docs, validation, 2,700+ templates, and direct deploy to the n8n instance | https://github.com/czlonkowski/n8n-mcp |
| **n8n-skills** | 7 Claude Code skills that auto-activate to build n8n workflows *correctly* using n8n-mcp | https://github.com/czlonkowski/n8n-skills |

**Step 1 — connect n8n-mcp to Claude Code.**
The team has already deployed a remote n8n-mcp endpoint on their Hostinger VPS.
Add it as an HTTP MCP server (token comes from the env var — see §11, never paste
it into a file):

```bash
claude mcp add --transport http n8n-mcp \
  https://n8n.srv1159219.hstgr.cloud/mcp-server/http \
  --header "Authorization: Bearer ${N8N_MCP_TOKEN}"
```

Then **verify** what you actually got: list the MCP tools and run
`tools_documentation()` / `n8n_health_check`. You should see `search_nodes`,
`get_node`, `validate_workflow`, and the `n8n_*` management tools. If you only
see doc tools and no `n8n_create_workflow`, the instance API key isn't wired in —
tell Faheem (see §10, item 5).

> Fallback if the remote endpoint misbehaves: run n8n-mcp locally with
> `npx n8n-mcp` and the instance's `N8N_API_URL` + `N8N_API_KEY` set, per the repo
> README. Same tools, just hosted locally.

**Step 2 — install the n8n-skills plugin.** In Claude Code:

```
/plugin install czlonkowski/n8n-skills
```

(Or marketplace: `/plugin marketplace add czlonkowski/n8n-skills` → `/plugin install`.
Or manual: `git clone` the repo and `cp -r n8n-skills/skills/* ~/.claude/skills/`,
then reload.) The 7 skills then activate automatically when relevant.

**Use the skills.** They fire on their own, but lean on them deliberately:
- *n8n MCP Tools Expert* (highest priority) — correct tool usage + param formats.
- *n8n Workflow Patterns* — start from the **webhook-processing** pattern; ours is
  exactly that shape.
- *n8n Node Configuration* — property dependencies (e.g. `sendBody → contentType`).
- *n8n Validation Expert* — to break out of validation error loops.
- *n8n Code JavaScript* — for the Normalize and Parse nodes.
- *n8n Expression Syntax* — for `{{ }}` mappings.

**Three gotchas the skills surface that bite *this* build specifically:**
- ⚠️ **Webhook payload lives under `$json.body`**, not `$json`. Our Normalize and
  Parse Code nodes read the ManyChat fields from `$json.body.*`. Get this wrong and
  every field reads empty.
- Code node return format must be `[{ json: { ... } }]`.
- For the MCP tools, nodeType uses the `nodes-base.*` short form (e.g.
  `nodes-base.webhook`), while the workflow JSON uses `n8n-nodes-base.*`.

---

### n8n-mcp (czlonkowski) — your primary build tool
Connected via MCP. It gives you:
- Node documentation, property schemas, real-world config examples
- A library of 2,700+ workflow templates
- Node + workflow **validation**
- (If the n8n API key is configured) **direct deploy** to the live n8n instance:
  `n8n_create_workflow`, `n8n_update_partial_workflow`, `n8n_validate_workflow`,
  `n8n_autofix_workflow`, `n8n_test_workflow`, etc.

**Follow the n8n-mcp working method exactly:**
1. Start with `tools_documentation()`.
2. **Templates first** — `search_templates` before building from scratch
   (e.g. `searchMode:'by_task'`, `task:'webhook_processing'`; or by node type
   for webhook / Google Sheets / OpenAI). If you use a template, **attribute the
   author** (name, @username, n8n.io link) as the tool requires.
3. Node discovery: `search_nodes({query, includeExamples:true})`.
4. Configure with `get_node({detail:'standard', includeExamples:true})`.
   **Never trust default parameter values** — explicitly set every parameter
   that controls behaviour. Defaults are the #1 cause of runtime failures.
5. Validate: `validate_node(mode:'minimal')` → `validate_node(mode:'full', profile:'runtime')`
   → `validate_workflow`. Fix ALL errors before deploying.
6. Deploy (if API configured): `n8n_create_workflow` → `n8n_validate_workflow({id})`
   → `n8n_autofix_workflow({id})` if needed → `n8n_test_workflow`.

**Two syntax gotchas the tool author flags (do not get these wrong):**
- `addConnection` takes **four separate string params**: `source`, `target`,
  `sourcePort:"main"`, `targetPort:"main"`. Not an object, not a combined string.
- IF nodes have two outputs — set `branch:"true"` / `branch:"false"` on the
  connection or both branches collide.

### n8n-skills (czlonkowski)
Installed in §4.0. These 7 skills are not optional for this build — they encode
the correct way to drive n8n-mcp. Let them activate and follow them.

### Standard tooling
Bash, file editing, etc. for any glue scripts, the system-prompt file, and docs.

---

## 5. Architecture — single message lifecycle

```
Instagram DM
   │
   ▼
ManyChat  (Default Reply → External Request, fires on EVERY message)
   │   sends: message_text, ig_user_id, ig_username, + all known field values
   ▼
n8n Webhook (POST)
   │
   ▼
Normalize input  (Set/Code node: pull message + known fields into clean JSON)
   │
   ▼
OpenAI  (Chat model, JSON response mode)
   │   in:  system prompt + KNOWN fields + new user message
   │   out: { reply, fields:{...}, status }
   ▼
Parse + validate  (Code node: parse JSON safely, validate whatsapp_number)
   │
   ▼
Respond to Webhook  ◄── send reply + updated fields back to ManyChat  (FAST, <5s)
   │
   ▼  (AFTER responding — so we never block the reply)
Google Sheets — Append or Update  (key: ig_user_id)
```

Why the Sheets write happens **after** Respond-to-Webhook: ManyChat's External
Request times out at ~10s. Reply first, persist second.

ManyChat then writes the returned field values back into its Custom User Fields,
so the next message carries updated "known" state. That is the entire memory
mechanism — no database needed.

---

## 6. Google Sheet schema

One sheet, these columns (create them exactly, in this order):

```
ig_user_id | ig_username | name | whatsapp_number | destination | pax | budget | status | first_contact_ts | last_update_ts | assigned_to
```

- **Match key for Append-or-Update:** `ig_user_id`. First message creates the
  row; every later message updates the same row. No lead is ever lost.
- `status`: `new` → `in_progress` → `qualified`. Flip to `qualified` only when
  all 5 fields are filled. **That flip is the handoff trigger** into the existing
  CRM round-robin / Tele Sales — keep it clean so downstream automation can read it.
- `assigned_to`: leave blank; routing fills it later (out of scope for v1).
- Timestamps in IST.

---

## 7. The conversation brain (the core asset)

Store the system prompt as a file in the repo (`prompts/system_prompt.md`) and
load it into the OpenAI node — don't bury it inside a node's UI only. Use
**OpenAI JSON response mode** so parsing never breaks.

Starting system prompt (refine with Faheem after first live tests):

```
You are a warm, friendly travel consultant for Outbound Travelers, a premium
travel agency in Tamil Nadu, South India, specializing in Thailand, Bali,
Malaysia and Singapore. You chat on Instagram DM like a real human agent —
relaxed, warm, helpful, never robotic, never salesy.

LANGUAGE: Reply in the user's language. If they write Tamil, reply Tamil; if
Tanglish, reply Tanglish; if English, reply English. Match their energy.

GOAL: Over a natural conversation, collect these 5 things:
- name
- whatsapp_number (10-digit Indian mobile)
- destination
- pax (number of travellers)
- budget (note whether per-person or total)

RULES:
- You are given KNOWN fields below. NEVER ask for anything already known.
- Ask for at most 1–2 missing fields per message. Keep it light.
- Extract anything the user volunteers, even if you didn't ask for it.
  (e.g. "Bali with my family, 4 of us in December" → destination + pax now.)
- If budget is vague, gently offer a range to anchor them. Never pressure.
- Stay strictly on travel. Politely deflect anything off-topic.
- When all 5 are collected, warmly confirm the details back and tell them a
  travel expert will call them on WhatsApp shortly.

KNOWN SO FAR: {{ known_fields_json }}
USER MESSAGE: {{ user_message }}

Respond with ONLY a JSON object, no markdown, no preamble:
{
  "reply": "<the natural message to send to the user>",
  "fields": {
    "name": "",
    "whatsapp_number": "",
    "destination": "",
    "pax": "",
    "budget": ""
  },
  "status": "new | in_progress | qualified"
}
```

Rules for the Parse/validate node:
- Strip any stray ```json fences before `JSON.parse`; wrap in try/catch.
- `whatsapp_number`: strip `+91`, spaces, dashes; expect exactly 10 digits.
  If it's junk, keep the field empty so the bot re-asks once, naturally.
- Merge new non-empty fields over the known fields (don't overwrite a known
  value with an empty string).
- Compute `status`: all 5 present → `qualified`; some present → `in_progress`;
  none → `new`.

---

## 8. Build order (phases)

**Phase 0 — Setup & confirm**
- Confirm the **[CONFIRM]** items in §10 with Faheem.
- Run `n8n_health_check` to confirm the n8n API connection works.
- Confirm the OpenAI credential and Google Sheets OAuth credential already exist
  **inside n8n** (you cannot create OAuth creds from here — Faheem does this in
  the n8n UI). If missing, list exactly what's needed and pause.

**Phase 1 — Core workflow in n8n**
1. Webhook (POST) → 2. Normalize (Set/Code) → 3. OpenAI (JSON mode) →
4. Parse+validate (Code) → 5. Respond to Webhook → 6. Sheets Append-or-Update.
- Validate at every step. Deploy. Test with `n8n_test_workflow` using fake
  payloads covering the §9 edge cases.

**Phase 2 — ManyChat wiring (manual, Faheem + you write the exact steps)**
You cannot configure ManyChat from here (it's a separate web product). Produce a
short step list for Faheem:
- Connect the Instagram account.
- Create 6 Custom User Fields matching the field names + `ig_user_id`.
- Set **Default Reply** (not a keyword flow) → External Request → the n8n webhook
  URL. Map the JSON response: send back `reply` as the IG message and write
  `fields` into the Custom User Fields.
- Confirm the External Request sends `message_text`, `ig_user_id`, `ig_username`,
  and all current field values on every message.

**Phase 3 — End-to-end test + prompt tuning**
- Real DM tests in Tamil, Tanglish, English. Tune the system prompt.
- Confirm a half-finished conversation still produces a row with `in_progress`.

**Out of scope for v1 (note as Phase 4 ideas, don't build yet):**
auto-WhatsApp message on qualify, CRM round-robin assignment, dormant-lead
re-engagement broadcasts.

---

## 9. Edge cases the build MUST handle

- **Half-finished lead** → row exists with `status:in_progress`. (This is the
  whole point — the old stack failed here.)
- **User volunteers everything in message 1** → all fields captured at once,
  bot confirms instead of interrogating.
- **Junk / partial WhatsApp number** → field stays empty, bot re-asks once.
- **Off-topic message** → polite deflect, stay on travel.
- **Same user returns later** → matches existing row by `ig_user_id`, updates it.
- **OpenAI returns malformed JSON** → try/catch; send a safe generic reply,
  don't crash the workflow.
- **ManyChat 24-hour messaging window**: you cannot freely re-message a lead who
  went quiet >24h. Do NOT try to solve re-engagement here — that belongs to the
  Tele Sales / broadcast layer (Phase 4).

---

## 10. [CONFIRM] before building — ask Faheem

1. **LLM choice:** default plan is OpenAI **gpt-4o** (best Tamil/Tanglish).
   OK, or use **gpt-4o-mini** to cut cost, or test the Anthropic API instead?
2. **Replace vs parallel:** this replaces the old ManyChat→Sheets capture, right?
   (Assumed yes.)
3. **Google Sheet:** new sheet, or an existing sheet/tab? Need the sheet ID + tab.
4. **Credentials in n8n:** are the **OpenAI** and **Google Sheets** credentials
   already created in this n8n instance? (Can't be done from Claude Code.)
5. **MCP endpoint sanity check:** confirm which MCP is connected — the czlonkowski
   n8n-mcp (docs+deploy) and/or the instance's own MCP server. List the tools you
   actually see before relying on them.
6. **v1 scope:** capture-to-Sheets + handoff only, no auto-WhatsApp yet —
   confirmed?

---

## 11. Credentials & security rules (strict)

- **Never** put the n8n MCP access token, OpenAI key, or any secret into this
  repo, the workflow JSON, or any committed file. They live in:
  - Claude Code's MCP config / environment (the MCP token), and
  - n8n's own credential store (OpenAI key, Google OAuth).
- Add a `.gitignore` covering `.env`, `*.token`, and any local secrets.
- Provide a `.env.example` with placeholder keys only — including
  `N8N_MCP_TOKEN=` (the value Claude Code reads when adding the MCP server in §4.0).
- **Note to Faheem:** the MCP access token was shared in plain text during
  planning — regenerate it in n8n before go-live, set the new value as
  `N8N_MCP_TOKEN` in your environment, and update the MCP config.

---

## 12. Definition of done

- [ ] Workflow deployed and active in n8n; `n8n_validate_workflow` passes clean.
- [ ] First message from a new IG user creates a Sheets row immediately.
- [ ] A conversation abandoned midway still leaves a complete row at
      `status:in_progress` (capture-gap fixed).
- [ ] Bot replies in the user's language (Tamil / Tanglish / English).
- [ ] Bot never re-asks a known field; extracts volunteered info.
- [ ] All 5 fields filled → `status:qualified`, ready for handoff.
- [ ] WhatsApp number validated to 10 digits.
- [ ] Reply returns to ManyChat in under ~5s; Sheets write happens after.
- [ ] ManyChat setup steps documented for Faheem.
- [ ] No secrets in any file. MCP token flagged for regeneration.
```
