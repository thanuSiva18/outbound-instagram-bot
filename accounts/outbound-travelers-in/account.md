# Outbound Travelers — `.in` page  (live AI bot — Rahul scripted flow)

The **`.in`** Instagram page's bot — currently **live**. The AI is a **silent field
extractor only** (it never writes messages); every reply the customer sees is
**scripted deterministically** in the `Parse + validate` / `Button handler` code, so
the agent can't improvise or go off-script. Fixed collection order:

1. destination          — AI also returns a normalized/spell-corrected `normalized_destination`
2. travel_date
3. pax
4. whatsapp_number
5. quick-assistance Yes/No button

**Memory rule:** time-based — remember within **48h** (a returning lead continues),
forget after 48h idle (next message restarts at the greeting). The Simple Memory
session is keyed to a per-conversation epoch (`first_contact_ts`) so it expires with
the 48h window.

**Scripted replies:** greeting → "Great choice! When are you planning to travel?" →
"Great. May I know the number of people travelling?" → "Thanks for the information.
Could you please share your contact number…" → "Thanks for your cooperation. Do you
need quick assistance?" (Yes/No buttons).

**Working hours (Button handler):** Mon–Sat 9:00 AM–5:30 PM IST (Sunday = full holiday,
always after-hours). Yes within hours → "…reach you shortly"; Yes after hours →
"…during our working hours (9:00 AM – 5:30 PM)"; No → polite close. Yes also tags
`quick_assistance=yes` and pushes to CRM.

**Send API:** ManyChat `https://api.manychat.com/fb/sending/sendContent` (the `/fb/`
endpoint — `/ig/` 404s for some subscribers).

> Canonical source of truth = the **live n8n workflow** (`AfmPZXhWMetbxHTl`). The JSON
> in this folder is a human-readable reference; for a byte-perfect backup use n8n's own
> **Workflow → Download**.

## Instagram / ManyChat
- IG account: the **outboundtravellers.in** page
- ManyChat: connected to this IG. Default Reply → External Request → n8n webhook
  (no keyword flows). See [`../../docs/manychat-setup.md`](../../docs/manychat-setup.md).
- ManyChat Send-API credential in n8n: **"ManyChat API"** (`WRHI5I3GZm4zJCrl`)

## n8n
- Instance: `https://n8n.srv1159219.hstgr.cloud`
- Project: Outbound Travelers (`outboundtravelers1@gmail.com`)
- Workflow: **"Outbound IG Lead Bot — 1 · Chat & Capture"** (`AfmPZXhWMetbxHTl`) — **ACTIVE**
- Webhook path: `ig-lead-bot`
  → URL `https://n8n.srv1159219.hstgr.cloud/webhook/ig-lead-bot`
- Error workflow: "Error Alerts" (`f8JebCcUmgk137Li`)
- Companion flows: CRM Sync (`yH0weFfeYiobqdZq`), Comment Seed (`9y02z4wHfm1y4Q6V`)
- Test workflow: `N1D44nSBQjAyo2CQ`, webhook `ig-lead-bot-rahul-test` (inactive, used for safe validation)

## Leads store (Google Sheet)
- File: **"Testing new bot"** (`1T89p6LhpjwNJ_kqh5WT6DAj3Jt242Gs1JaTNzDCJJio`), tab `leads_v2`
- Columns A–M per [`../../docs/google-sheet-schema.md`](../../docs/google-sheet-schema.md)
  (`assigned_to` doubles as the dedup-lock cell)
- Old `leads` tab remains as an archive of pre-Rahul data (280 rows migrated to `leads_v2`)
- Google Sheets credential in n8n: **"Google Sheets account"** (`Bnb4dKAXJwcqzUWj`)

## LLM
- OpenAI credential in n8n: **"OpenAi account (WORKING June 2026)"** (`xNZip6hDSsmAroMc`)
- Model: `gpt-4o-mini`, JSON response mode, temperature 0.35

## CRM
- Push on **Yes** quick-assistance click → POST `https://n8n.srv1159219.hstgr.cloud/webhook/crm-lead-sync`
- Source tag: `instagram`
- Contract: [`../../docs/crm-integration-contract.md`](../../docs/crm-integration-contract.md)

## WhatsApp handoff
- Number: **+91 9597959728** → `https://wa.me/919597959728`
