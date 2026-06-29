# Google Sheet setup — Outbound Travelers leads

## 0. Target sheets (CONFIRMED)

| Account | Sheet ID | Tab | File name | Columns |
|---|---|---|---|---|
| `.in` Instagram (`AfmPZXhWMetbxHTl`) | `1T89p6LhpjwNJ_kqh5WT6DAj3Jt242Gs1JaTNzDCJJio` | `leads_v2` | "Testing new bot" | 13 (A–M) |
| Main Instagram / Facebook (`mO9gd0VJISdzlB5x`) | `19qt6mTAmEDRVVZY_F26A1Xvee7JyjiGbmWcz0va5IuY` | `leads` | (main leads sheet) | 13 (A–M) |

Both sheets must be shared (Editor) with the Google account behind credential `Bnb4dKAXJwcqzUWj` (`outboundtravelers1@gmail.com`).

The workflow's Google Sheets nodes match by header name, so the header text in row 1 must match exactly.

> **Migration note:** the `.in` account previously used a `leads` tab with the old Zayn schema (`name`, `budget`, no `travel_date`/`quick_assistance`). On 2026-06-29 all 280 existing rows were migrated to a new `leads_v2` tab with the Rahul schema below. The old `leads` tab is kept as an archive and is no longer written to.

---

## 1. `.in` account sheet layout — 13 columns (Rahul scripted flow)

Row 1 must contain these headers in this exact order:

| A | B | C | D | E | F | G | H | I | J | K | L | M |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ig_user_id` | `ig_username` | `destination` | `normalized_destination` | `travel_date` | `pax` | `whatsapp_number` | `status` | `quick_assistance` | `first_contact_ts` | `last_update_ts` | `assigned_to` | `notes - AI` |

## 2. Main account sheet layout — 13 columns

The main-account bot is channel-aware (Instagram + Facebook Messenger), so it writes one extra column:

| A | B | C | D | E | F | G | H | I | J | K | L | M |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ig_user_id` | `ig_username` | `destination` | `normalized_destination` | `travel_date` | `pax` | `whatsapp_number` | `status` | `quick_assistance` | `first_contact_ts` | `last_update_ts` | `assigned_to` | `notes - AI` |

For the main account, the workflow also writes `channel` in column N. The Rahul `.in` flow does **not** write `channel`.

## 3. Column meaning

- **`ig_user_id`** — ManyChat user id. **This is the match key** for Append-or-Update: first message creates the row; every later message updates the *same* row. No lead is ever lost.
- **`ig_username`** — ManyChat username (may be blank for Facebook Messenger).
- **`destination`** — the destination exactly as the user typed it.
- **`normalized_destination`** — canonical/normalized destination name (e.g. "Jammu" / "Kashmir" → "Jammu and Kashmir").
- **`travel_date`** — when the user plans to travel, stored as free text.
- **`pax`** — number of travellers.
- **`whatsapp_number`** — contact number in `+91 xxxxx xxxxx` format.
- **`status`** — `new` → `in_progress` → `qualified`. Flips to `qualified` once destination, travel_date, pax, and whatsapp_number are filled.
- **`quick_assistance`** — `yes`, `no`, or empty. Set after the user clicks the Yes/No quick-assistance button.
- **`first_contact_ts` / `last_update_ts`** — IST timestamps, `YYYY-MM-DD HH:MM:SS`. `first_contact_ts` is preserved from the very first message; `last_update_ts` is refreshed every message.
- **`assigned_to`** — **⚠️ CURRENTLY DOUBLES AS THE DEDUP LOCK CELL** (see §4). Each incoming message overwrites it with a one-shot lock token (`L<ts>-<rand>`), so it is NOT free for routing yet. Before you build routing, move the lock to a dedicated `lock_msg_id` column (§4) so `assigned_to` is freed.
- **`notes - AI`** — a short running summary written by the AI each turn. Human-readable context for handoff.
- **`channel`** — `instagram` or `facebook`. Written **only by the main-account bot** today. The `.in` bot does not write this column.

## 4. Dedup lock (rapid-message / burst protection)

When a user fires several DMs in the same second, ManyChat sends each as a separate webhook → n8n runs them as **parallel executions**. They can't coordinate in memory, so the shared **sheet row** is used as a last-writer-wins ownership lock:

- **`Claim lock`** node writes the execution's unique `msg_id` into the lock cell (keyed by `ig_user_id`); concurrent writes settle to ONE winner.
- The AI's runtime is the settle window; **`Read lock`** re-reads the cell.
- Only the execution whose `msg_id` matches the cell returns the real reply; losers return `reply:"PENDING"` so ManyChat's gate drops them (see `docs/manychat-setup.md`).

**Lock cell:** currently `assigned_to` (works today, no new column needed). To use a dedicated column instead, add a header **`lock_msg_id`** immediately after the rightmost used column, then repoint `Claim lock` / `Read lock` / `Winner?` from `assigned_to` → `lock_msg_id`. n8n CANNOT auto-create the column — it must exist first, and the `Claim lock` schema must list every column in sheet order (a partial schema triggers a "Column names were updated after the node's setup" error).

## 5. Note on `first_contact_ts` (timestamp preservation)

Google Sheets "Append or Update" overwrites every mapped column on update. To keep `first_contact_ts` as the *true* first-contact time (not "last seen"), the workflow does a quick **lookup by `ig_user_id` before writing** (this happens *after* the reply is sent, so it never slows the user's reply):

- if a row already exists → reuse its existing `first_contact_ts`;
- if not → use the current timestamp.

`last_update_ts` is always set to "now" on every message.
