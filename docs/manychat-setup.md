# ManyChat setup steps (Faheem — manual, in the ManyChat web app)

ManyChat is a **dumb pipe**: it does NO conversation logic. It just (a) forwards every
DM to n8n, and (b) stores the latest field values so they ride along on the next message.
All the "brain" lives in n8n + OpenAI. Do **not** build a keyword/quick-reply flow.

---

## 1. Connect Instagram
- ManyChat → **Settings → Channels → Instagram** → connect the Outbound Travelers
  Instagram account (needs an IG Professional account linked to a Facebook Page).

## 2. Create Custom User Fields
ManyChat → **Settings → Fields → Custom User Fields → + New Field**. Create these
(type **Text** for all):
- `destination`
- `normalized_destination`
- `travel_date`
- `pax`
- `whatsapp_number`
- `quick_assistance`
- `bot reply`  ← used by the PENDING gate in step 4
- `lead_status` ← optional, for debugging
- *(`ig_user_id` and `ig_username` come from ManyChat's built-in system fields — no
  need to create them; we reference the built-ins when building the request.)*

## 3. Default Reply → External Request  (NOT a keyword flow)
- ManyChat → **Automation → Default Reply** (this fires on **every** incoming DM —
  that's what fixes the old capture gap).
- Inside it, add an **External Request** (Actions → External Request / Dynamic block).
- **Method:** `POST`
- **URL:** `https://n8n.srv1159219.hstgr.cloud/webhook/ig-lead-bot`
- **Headers:** `Content-Type: application/json`
- **Body (JSON):** send the message text, the IG identifiers, and **all current field
  values** every time:

```json
{
  "message_text": "{{last_input_text}}",
  "ig_user_id": "{{user_id}}",
  "ig_username": "{{user_name}}",
  "ig_fullname": "{{full_name}}",
  "destination": "{{cuf_destination}}",
  "normalized_destination": "{{cuf_normalized_destination}}",
  "travel_date": "{{cuf_travel_date}}",
  "pax": "{{cuf_pax}}",
  "whatsapp_number": "{{cuf_whatsapp_number}}",
  "quick_assistance": "{{cuf_quick_assistance}}"
}
```

> Use ManyChat's field-picker to insert the real merge tags — the `{{...}}` names above
> are placeholders. `message_text` = the user's last text input; `ig_user_id`/`ig_username`
> = ManyChat's system User ID / Username; the rest = the Custom User Fields from step 2.
>
> Legacy fields like `name` and `budget` are harmless if left in the body, but the Rahul
> flow ignores them.

## 4. Map the n8n JSON response back
The n8n webhook responds with:
```json
{
  "reply": "…message to send…",
  "fields": {
    "destination": "",
    "normalized_destination": "",
    "travel_date": "",
    "pax": "",
    "whatsapp_number": "",
    "quick_assistance": ""
  },
  "status": "new | in_progress | qualified"
}
```
In the External Request **Response mapping**:
- `$.reply` → `bot reply`
- `$.fields.destination` → `destination`
- `$.fields.normalized_destination` → `normalized_destination`
- `$.fields.travel_date` → `travel_date`
- `$.fields.pax` → `pax`
- `$.fields.whatsapp_number` → `whatsapp_number`
- `$.fields.quick_assistance` → `quick_assistance`
- `$.status` → `lead_status` (optional)

Then send **`reply`** back to the user as the Instagram message (Send Message → insert the
`bot reply` response variable).

## 4b. ⚠️ REQUIRED — the `PENDING` reply gate (do NOT skip)
n8n uses the sentinel reply **`PENDING`** for messages that must NOT be sent:
(a) a slow/failed turn, and (b) the **losers of a rapid-message burst** (the dedup lock
lets only ONE of several simultaneous DMs reply; the rest return `reply:"PENDING"`).
So the **Send Message must only fire when `reply` is NOT `PENDING`**, or customers will
literally receive the word "PENDING" and bursts will still double.

Setup (in the Default Reply / "AI agent automation" flow):
1. **Before** the External Request, add a **Set Custom Field** action → set `bot reply`
   to `PENDING`.
2. The External Request's Response-mapping writes `reply` → `bot reply` (as above).
3. **Between** the request and the Send Message, add a **Condition**:
   `bot reply` **is not** `PENDING` → true → **Send Message**; the *If not* branch goes
   nowhere (sends nothing).

This single gate covers both the slow-reply silence fix AND the burst-dedup. It must be
**published** for the dedup to work end-to-end.

## 4c. ⚙️ ARCHITECTURE NOTE — replies are now delivered ASYNC (by n8n, not the webhook response)
As of the async rebuild, the n8n webhook **always returns `{"reply":"PENDING"}` instantly**
(sub-second), so:
- ManyChat's own **Send Message step never fires** (bot reply is always `PENDING` → the gate
  in §4b blocks it). That's intentional — leave the Send Message + gate in place; they just
  stay silent now.
- n8n delivers the real reply itself, by calling the **ManyChat Send API**
  (`api.manychat.com/fb/sending/sendContent`, the "ManyChat API" credential) once the AI is
  done — only for the ONE winner of a burst.
- The quick-assistance Yes/No buttons are also sent by n8n via the Send API.

Why: the instant ack means (1) ManyChat stops queuing rapid messages ~10s apart, so a burst
arrives together and the dedup lock can pick a single winner; and (2) a slow AI turn can take
15s+ without ever timing out / going silent. Nothing to configure on the ManyChat side beyond
the §4b gate — but DON'T delete the gate, or PENDING acks would be sent as real messages.

## 5. Confirm
- Test a DM. Confirm the request fires on **every** message (not just flow completion).
- Confirm fields persist between messages (send a destination, then on the next message it
  shouldn't ask again).
- Confirm the quick-assistance buttons appear after the phone number and that Yes/No clicks
  receive the correct follow-up message.

---

## Known limit (do NOT try to solve here)
ManyChat's **24-hour messaging window**: you cannot freely re-message a lead who went
quiet >24h. Re-engagement belongs to the Tele-Sales / broadcast layer (Phase 4), not this
bot.
