# Outbound Travelers · Instagram Lead-Capture Bot (n8n)

An n8n workflow that turns Instagram DMs into a human-feeling AI travel consultant
which naturally collects 5 fields over a conversation and saves them to Google Sheets
— **zero leads lost**, even half-finished ones.

> Full build brief: [`CLAUDE.md`](./CLAUDE%20(2).md). Read it before changing anything.

## Pipeline
```
Instagram DM → ManyChat (Default Reply, fires on EVERY msg) → n8n Webhook
  → Normalize → OpenAI (gpt-4o-mini, JSON mode) → Parse+validate
  → Respond to Webhook (fast, <5s) → Google Sheets (Append-or-Update, key: ig_user_id)
```
- **ManyChat** = dumb pipe + per-user field storage. No conversation logic.
- **n8n** = orchestrator. **OpenAI** = the brain. **Google Sheets** = the store.
- Memory between messages = the extracted fields (carried by ManyChat), not the transcript.

## The 5 fields
`name`, `whatsapp_number` (10-digit Indian), `destination`, `pax`, `budget` (per-person/total).

## Repo layout
| path | what |
|------|------|
| `prompts/system_prompt.md` | the conversation brain (loaded into the OpenAI node) |
| `workflow/code/normalize.js` | Normalize Code node — reads `$json.body.*` |
| `workflow/code/parse_validate.js` | Parse Code node — JSON parse, phone validate, merge, status |
| `docs/google-sheet-schema.md` | new-sheet columns + Sheet ID request |
| `docs/n8n-credentials-checklist.md` | OpenAI + Google OAuth creds to create in n8n |
| `docs/manychat-setup.md` | manual ManyChat wiring steps for Faheem |

## Config (decided)
- **LLM:** OpenAI `gpt-4o-mini`, JSON response mode.
- **Sheet:** new Google Sheet (schema in `docs/google-sheet-schema.md`).
- **Credentials:** created by Faheem in the n8n UI (not from here).

## Status / what's pending
- [x] Repo + offline artifacts (prompt, code nodes, docs)
- [ ] `N8N_MCP_TOKEN` set → connect n8n-mcp
- [ ] OpenAI + Google Sheets credentials created in n8n
- [ ] Google Sheet ID + tab name provided
- [ ] Workflow built, validated, deployed via n8n-mcp
- [ ] ManyChat wired (Faheem) + end-to-end Tamil/Tanglish/English test

## Secrets
Never commit secrets (see CLAUDE.md §11). They live in Claude Code's MCP config
(`N8N_MCP_TOKEN`) and n8n's credential store (OpenAI key, Google OAuth) only.
The MCP token was shared in plaintext during planning — **regenerate before go-live**.
