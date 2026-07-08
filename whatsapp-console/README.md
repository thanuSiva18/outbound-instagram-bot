# Outbound WhatsApp Console

A web dashboard that **looks like WhatsApp** and lets your team **send and receive
WhatsApp messages** through the **Meta Cloud API** — with an optional **AI auto-reply**
(the "Rahul" travel-assistant flow) you can toggle on/off per chat for human takeover.

Built with **Next.js (App Router)** — one app, frontend + backend together.

```
WhatsApp user ──▶ Meta Cloud API ──▶ /api/webhook ──▶ AI (if ON) ──▶ Meta send
       ▲                                   │
       └──── you texting from the UI ◀── /api/send ◀── React dashboard (live poll)
```

---

## Quick start (works in 30 seconds, no Meta account needed)

```bash
cd whatsapp-console
npm install
npm run dev
```

Open <http://localhost:3000>. It boots in **SIMULATION MODE** (orange banner top):
you can click chats, send messages, toggle the AI, and click **🧪 Test inbound** to
fake a customer reply — the whole pipeline runs locally so you can demo the UX before
any credentials exist.

---

## Going LIVE with Meta (your real number +91 9597959728)

1. **Copy env file**

   ```bash
   cp .env.local.example .env.local
   ```

2. **Fill in** `.env.local`:
   - `WHATSAPP_PHONE_NUMBER_ID` — already pre-filled (`900006843195557`).
   - `WHATSAPP_TOKEN` — a **permanent System User token** from
     Meta Business Settings (NOT the 24h temp token).
   - `WHATSAPP_VERIFY_TOKEN` — any string; you'll paste the same one into Meta.

   The moment `WHATSAPP_TOKEN` is set, the banner turns **green (LIVE)** and sends hit
   the real Graph API.

3. **Expose the webhook.** Meta needs a public HTTPS URL. In dev, tunnel it:

   ```bash
   npx ngrok http 3000
   ```

   Your webhook URL is: `https://<your-ngrok>.ngrok.app/api/webhook`

4. **Register in Meta** → WhatsApp → Configuration → Edit webhook:
   - **Callback URL:** the ngrok URL above
   - **Verify token:** the same `WHATSAPP_VERIFY_TOKEN` value
   - Click **Verify and Save** (our `GET /api/webhook` answers the handshake)
   - Under **Manage**, subscribe to the **messages** field.

5. **Restart** `npm run dev` after editing `.env.local`. Send a WhatsApp to your
   business number → it appears live in the dashboard.

> ⚠️ This console runs **alongside** your existing n8n lead-capture bot — they both
> can't own the *same* Meta webhook at once. Point Meta at **one** of them. For testing
> the console, temporarily switch the webhook here; switch back to n8n when done. (A
> later step can fan-out: one webhook → both n8n + this UI.)

---

## Google Sheet lead capture (reuses the live bot's tab)

Every inbound message runs a lead **extractor** (same AI provider, with a regex
fallback) and upserts a row in the `whatsapp leads` tab — the **same 13-column Rahul
schema** (`ig_user_id` … `notes - AI`) and the same `ig_user_id` match key as the n8n
bot, so no duplicate rows. Captured fields show in the **lead strip** under each chat
header, with a live "✓ Synced to Sheet" badge.

**Enable it:**
1. In Google Cloud: create a **service account**, enable the **Google Sheets API**,
   download its JSON key.
2. **Share the spreadsheet** with the service-account email (`...@...iam.gserviceaccount.com`)
   as **Editor**.
3. Put `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `SHEET_ID`,
   `SHEET_TAB` in `.env.local`. Without these, capture is skipped (app still runs).

Logic lives in [`lib/leads.js`](lib/leads.js) (orchestration), [`lib/extract.js`](lib/extract.js)
(field extraction), [`lib/sheets.js`](lib/sheets.js) (append-or-update, preserves `first_contact_ts`).

## Media (images / PDFs / docs)

- **Send:** click the 📎 in the composer → pick a file → it's stored under
  `public/uploads/`, and in **live mode** uploaded to Meta (`/media`) and sent by id
  (no public URL needed). Add a caption by typing before you attach.
- **Receive:** inbound photos/docs are downloaded from Meta to `public/uploads/` and
  rendered in the thread (image preview / document chip).
- **Try it in simulation:** the 🖼 **Photo** button fakes an inbound image.

Code: [`lib/meta.js`](lib/meta.js) (`uploadMedia`/`sendMedia`/`downloadMedia`),
[`lib/media.js`](lib/media.js) (local storage), [`app/api/send-media/route.js`](app/api/send-media/route.js).

## AI auto-reply ("Anant" / the bot brain)

Priority order, auto-detected from env:

| Provider  | Env var             | Notes                                  |
|-----------|---------------------|----------------------------------------|
| Anthropic | `ANTHROPIC_API_KEY` | **Recommended.** `AI_MODEL` default = `claude-haiku-4-5-20251001` |
| OpenAI    | `OPENAI_API_KEY`    | Matches your current n8n bot (`gpt-4o-mini`) |
| _none_    | —                   | Deterministic scripted Rahul flow      |

Toggle the **🤖 AI ON/OFF** switch in any chat header:
- **ON** → bot answers inbound messages automatically.
- **OFF** → human takeover; you type the replies yourself.

The system prompt (the 3-field destination → travel_date → pax script) lives in
[`lib/ai.js`](lib/ai.js) — edit it to change the bot's behaviour.

---

## Project map

| Path | What it does |
|------|--------------|
| [`app/page.js`](app/page.js) | The WhatsApp UI (client, live-polls every 2.5s) |
| [`app/globals.css`](app/globals.css) | All the WhatsApp styling |
| [`app/api/webhook/route.js`](app/api/webhook/route.js) | Meta verify (GET) + inbound/status (POST) |
| [`app/api/send/route.js`](app/api/send/route.js) | Agent sends from the dashboard |
| [`app/api/simulate/route.js`](app/api/simulate/route.js) | Dev: inject a fake inbound message |
| [`app/api/conversations/`](app/api/conversations/) | List threads / get one / mark read / toggle AI |
| [`lib/store.js`](lib/store.js) | JSON-file message store (swap for Postgres later) |
| [`lib/meta.js`](lib/meta.js) | Meta Graph API send (text + interactive buttons) |
| [`lib/ai.js`](lib/ai.js) | Pluggable AI reply (Claude / OpenAI / scripted) |
| [`lib/inbound.js`](lib/inbound.js) | Shared inbound pipeline (webhook + simulate) |

---

## Roadmap

Done in this build:
- [x] Send / receive via Meta Cloud API (live) + full simulation mode.
- [x] Per-chat AI auto-reply toggle (Claude / OpenAI / scripted).
- [x] **Google Sheet** lead capture (`whatsapp leads`, 13-col Rahul schema).
- [x] **Media** (images / PDFs / docs) send + receive.

For the developer to continue:
- [ ] Swap the JSON store for **Postgres/SQLite** (multi-agent, durable) — interface is `lib/store.js`.
- [ ] **WebSocket/SSE** instead of 2.5s polling for instant inbound.
- [ ] **Auth** (agent login) + per-agent conversation assignment.
- [ ] Map Meta message IDs → exact **delivered/read** ticks (currently best-effort).
- [ ] One webhook → **fan-out** to both n8n and this console (so both can run at once).
- [ ] Move media storage to **S3/Cloudinary** for multi-server deploys (only `lib/media.js` changes).

---

## Notes for the developer

- **Stack:** Next.js 14 App Router, plain JavaScript (no TS), no DB — a JSON file at
  `data/store.json` (gitignored, auto-seeded on first run).
- **Secrets:** all in `.env.local` (gitignored). The repo ships `.env.local.example`.
  Nothing sensitive is committed. The app runs with an empty `.env.local` (simulation).
- **Where to start:** `lib/` holds all the integration logic; `app/api/` the routes;
  `app/page.js` the whole UI. Each file has a header comment explaining its job.
- **Live test checklist:** (1) put the Meta token in `.env.local`; (2) `npm run dev`;
  (3) `npx ngrok http 3000`; (4) register `https://<ngrok>/api/webhook` + the verify
  token in Meta → WhatsApp → Configuration, subscribe to **messages**; (5) text the
  business number. ⚠️ Meta sends inbound to ONE webhook — point it here OR at n8n, not both.
