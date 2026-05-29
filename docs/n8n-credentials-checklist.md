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
- [x] OpenAI credential created in n8n. Name: **`OpenAi account`** (type: OpenAI).
- [x] Google Sheets credential created in n8n. Name: **`Google Sheets account`** (type: Google Sheets OAuth2 API).
- [x] Google **Sheet ID** + **tab name** confirmed (`1T89p6…JJio`, tab `leads` — see google-sheet-schema.md §0).
