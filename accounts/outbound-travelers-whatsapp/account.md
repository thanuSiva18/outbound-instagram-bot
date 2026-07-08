# Account Config: Outbound Travelers WhatsApp

**Channel:** WhatsApp Cloud API (Meta Official) — **no ManyChat** (direct Meta integration)
**Display number:** +91 9597959728
**Status:** **LIVE / ACTIVE** (as of 2026-06-30)

## Endpoints & IDs
- **n8n Workflow:** `HfFqcCEDZJIoGd8e` — "Outbound WhatsApp Lead Bot — 1 · Chat & Capture" (ACTIVE). Rebuilt 2026-07-02 from the `chat-and-capture-whatsapp.workflow.json` backup after the old workflow `qx4PSZuDK6b6Q642` was found deleted (404). ⚠️ Meta token in "Send reply (Meta API)" node is still the `WHATSAPP_META_TOKEN_PLACEHOLDER` — must be replaced with the real token.
- **n8n Instance:** `https://n8n.srv1159219.hstgr.cloud`
- **n8n Webhook Path:** `wa-lead-bot` → `https://n8n.srv1159219.hstgr.cloud/webhook/wa-lead-bot`
- **Meta `phone_number_id`:** `900006843195557` (used to build the Graph API send URL)
- **Graph API:** `POST https://graph.facebook.com/v19.0/<phone_number_id>/messages`
- **Google Sheet ID:** `1T89p6LhpjwNJ_kqh5WT6DAj3Jt242Gs1JaTNzDCJJio` (same file as Instagram, "Testing new bot")
- **Google Sheet Tab:** `whatsapp leads` (gid `751387433`) — columns A–M, same Rahul schema as the `.in` flow

## Credentials Used in n8n
1. **Google Sheets OAuth2 API** — `Bnb4dKAXJwcqzUWj` ("Google Sheets account")
2. **OpenAI** — `xNZip6hDSsmAroMc` ("OpenAi account (WORKING June 2026)"), model `gpt-4o-mini`, JSON mode, temp 0.35
3. **Meta WhatsApp token** — currently a **permanent Bearer token set inline** in the `Send reply (Meta API)` node's
   `Authorization` header (generic header auth). In the committed repo JSON this value is **redacted** to
   `Bearer WHATSAPP_META_TOKEN_PLACEHOLDER` — the real token lives only in the live n8n node.

## How it differs from the Instagram (.in) flow
- **No ManyChat.** Meta posts inbound messages straight to the n8n `wa-lead-bot` webhook; the bot replies by
  calling the Meta Graph API directly (`Send reply (Meta API)` node). The webhook responds `200` instantly; the
  actual reply is sent asynchronously, so there is no ManyChat-style response-body contract.
- **Phone is auto-captured.** The lead's number IS the WhatsApp sender (`messages[0].from`), so the bot never asks
  for it. The collection script is **3 fields**: destination → travel_date → pax, then the Yes/No quick-assistance
  button. `whatsapp_number` is auto-filled from `from` and formatted `+91 xxxxx xxxxx`.
- **Interactive buttons.** Quick-assistance is a real WhatsApp interactive button; a Yes/No tap arrives as
  `messages[0].interactive.button_reply` (not `text.body`) and is read accordingly in `Normalize input`.

## Primary key & memory
- **Primary key = the raw WhatsApp number** (`messages[0].from`, e.g. `919597959728`), stored in the **`ig_user_id`
  column**. `Lookup existing lead`, `Claim lock`, `Read lock`, and `Save lead` all match on `ig_user_id` — consistent,
  no duplicate rows. (The `whatsapp_number` column holds the display-formatted number and is NOT a match key.)
- Memory = Simple Memory (recent turns, keyed by `from`) + Google Sheet known-fields + the `notes - AI` summary.

## Non-message webhooks
- Meta also posts delivery/read **status callbacks** (and our own outbound sends generate them). These have no
  `messages[]`; `Normalize input` guards on `waMessage.id` and returns early so they don't run the AI or Send.

## Meta setup
See [`meta-whatsapp-setup.md`](meta-whatsapp-setup.md). Webhook verification (GET `hub.challenge`) is already done
(the number receives live messages). For production, ensure the inline token is a **permanent System User token**.

## Open / TODO
- [ ] Move the Meta token from an inline header into a proper n8n credential (cleaner rotation).
- [ ] Live-confirm the Yes → CRM push end-to-end from a real handset (logic verified; not fired with fake data).
- [ ] Delete any leftover test rows (e.g. `919000000077` / "SIM Test") from the `whatsapp leads` tab.
