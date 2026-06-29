# Outbound Travelers — MAIN page (@outboundtravelers)  ·  AI-bot migration

Same business, same **Zayn** persona, same system prompt, same WhatsApp / office / careers,
same CRM as the live `.in` bot. **Only the routing + the leads store differ.** Everything else
is copied verbatim from [`../../shared/`](../../shared/) — do NOT let them diverge.

> **This folder = the flagship "Outbound Travelers" MAIN Instagram page (@outboundtravelers).**
> Today that page runs on **"My workflow"** (`8yGvAmoeoeT4pI2K`) — plain ManyChat flows → Google
> Sheets → Workpex, **no AI**. We are migrating it to the AI bot described below, then — only on
> the owner's explicit order — retiring "My workflow".
> The sibling folder [`../outbound-travelers-in/`](../outbound-travelers-in/) (`AfmPZXhWMetbxHTl`)
> is the **`.in`** page's live bot. Full picture + steps: [`GO-LIVE-RUNBOOK.md`](./GO-LIVE-RUNBOOK.md).

Legend: `← you` = you provide it · `← me` = I do it via n8n MCP.

## n8n   ← me · ✅ BUILT + VALIDATED (kept INACTIVE on purpose)
- Workflow: **"Outbound IG Lead Bot — 2 · Chat & Capture (@outboundtravelers)"**
  — id **`mO9gd0VJISdzlB5x`** · 16 nodes · `valid: true`, 0 errors · **NOT active**
  (do not activate until the go-live order).
- Webhook path: **`ig-lead-bot-2`** → `https://n8n.srv1159219.hstgr.cloud/webhook/ig-lead-bot-2`
- OpenAI cred `xNZip6hDSsmAroMc` (shared) · Google Sheets cred `Bnb4dKAXJwcqzUWj` (shared) ✅
- ManyChat send cred **`qNSVhbNH7kRyBci8` ("ManyChat API — Account 2 (main @outboundtravelers)")**
  — ✅ **token installed 2026-06-26** (the main `outboundtravelers` ManyChat **Settings → API** token,
  domain scope `all`). The old empty cred `AYBjKsgTpJUmEplR` was deleted.
  - ⏳ **Confirm by a live test:** the bot's "Send reply (ManyChat)" node is the ONLY thing that
    replies (`bot reply` is always PENDING, so ManyChat's own Send never fires). If replies don't
    arrive in testing, re-check this token first.
- Error workflow: `f8JebCcUmgk137Li` (shared, currently an unfinished stub — see runbook).
- CRM push tagged `source = instagram_account2`.

## Leads store (Google Sheet)   ← you · ✅ provided
- Separate sheet so main-page AI-bot leads stay distinct from the `.in` bot:
  - Sheet ID `19qt6mTAmEDRVVZY_F26A1Xvee7JyjiGbmWcz0va5IuY` · tab **`leads`**
  - https://docs.google.com/spreadsheets/d/19qt6mTAmEDRVVZY_F26A1Xvee7JyjiGbmWcz0va5IuY/edit
- ⏳ Confirm: tab named **exactly** `leads`; header row 1 = the 12 columns from
  [`../../docs/leads_sheet_template.csv`](../../docs/leads_sheet_template.csv); sheet shared
  (Editor) with the Google account behind cred `Bnb4dKAXJwcqzUWj` (`outboundtravelers1@gmail.com`).
- The 4 Sheets nodes (Lookup, Claim lock, Read lock, Save lead) are already repointed here. ✅

## Instagram / ManyChat   ← you · ⏳ MAIN REMAINING WORK
The main page already has a ManyChat running **simple flows → "My workflow"**. To switch it to
the AI bot (prepare now, publish only at go-live):
1. In THAT ManyChat, ensure Custom User Fields exist — `name`, `whatsapp_number`, `destination`,
   `pax`, `budget`, `bot reply`. (`ig_user_id` / `ig_username` are built-in system fields.)
2. Build a **Default Reply → External Request** to `…/webhook/ig-lead-bot-2` with the **PENDING
   gate**, exactly as in [`./manychat-setup.md`](./manychat-setup.md). **Keep it UNPUBLISHED.**
3. ✅ Done — the main account's **Settings → API** token is installed in n8n cred `qNSVhbNH7kRyBci8`.

## Facebook Messenger — SAME bot, channel-aware   ← (2026-06-26)
The one FB page on this account is in the **same ManyChat** as the main IG, so the bot
`mO9gd0VJISdzlB5x` now handles **both** channels. ✅ n8n side done (Normalize reads `channel`;
reply sent on that channel; `channel` column added to the sheet). No new credential.
Wire the Messenger side per [`./manychat-facebook-setup.md`](./manychat-facebook-setup.md) and keep
it unpublished until go-live. ⚠️ Add a **`channel`** header column to the leads sheet.

## Cutover — DO NOT do until the owner gives the order
Per instruction, nothing touches "My workflow" until told. At go-live: publish the ManyChat
Default Reply → disable the old simple flows → activate `mO9gd0VJISdzlB5x` → test one DM → and
only THEN stop "My workflow". Order + rollback: [`GO-LIVE-RUNBOOK.md`](./GO-LIVE-RUNBOOK.md).

## Shared — identical to the `.in` bot (reference, do NOT copy-edit)
- Persona Zayn + prompt → [`../../shared/prompts/system_prompt.md`](../../shared/prompts/system_prompt.md)
- Code nodes → [`../../shared/workflow-code/`](../../shared/workflow-code/)
- WhatsApp **+91 9597959728**, office info, careers URL — unchanged.
