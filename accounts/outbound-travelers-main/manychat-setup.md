# Account 02 — ManyChat setup (new account)

Connect the 2nd Instagram account to its **own** ManyChat account and point it at the
Account-02 n8n webhook. ManyChat stays a **dumb pipe** — no keyword flows, no conversation
logic. All the brain lives in n8n + OpenAI (shared with Account 01).

> **Why a NEW ManyChat account:** one ManyChat account connects **one** IG channel, and the
> existing ManyChat is already tied to Account 01's IG. So the 2nd IG needs its own ManyChat
> login (or a paid multi-page plan).

## 0. ⚠️ Copied the flow from the `.in` account? Change these FIRST
You copied the `.in` page's ManyChat automation into this (main **@outboundtravelers**) ManyChat.
A copied flow points at the WRONG bot and often loses its field bindings. Fix ALL of these:

1. **External Request URL** → change to **`https://n8n.srv1159219.hstgr.cloud/webhook/ig-lead-bot-2`**.
   The copy still points at the `.in` bot's `…/webhook/ig-lead-bot`; if you leave it, the main page's
   DMs get answered by the `.in` bot and saved to the wrong sheet. (Check EVERY External Request if
   there is more than one.)
2. **Custom User Fields** → confirm `name`, `whatsapp_number`, `destination`, `pax`, `budget`,
   `bot reply` exist in THIS ManyChat account (§2). Copies reference fields by ID; if missing,
   recreate them and re-pick them everywhere.
3. **Body merge tags** → re-insert `{{user_id}}`, `{{last_input_text}}`, `{{user_name}}`, and each
   `{{cuf_*}}` with THIS account's field picker (pasted tags can carry the `.in` account's stale IDs).
4. **Response mapping** → `reply` → `bot reply`, and each `fields.*` → its field (§4b).
5. **PENDING gate** → `bot reply` = `PENDING` before the request; after: `bot reply` is **not**
   `PENDING` → Send Message, else branch goes nowhere (§4).
6. **n8n credential (the matching half)** → ✅ DONE — the reply is SENT BY n8n via cred
   `qNSVhbNH7kRyBci8`, which now holds THIS account's **Settings → API** token (installed 2026-06-26).
   This is the ONLY thing that delivers the reply (`bot reply` stays PENDING, so ManyChat's own Send
   never fires) — so confirm replies arrive in the live test.
7. **Don't double-handle** → when you publish this, DISABLE the main page's old simple flows so one
   DM isn't processed twice (duplicate leads).
8. **Keep it unpublished + n8n workflow inactive** until the go-live order, then test one DM end-to-end.

## What I actually need from you (NOT your ManyChat password)
- **Only the API token** at the very end: ManyChat → **Settings → API** → copy it → paste it
  to me (I'll add it to n8n as **"ManyChat API — Account 2"**), or add it in n8n yourself.
- Account-02 webhook URL (use it in step 3):
  **`https://n8n.srv1159219.hstgr.cloud/webhook/ig-lead-bot-2`**

---

## 1. New ManyChat account + connect Instagram
- Sign up / log into a **separate** ManyChat account for this IG.
- **Settings → Channels → Instagram** → connect the 2nd IG account.
  - Requires: the IG is a **Professional/Business** account, linked to a **Facebook Page** you admin.

## 2. Custom User Fields  (Settings → Fields → + New Field — type **Text**)
- `name`, `whatsapp_number`, `destination`, `pax`, `budget`
- `bot reply`  ← used by the PENDING gate in step 4
- (`ig_user_id` / `ig_username` are built-in **system** fields — don't create them.)

## 3. Default Reply → External Request  (NOT a keyword flow)
- **Automation → Default Reply** (fires on **every** DM).
- Add an **External Request**:
  - **Method:** `POST`
  - **URL:** `https://n8n.srv1159219.hstgr.cloud/webhook/ig-lead-bot-2`
  - **Headers:** `Content-Type: application/json`
  - **Body (JSON)** — insert the real merge tags with ManyChat's field picker:
```json
{
  "message_text": "{{last_input_text}}",
  "ig_user_id": "{{user_id}}",
  "ig_username": "{{user_name}}",
  "name": "{{cuf_name}}",
  "whatsapp_number": "{{cuf_whatsapp_number}}",
  "destination": "{{cuf_destination}}",
  "pax": "{{cuf_pax}}",
  "budget": "{{cuf_budget}}"
}
```

## 4. The PENDING gate  (REQUIRED — async delivery, do NOT skip)
n8n returns `{"reply":"PENDING"}` instantly and sends the REAL reply itself via the ManyChat
Send API. So ManyChat's own Send Message must stay silent unless something went wrong:
1. **Before** the External Request: **Set Custom Field** → `bot reply` = `PENDING`.
2. External Request **Response mapping:** map `reply` → `bot reply`, and each `fields.*`
   → its matching Custom User Field (`fields.name` → `name`, etc.).
3. **After** the request: **Condition** → `bot reply` **is not** `PENDING` → **Send Message**;
   the *else* branch goes nowhere.
- This blocks the literal word "PENDING" from ever being sent and lets the burst-dedup pick
  one winner. **Publish** the automation.

## 5. Hand off
- **Settings → API** → copy the token → send it to me (or add it in n8n).
- Tell me when it's published. We test one DM, then I flip the Account-02 workflow **ACTIVE**.

---
### Known limit (same as Account 01)
ManyChat's **24-hour messaging window** — you can't freely re-message a lead who's been quiet
>24h. Re-engagement belongs to a broadcast/tele-sales layer, not this bot.
