# Outbound Travelers · Instagram Lead-Capture Bot (n8n)

An n8n workflow that turns Instagram DMs into a human-feeling AI travel consultant
which naturally collects 5 fields over a conversation and saves them to Google Sheets
— **zero leads lost**, even half-finished ones.

> Full build brief: [`CLAUDE.md`](./CLAUDE%20(2).md). Read it before changing anything.

## Pipeline (live as of 2026-06-19)
```
Instagram DM → ManyChat (Default Reply, fires on EVERY msg) → n8n Webhook
  → Lookup existing lead (Google Sheets) → Normalize (builds system prompt + known fields)
  → AI Agent (OpenAI Chat Model gpt-4o-mini, JSON mode + Simple Memory)
  → Parse+validate → Respond to Webhook (fast)
  → Is lead? → Save lead (Append-or-Update, key: ig_user_id)
  → Newly qualified? → Push to CRM (Workpex)
```
- **ManyChat** = dumb pipe + per-user field storage. No conversation logic.
- **n8n** = orchestrator. **OpenAI (AI Agent)** = the brain. **Google Sheets** = the store.
- **Memory** = 3 layers: Simple Memory (recent turns) + known fields (sheet + ManyChat) + a running `notes - AI` summary column. The bot can't blank out.
- **Resilience:** the AI Agent has an error output wired into Parse — if OpenAI fails (quota/outage), the webhook still replies with a polite "our team will get back to you shortly" instead of crashing. This is what prevents the ManyChat repeat-loop.

> ⚠️ The live workflow uses an **AI Agent** node (not a bare OpenAI call) and builds the
> full system prompt inside `Normalize input`. Older drafts of this repo described a
> simpler design — **trust `workflow/chat-and-capture.workflow.json` and the live n8n
> workflow, not any older description.**

## The 5 fields
`name`, `whatsapp_number` (10-digit Indian), `destination`, `pax`, `budget` (per-person/total).

## Repo layout (multi-account)
**One shared brain, many Instagram accounts.** Shared logic lives once in `shared/`;
everything that differs per IG account lives in `accounts/<name>/account.md`.

```
shared/
  prompts/system_prompt.md            # the conversation brain (readable copy of the Normalize prompt)
  workflow-code/normalize.js          # Normalize Code node — known fields + full system prompt
  workflow-code/parse_validate.js     # Parse Code node — JSON parse, phone validate, merge, status, AI-failure fallback
accounts/
  outbound-travelers-main/            # MAIN @outboundtravelers page — AI bot mO9gd0VJISdzlB5x (migrating; page still on "My workflow")
    account.md                        # this account's IG / n8n / sheet / credential ids
    GO-LIVE-RUNBOOK.md                # migration plan + cutover order
    manychat-setup.md                 # ManyChat wiring for this account
  outbound-travelers-in/              # the .in page — LIVE AI bot AfmPZXhWMetbxHTl
    account.md
    chat-and-capture.workflow.json    # human-readable reference (canonical = live n8n)
  outbound-travelers-whatsapp/        # WhatsApp Cloud API (no ManyChat) — LIVE AI bot qx4PSZuDK6b6Q642
    account.md
    chat-and-capture-whatsapp.workflow.json   # restore reference (Meta token redacted)
    meta-whatsapp-setup.md            # Meta Cloud API webhook + credential setup
docs/                                 # shared reference (sheet schema, manychat, crm, creds)
```

| path | what |
|------|------|
| `shared/` | the brain + code, identical across all accounts |
| `accounts/<name>/account.md` | per-account config: IG handle, n8n workflow id, webhook path, sheet id, credential ids |
| `accounts/<name>/chat-and-capture.workflow.json` | reference snapshot of that account's workflow |
| `docs/google-sheet-schema.md` | leads-sheet columns + Sheet ID |
| `docs/manychat-setup.md` | ManyChat wiring steps (applied per account) |
| `docs/crm-integration-contract.md` | bot → CRM push contract |
| `docs/n8n-credentials-checklist.md` | OpenAI + Google OAuth creds to create in n8n |

> **Adding another IG account (same business)?** Duplicate the n8n workflow, give it a
> **unique webhook path** + its **own ManyChat credential** + its **own sheet**, reuse the
> shared OpenAI/Google creds, then drop an `account.md` under `accounts/<new>/`.
> Template: [`accounts/outbound-travelers-in/account.md`](accounts/outbound-travelers-in/account.md).

## Re-deploying / restoring the workflow
1. In n8n: **Workflows → Import from File →** `accounts/<name>/chat-and-capture.workflow.json`.
2. Open **OpenAI Chat Model** + the two Google Sheets nodes and pick your credentials
   (the OpenAI cred id is intentionally a placeholder — no secrets are committed).
3. Activate.
> This JSON is a **human-readable restore reference** kept in sync by hand. For a
> guaranteed byte-perfect backup at any moment, use n8n's own **workflow → Download**.

## Config (live)
- **LLM:** OpenAI `gpt-4o-mini`, JSON response mode, temperature 0.35 (via the AI Agent's OpenAI Chat Model). Switched from gpt-4o on 2026-06-19 to cut cost ~16×.
- **Sheet:** Google Sheet ID `1T89p6LhpjwNJ_kqh5WT6DAj3Jt242Gs1JaTNzDCJJio`, tab `leads` (file: "Testing new bot").
- **n8n instance:** `https://n8n.srv1159219.hstgr.cloud`
- **Credentials:** OpenAI (API key — automatable) + Google Sheets OAuth2 (needs your browser authorize). Secrets live in n8n's credential store only.

## Status
- [x] Repo + offline artifacts (prompt, code nodes, docs)
- [x] OpenAI + Google Sheets credentials created in n8n
- [x] `.in` sheet confirmed (`1T89p6…JJio`, tab `leads`)
- [x] Main sheet provided (`19qt6m…va5IuY`, tab `leads`) — confirm headers/share
- [x] `.in` workflow built, validated, deployed (`AfmPZXhWMetbxHTl`) — **live**
- [x] Main workflow built, validated (`mO9gd0VJISdzlB5x`) — **inactive** until go-live
- [x] Async reply + burst dedup (Claim lock / Read lock / Winner? / Send reply)
- [x] Repo synced from live workflows (2026-06-29)
- [x] **WhatsApp Cloud API bot** built, fixed & live (`qx4PSZuDK6b6Q642`) — direct Meta integration, no ManyChat,
  3-field auto-phone Rahul flow, interactive Yes/No button (2026-06-30). See `accounts/outbound-travelers-whatsapp/`.
- [ ] Main + Messenger ManyChat wiring + end-to-end test
- [ ] WhatsApp: live-confirm Yes→CRM push from a real handset; move Meta token to an n8n credential

## Secrets
Never commit secrets (see CLAUDE.md §11). They live in Claude Code's MCP config
(`N8N_MCP_TOKEN`) and n8n's credential store (OpenAI key, Google OAuth) only.
The MCP token was shared in plaintext during planning — **regenerate before go-live**.
