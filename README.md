# Outbound Travelers · Instagram Lead Bot (n8n)

An n8n automation that turns Instagram DMs into a human-feeling AI travel consultant.
It chats naturally, collects **5 lead fields** over the conversation, classifies intent,
and saves every lead to Google Sheets — **zero leads lost**, even half-finished ones.
A second scheduled flow re-nudges quiet, incomplete leads.

> **📖 The full A–Z source of truth is [PROJECT.md](./PROJECT.md)** — flows, nodes,
> credentials, sheet schema, business facts, status, everything. Start there.
> [CLAUDE.md](./CLAUDE.md) is the original build brief (history & rationale).

## Pipeline (Flow 1 — live)
```
Instagram DM → ManyChat (fires on EVERY msg) → n8n Webhook
  → Lookup existing lead (Sheets, by ig_user_id) → Normalize input
  → AI Agent (OpenAI gpt-4o-mini JSON + Simple Memory) → Parse + validate
  → Respond to Webhook (fast, <5s) → Is lead? (IF) → Save lead (append-or-update)
```
- **ManyChat** = dumb pipe · **n8n** = orchestrator · **OpenAI** = the brain · **Sheets** = store + memory.
- The bot classifies each DM as **travel_lead / office_info / career / customer_query**;
  only travel leads run the 5-field capture and write to the sheet.

## The 5 fields
`name` → `destination` → `pax` → `budget` (per-person/total) → `whatsapp_number` (10-digit Indian).
All 5 present → status `qualified` (the handoff trigger).

## Repo layout
| path | what |
|------|------|
| [PROJECT.md](./PROJECT.md) | **the master doc — read this first** |
| [CLAUDE.md](./CLAUDE.md) | original build brief |
| [prompts/system_prompt.md](prompts/system_prompt.md) | canonical conversation prompt (kept in sync with `normalize.js`) |
| [workflow/chat-and-capture/](workflow/chat-and-capture/) | Flow 1 Code nodes — `normalize.js`, `parse_validate.js` |
| [workflow/follow-up-nudges/](workflow/follow-up-nudges/) | Flow 2 Code node — `pick_due_nudges.js` |
| [docs/](docs/) | sheet schema, credentials, ManyChat setup, intent & nudge plans |

## Live config (see PROJECT.md for detail)
- **n8n instance:** `https://n8n.srv1159219.hstgr.cloud`
- **Flow 1** `Outbound IG Lead Bot — 1 · Chat & Capture` (`AfmPZXhWMetbxHTl`) — 🟢 active.
  Webhook: `https://n8n.srv1159219.hstgr.cloud/webhook/ig-lead-bot`
- **Flow 2** `Outbound IG Lead Bot — 2 · Follow-up Nudges` (`GfDTRO3xDyZIWdnu`) — ⚪ built, not yet on.
- **Sheet:** `1T89p6LhpjwNJ_kqh5WT6DAj3Jt242Gs1JaTNzDCJJio`, tab `leads`.

## Status (summary)
- ✅ Flow 1 deployed, active, 5/5 edge-case tests passed.
- ✅ Flow 2 built (scheduled), pending ManyChat token + sheet columns before go-live.
- ⏳ ManyChat wiring (Faheem) · real-DM prompt tuning · regenerate `N8N_MCP_TOKEN` before go-live.

See [PROJECT.md §14](./PROJECT.md#14-status--open-tasks) for the full task list.

## Secrets
Never commit secrets. They live in n8n's credential store (OpenAI key, Google OAuth) and
Claude Code's MCP config (`N8N_MCP_TOKEN`) only — see [PROJECT.md §12](./PROJECT.md#12-security--secrets).
The MCP token was shared in plaintext during planning — **regenerate before go-live**.
