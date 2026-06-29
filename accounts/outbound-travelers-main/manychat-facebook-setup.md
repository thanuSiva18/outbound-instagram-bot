# MAIN page — Facebook Messenger setup

The main @outboundtravelers account has ONE Facebook page connected to the **same ManyChat
account** as the main Instagram. The **same AI bot** (`mO9gd0VJISdzlB5x`) handles BOTH channels —
it is **channel-aware**. This doc = wiring the Messenger side in ManyChat.

> ✅ **n8n side DONE (2026-06-26).** `Normalize input` reads `channel` (default `instagram`) +
> derives `channel_label` (`instagram`/`facebook`); `Send reply (ManyChat)` relays `channel` as the
> ManyChat **content type**; `Save lead` writes a **`channel`** column. No new credential — the same
> token (`qNSVhbNH7kRyBci8`) covers Messenger. Instagram is unchanged (no `channel` sent → defaults to `instagram`).

## 0. Prereqs
- ManyChat → **Settings → Channels → Facebook Messenger** = connected. ✅ (confirmed)
- Leads sheet `19qt6mTAmEDRVVZY_F26A1Xvee7JyjiGbmWcz0va5IuY` must have a **`channel`** header in row 1.

## 1. Build the Messenger automation (same ManyChat account; keep UNPUBLISHED)
Mirror the Instagram automation, but for Messenger:
1. **Trigger:** Facebook **Messenger → Default Reply** (fires on every Messenger message; catches emoji/symbol-only too).
2. **Set User Field** → `bot reply` = `PENDING`.
3. **External Request:**
   - `POST` → `https://n8n.srv1159219.hstgr.cloud/webhook/ig-lead-bot-2`
   - Header: `Content-Type: application/json`
   - Body (JSON) — same as Instagram **plus** the `channel` line (insert values via the field picker):
     ```json
     {
       "message_text": "{{Last Text Input}}",
       "ig_user_id": "{{Contact Id}}",
       "ig_username": "{{Username}}",
       "name": "{{name1}}",
       "whatsapp_number": "{{whatsapp_number1}}",
       "destination": "{{destination1}}",
       "pax": "{{pax1}}",
       "budget": "{{budjet}}",
       "subscriber_id": "{{Contact Id}}",
       "ig_fullname": "{{Full Name}}",
       "channel": "messenger"
     }
     ```
   - **Response mapping:** `$.reply` → `bot reply` (only this one row).
4. **Condition:** `bot reply` is **not** `PENDING` → **Send Message** (Messenger) with `bot reply`; else branch → nowhere.
5. **Keep UNPUBLISHED** until go-live.

## 2. Notes
- Custom fields are shared with the IG side (same account): reuse `name1`, `whatsapp_number1`,
  `destination1`, `pax1`, `budjet`, `bot reply`.
- The real reply is delivered by **n8n** via the ManyChat Send API as content type = the `channel`
  value above. If FB replies don't arrive, ManyChat's content type for Facebook may be `facebook`
  rather than `messenger` — just change the one `"channel"` value here (n8n relays it verbatim). We
  confirm this in the test.
- `ig_user_id` / `ig_username` keys are reused generically (= ManyChat Contact Id / username) — fine
  for Messenger; `Username` may be blank for FB users, `Full Name` will be set.

## 3. CRM attribution (optional, later)
The `channel` shows in the **sheet** immediately. To surface it **inside the CRMs**, the shared
**CRM Sync** workflow (`yH0weFfeYiobqdZq`) must forward a channel field — a one-line edit to its
"Send to Outbound CRM" body. It's a live/shared workflow (also used by the `.in` bot), so do it
deliberately. The bot's `Push to CRM` `source` tag is currently NOT forwarded by CRM Sync.

## 4. Go-live (on owner's order — same window as the IG cutover)
- Publish this Messenger automation, **disable any old Facebook auto-replies/flows**, keep the bot active.
- Meta's **24-hour messaging window** applies (same as Instagram) — no proactive DMs outside it.
