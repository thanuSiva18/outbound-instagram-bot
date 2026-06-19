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

## Repo layout
| path | what |
|------|------|
| `workflow/chat-and-capture.workflow.json` | **importable export of the live workflow** (synced from n8n 2026-06-19). OpenAI credential id is a placeholder — set it after import. |
| `prompts/system_prompt.md` | the conversation brain — readable copy of the prompt embedded in `Normalize input` |
| `workflow/code/normalize.js` | Normalize Code node — builds known fields + the full system prompt |
| `workflow/code/parse_validate.js` | Parse Code node — JSON parse, phone validate, merge, status, graceful AI-failure fallback |
| `docs/google-sheet-schema.md` | new-sheet columns + Sheet ID request |
| `docs/n8n-credentials-checklist.md` | OpenAI + Google OAuth creds to create in n8n |
| `docs/manychat-setup.md` | manual ManyChat wiring steps for Faheem |

## Re-deploying / restoring the workflow
1. In n8n: **Workflows → Import from File →** `workflow/chat-and-capture.workflow.json`.
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
- [x] Google Sheet ID + tab name confirmed (`1T89p6…JJio`, tab `leads`)
- [x] Workflow built, validated, deployed (n8n id `AfmPZXhWMetbxHTl`) — **live**
- [x] Error-output resilience added (no more repeat-loop on AI failure)
- [x] Repo synced from live workflow (2026-06-19)
- [ ] ManyChat wired + end-to-end Tamil/Tanglish/English test

## Secrets
Never commit secrets (see CLAUDE.md §11). They live in Claude Code's MCP config
(`N8N_MCP_TOKEN`) and n8n's credential store (OpenAI key, Google OAuth) only.
The MCP token was shared in plaintext during planning — **regenerate before go-live**.
