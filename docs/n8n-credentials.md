# n8n credentials checklist (Faheem — do this in the n8n UI)

These **cannot** be created from Claude Code — only you, inside the n8n web UI, can
create OAuth/API credentials. The deploy step is **paused** until both exist.

When done, tell me the **exact credential name** you gave each one so I reference it
in the workflow.

---

## 1. OpenAI credential  (for the conversation brain — gpt-4o-mini)
1. In n8n: **Credentials → + Add credential → "OpenAI"** (or "OpenAI API").
2. Paste your OpenAI **API key** (`sk-...`).
   - Get/create one at https://platform.openai.com/api-keys
   - Ensure the account has billing enabled and access to **gpt-4o-mini**.
3. Save. Suggested name: **`OpenAI — Outbound`**.
4. ⚠️ The API key stays inside n8n's credential store. Never paste it into the
   workflow JSON, this repo, or chat.

## 2. Google Sheets credential  (OAuth2 — for the leads sheet)
1. In n8n: **Credentials → + Add credential → "Google Sheets OAuth2 API"**.
2. You need a Google Cloud OAuth client (Client ID + Secret) with the **Google
   Sheets API** (and Drive API) enabled:
   - Google Cloud Console → enable **Google Sheets API** + **Google Drive API**.
   - APIs & Services → Credentials → **Create OAuth client ID → Web application**.
   - Add n8n's OAuth redirect URL (n8n shows it on the credential screen — copy it
     into the Google client's *Authorized redirect URIs*).
3. Put Client ID + Secret into the n8n credential, click **Connect / Sign in with
   Google**, and authorize the Google account that owns the Leads sheet.
4. Save. Suggested name: **`Google Sheets — Outbound`**.

---

## Status of the deploy prerequisites
- [x] n8n-mcp connected (local stdio `npx n8n-mcp`). *Note: tools only load after a Claude Code session reload — don't hot-load mid-session.*
- [x] OpenAI credential created in n8n. Name: **`OpenAi account`** (type: OpenAI). ID: `hVkKnR0gPFSyIVu4`.
- [x] Google Sheets credential created in n8n. Name: **`Google Sheets account`** (type: Google Sheets OAuth2 API). ID: `Bnb4dKAXJwcqzUWj`.
- [x] Google **Sheet ID** + **tab name** confirmed (`1T89p6…JJio`, tab `leads` — see google-sheets-schema.md §0).

---

## DEPLOYED — live workflow
- **Workflow:** `Outbound IG Lead Bot — 1 · Chat & Capture`, ID **`AfmPZXhWMetbxHTl`**, **active**.
- **Webhook URL (give this to ManyChat):** `https://n8n.srv1159219.hstgr.cloud/webhook/ig-lead-bot`
- **LLM:** AI Agent node (`@n8n/n8n-nodes-langchain.agent` v3) + **OpenAI Chat Model** sub-node
  (`gpt-4o-mini`, JSON response mode) — API key attaches to the OpenAI Chat Model node, not an HTTP node.
- **Pipeline:** Webhook → Normalize input → AI Agent → Parse + validate → Respond to Webhook → Save lead.
- Tested 5/5 edge cases (all-fields-at-once → qualified, bare "hi" → new, junk phone re-ask,
  Tanglish language-match, off-topic deflect). Conversation engine confirmed working.
- ⚠️ AI Agent must be **typeVersion 3** (not 3.1) — 3.1 fails to activate via the n8n API on this instance.
