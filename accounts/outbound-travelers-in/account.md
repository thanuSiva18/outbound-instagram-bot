# Outbound Travelers — `.in` page  (live AI bot)

The **`.in`** Instagram page's bot — the AI bot we built first, currently **live**. Same business,
persona = **Zayn**. (The *main* @outboundtravelers page is in [`../outbound-travelers-main/`](../outbound-travelers-main/).)
This file records ONLY what is unique to this account — all shared brain/logic lives
in [`../../shared/`](../../shared/) and the docs in [`../../docs/`](../../docs/).

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

## Leads store (Google Sheet)
- File: **"Testing new bot"** (`1T89p6LhpjwNJ_kqh5WT6DAj3Jt242Gs1JaTNzDCJJio`), tab `leads`
- Columns A–L per [`../../docs/google-sheet-schema.md`](../../docs/google-sheet-schema.md)
  (`assigned_to` doubles as the dedup-lock cell)
- Google Sheets credential in n8n: **"Google Sheets account"** (`Bnb4dKAXJwcqzUWj`)

## LLM
- OpenAI credential in n8n: **"OpenAi account (WORKING June 2026)"** (`xNZip6hDSsmAroMc`)
- Model: `gpt-4o-mini`, JSON response mode, temperature 0.35

## CRM
- Push on qualify only → POST `https://n8n.srv1159219.hstgr.cloud/webhook/crm-lead-sync`
- Source tag: `instagram`
- Contract: [`../../docs/crm-integration-contract.md`](../../docs/crm-integration-contract.md)

## WhatsApp handoff
- Number: **+91 9597959728** → `https://wa.me/919597959728`
