# Google Sheet setup — Outbound Travelers leads

## 0. Target sheet (CONFIRMED)
- **Sheet ID:** `1T89p6LhpjwNJ_kqh5WT6DAj3Jt242Gs1JaTNzDCJJio`
- **Tab:** `leads`
- **File name:** "Testing new bot"

The workflow's Google Sheets node is wired to this sheet/tab. The steps below
document the column layout it expects — confirm row 1 of the `leads` tab matches.

## 1. Sheet layout
1. The sheet above already exists (OAuth'd Google account owns it).
2. The tab is named **`leads`** (lowercase — the node matches the tab name exactly).
3. In **row 1**, these **11 columns must exist in this exact order** (header text must match exactly — the workflow maps by header name):

| A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| `ig_user_id` | `ig_username` | `name` | `whatsapp_number` | `destination` | `pax` | `budget` | `status` | `first_contact_ts` | `last_update_ts` | `assigned_to` |

   - (Sheet ID + tab already provided — see §0 above.)

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
