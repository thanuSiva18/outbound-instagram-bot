# ManyChat setup steps (Faheem — manual, in the ManyChat web app)

ManyChat is a **dumb pipe**: it does NO conversation logic. It just (a) forwards every
DM to n8n, and (b) stores the latest field values so they ride along on the next message.
All the "brain" lives in n8n + OpenAI. Do **not** build a keyword/quick-reply flow.

I'll give you the **n8n webhook URL** once the workflow is deployed. Steps:

---

## 1. Connect Instagram
- ManyChat → **Settings → Channels → Instagram** → connect the Outbound Travelers
  Instagram account (needs an IG Professional account linked to a Facebook Page).

## 2. Create Custom User Fields
ManyChat → **Settings → Fields → Custom User Fields → + New Field**. Create these
(type **Text** for all):
- `name`
- `whatsapp_number`
- `destination`
- `pax`
- `budget`
- *(`ig_user_id` and `ig_username` come from ManyChat's built-in system fields — no
  need to create them; we reference the built-ins when building the request.)*

## 3. Default Reply → External Request  (NOT a keyword flow)
- ManyChat → **Automation → Default Reply** (this fires on **every** incoming DM —
  that's what fixes the old capture gap).
- Inside it, add an **External Request** (Actions → External Request / Dynamic block).
- **Method:** `POST`
- **URL:** `<the n8n webhook URL I will give you>`
- **Headers:** `Content-Type: application/json`
- **Body (JSON):** send the message text, the IG identifiers, and **all current field
  values** every time:

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

> Use ManyChat's field-picker to insert the real merge tags — the `{{...}}` names above
> are placeholders. `message_text` = the user's last text input; `ig_user_id`/`ig_username`
> = ManyChat's system User ID / Username; the rest = the Custom User Fields from step 2.

## 4. Map the n8n JSON response back
The n8n webhook responds with:
```json
{
  "reply": "…message to send…",
  "fields": { "name": "", "whatsapp_number": "", "destination": "", "pax": "", "budget": "" },
  "status": "new | in_progress | qualified"
}
```
In the External Request **Response mapping**:
- Send **`reply`** back to the user as the Instagram message (Send Message → insert the
  `reply` response variable).
- Write each value in **`fields`** into the matching Custom User Field
  (`fields.name` → `name`, `fields.whatsapp_number` → `whatsapp_number`, etc.).
  This is the entire memory mechanism — next message carries the updated state.

## 5. Confirm
- Test a DM. Confirm the request fires on **every** message (not just flow completion).
- Confirm fields persist between messages (send a name, then on the next message it
  shouldn't ask your name again).

---

## Known limit (do NOT try to solve here)
ManyChat's **24-hour messaging window**: you cannot freely re-message a lead who went
quiet >24h. Re-engagement belongs to the Tele-Sales / broadcast layer (Phase 4), not
this bot.
