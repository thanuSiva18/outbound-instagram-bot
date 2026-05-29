# Google Sheet setup — Outbound Travelers leads

## 1. Create the sheet
1. Create a new Google Sheet (in the Google account whose OAuth you'll connect to n8n).
2. Name it e.g. **`Outbound Travelers — IG Leads`**.
3. Rename the first tab to **`Leads`**.
4. In **row 1**, create these **11 columns in this exact order** (header text must match exactly — the workflow maps by header name):

| A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| `ig_user_id` | `ig_username` | `name` | `whatsapp_number` | `destination` | `pax` | `budget` | `status` | `first_contact_ts` | `last_update_ts` | `assigned_to` |

5. Send me **(a) the Sheet ID** and **(b) the tab name** so I can wire the node.
   - The Sheet ID is the long string in the URL:
     `https://docs.google.com/spreadsheets/d/`**`<THIS_IS_THE_ID>`**`/edit`

## 2. Column meaning
- **`ig_user_id`** — Instagram user id from ManyChat. **This is the match key** for
  Append-or-Update: first message creates the row, every later message updates the
  *same* row. No lead is ever lost.
- **`status`** — `new` → `in_progress` → `qualified`. Flips to `qualified` only when
  all 5 fields (name, whatsapp_number, destination, pax, budget) are filled.
  **This flip is the handoff trigger** for the downstream CRM/Tele-Sales automation —
  keep it clean.
- **`assigned_to`** — left blank in v1; routing fills it later (out of scope).
- **`first_contact_ts` / `last_update_ts`** — IST timestamps, `YYYY-MM-DD HH:MM:SS`.

## 3. Note on `first_contact_ts` (timestamp preservation)
Google Sheets "Append or Update" overwrites every mapped column on update. To keep
`first_contact_ts` as the *true* first-contact time (not "last seen"), the workflow
does a quick **lookup by `ig_user_id` before writing** (this happens *after* the reply
is sent, so it never slows the user's reply):
- if a row already exists → reuse its existing `first_contact_ts`;
- if not → use the current timestamp.

`last_update_ts` is always set to "now" on every message.

> If you'd rather skip the lookup for simplicity in v1, tell me — then
> `first_contact_ts` will effectively track the latest message time instead, and we
> can add the lookup later.
