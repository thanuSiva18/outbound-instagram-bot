# Main-page AI bot — GO-LIVE RUNBOOK

Migrate the **main @outboundtravelers Instagram page** from the simple capture flow
("My workflow") to the **AI Chat & Capture bot** — without breaking the live page.
Single rule from the owner: **"My workflow" is not touched until I give the order.**

_Last updated by Claude: 2026-06-26._

---

## 0. Account map (source of truth)

| Page (business view) | IG | Runs on TODAY | n8n workflow | Repo folder |
|---|---|---|---|---|
| **MAIN / flagship** | @outboundtravelers | **"My workflow"** (simple ManyChat flows → Sheets → Workpex, **no AI**) | `8yGvAmoeoeT4pI2K` (live) **+** `mO9gd0VJISdzlB5x` (AI replica, inactive) | `accounts/outbound-travelers-main/` (this folder) |
| **Secondary** | the `.in` page | the **AI bot** | `AfmPZXhWMetbxHTl` (active) | `accounts/outbound-travelers-in/` |

> ✅ Folders renamed 2026-06-26 to match the pages: `outbound-travelers-main` = the MAIN
> @outboundtravelers page (this folder), `outbound-travelers-in` = the `.in` page. (The `.in`
> bot was just built first — build order ≠ importance.)

---

## 1. Where we are right now

- ✅ AI replica `mO9gd0VJISdzlB5x` built + validated (16 nodes, 0 errors), **inactive**.
- ✅ Pointed at its own sheet `19qt6m…va5IuY` (tab `leads`) and shared creds (OpenAI + Google).
- ✅ ManyChat send credential `qNSVhbNH7kRyBci8` (holds the main @outboundtravelers API token,
  installed 2026-06-26) attached to the "Send reply (ManyChat)" node.
- ✅ CRM push wired (`crm-lead-sync`, `source = instagram_account2`).
- ✅ Bot made **channel-aware for Facebook Messenger** (2026-06-26): `Normalize` reads `channel`,
  reply is sent on that channel, and a `channel` column is written to the sheet. Same bot, same
  token. Messenger ManyChat wiring pending → [`./manychat-facebook-setup.md`](./manychat-facebook-setup.md)
  (keep unpublished); add a `channel` header to the sheet.
- ⏳ ManyChat on the main page NOT yet wired to the bot (still runs simple flows).
- ✅ ManyChat token installed in cred `qNSVhbNH7kRyBci8` (2026-06-26); live-test delivery pending (R1).
- ⏳ Sheet tab/header/share NOT yet confirmed (see risk R2).
- 🚫 Workflow intentionally **not active**; "My workflow" untouched.

---

## 2. Phase 1 — safe prep (do now; NOTHING goes live)

### You (ManyChat — main @outboundtravelers page)
- [ ] Custom User Fields exist: `name`, `whatsapp_number`, `destination`, `pax`, `budget`, `bot reply`.
- [ ] Create a **Default Reply → External Request** → `https://n8n.srv1159219.hstgr.cloud/webhook/ig-lead-bot-2`
      with the PENDING gate, per [`./manychat-setup.md`](./manychat-setup.md). **Leave it UNPUBLISHED.**
- [x] ✅ Main account's **Settings → API** token installed in n8n cred `qNSVhbNH7kRyBci8` (2026-06-26).

### You (Google Sheet `19qt6m…va5IuY`)
- [ ] Tab named exactly `leads`.
- [ ] Header row 1 = the 12 columns from [`../../docs/leads_sheet_template.csv`](../../docs/leads_sheet_template.csv).
- [ ] Shared (Editor) with the Google account behind cred `Bnb4dKAXJwcqzUWj`.

### Me (n8n — no go-live)
- [ ] Confirm/replace ManyChat credential once token ownership is known (risk R1).
- [ ] Re-validate `mO9gd0VJISdzlB5x`.
- [ ] **Dry-run the n8n half:** fire a simulated DM at the webhook and confirm the AI replies
      and a row is written to the `leads` tab — proves everything except the live ManyChat send,
      with zero impact on the real IG. Workflow stays inactive afterward.

**Exit criteria for Phase 1:** dry-run writes a correct row + returns a sensible AI reply, sheet
verified, ManyChat automation built (unpublished), token confirmed to belong to the main page.

---

## 3. Phase 2 — go-live (ONLY on the owner's explicit order)

Run in this order, in one short window:
1. [ ] **Publish** the ManyChat Default Reply automation on the main page.
2. [ ] **Disable** the old simple flows so they don't double-handle DMs.
3. [ ] **Activate** `mO9gd0VJISdzlB5x` in n8n.
4. [ ] Send **one real test DM** from a personal IG → confirm: human-feeling reply arrives,
       row appears in the `leads` sheet, no duplicate/echo, CRM gets the lead on qualify.
5. [ ] Watch the next few real DMs for 15–30 min.

> Note: "My workflow" is STILL running at this point. That's fine — it just won't receive the
> main page's DMs anymore once ManyChat points at the new webhook.

---

## 4. Phase 3 — retire "My workflow" (only after Phase 2 is confirmed good)

- [ ] Owner gives the explicit "stop My workflow" order.
- [ ] Confirm no other source still posts to "My workflow"'s webhooks (it has 4 intake paths —
      check none are still in use by website forms / ad lead forms before disabling).
- [ ] **Deactivate** (don't delete yet) "My workflow"; keep it ~2 weeks as a fallback.
- [ ] After the safety window, archive or delete.

---

## 5. Rollback (if Phase 2 misbehaves)

1. In ManyChat: **unpublish** the new Default Reply and **re-enable** the old simple flows.
2. In n8n: **deactivate** `mO9gd0VJISdzlB5x`.
3. "My workflow" never stopped, so the main page is immediately back to its old behavior.
   No data loss; investigate from execution logs before retrying.

---

## 6. Risks / open items

- **R1 — ManyChat token (was the highest risk).** ✅ The main `outboundtravelers` account's API
  token is now installed in cred `qNSVhbNH7kRyBci8` (2026-06-26). Remaining: a live test to confirm
  replies actually deliver — the bot's Send-API node is the ONLY thing that replies.
- **R2 — Sheet not shared / wrong tab name.** Lookup/Save fail closed if the tab isn't `leads`
  or the cred's Google account lacks Editor access.
- **R3 — Error alerting is log-only.** The shared error workflow `f8JebCcUmgk137Li` is actually a
  COMPLETE logger (Error Trigger → append to sheet `1T89p6…` tab `bot_errors`: ts/workflow/node/
  error/exec_url) — not a stub. ✅ Now set as the Error Workflow on the new main bot
  (`mO9gd0VJISdzlB5x`). TODO: (a) **create the `bot_errors` tab** in sheet `1T89p6…` or the logger
  itself errors; (b) set the same Error Workflow on the live `.in` bot (`AfmPZXhWMetbxHTl`);
  (c) recommended — add a push channel (Telegram/email) so it's a real alert, not a silent log.
- **R4 — Duplicate leads.** Don't run the old simple flows AND the AI bot on the same page at
  once — disabling the simple flows in Phase 2 step 2 prevents this.

---

## 7. Companion / housekeeping
- ✅ **DELETED 2026-06-26** (owner-approved): `[ARCHIVED] old draft`, `WhatsApp AI Auto-Reply`,
  `Follow-up Nudges`.
- ✅ `Comment Seed` (`9y02z4wHfm1y4Q6V`) **deactivated 2026-06-26** (never ran). Re-wire its
  ManyChat comment trigger only if you actually want it.
- ⏳ **Meta-compliant follow-up plan (LATER — to design).** The deleted `Follow-up Nudges` ran a
  schedule (every 2 min) → read leads → DM "due" leads via ManyChat → mark nudged. That
  re-messages quiet leads and breaks Meta's **24-hour messaging window** (a known repeat-DM cause).
  The replacement must NOT proactively DM outside 24h — do re-engagement via a broadcast /
  tele-sales / WhatsApp layer instead. Design before rebuilding.
