# Connecting the n8n WhatsApp bot to the Console

The console is a **UI for the existing n8n bot** (`qx4PSZuDK6b6Q642`). n8n stays the
brain (AI, Sheets, CRM). We add **3 small nodes** to the live workflow so the console
can (a) **see every message** and (b) **pause the bot during human takeover**.

Meta's webhook stays pointed at n8n — **nothing about the Meta setup changes.**

```
Meta ──▶ n8n  ──(A) mirror inbound──▶  Console /api/ingest
              ──(B) check takeover──▶  Console /api/takeover/:id   (skip reply if active)
              ──(C) mirror reply────▶  Console /api/ingest
```

> `CONSOLE_URL` below = the public URL of the console. Locally: a tunnel
> (`cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`).
> Production: the deployed URL (developer's job).

---

## Node A — Mirror the inbound message (visibility)

Place **right after `Normalize input`** (once `from`/`text` are parsed).

- **Type:** HTTP Request
- **Method:** POST
- **URL:** `={{ $env.CONSOLE_URL }}/api/ingest`  (or hardcode the URL)
- **Headers:** `x-ingest-secret: <INGEST_SECRET>` (only if you set that env on the console)
- **Body (JSON):**
  ```json
  {
    "from": "={{ $json.from }}",
    "name": "={{ $json.profile_name }}",
    "direction": "in",
    "text": "={{ $json.text }}"
  }
  ```
- **Settings:** *Continue On Fail = ON* (a console hiccup must never break the bot).

---

## Node B — Check human takeover (pause the bot)

Place **just before the AI / `Send reply (Meta API)` node.**

1. **HTTP Request** — "Check takeover"
   - **Method:** GET
   - **URL:** `={{ $env.CONSOLE_URL }}/api/takeover/{{ $json.from }}`
   - **Settings:** *Continue On Fail = ON*, low timeout (~3s). On failure the next
     node sees no `active` field → treat as **not** in takeover (fail-open: bot replies).
2. **IF** — "Human handling?"
   - Condition: `={{ $json.active }}` is **true**
   - **true →** stop (do nothing — the human is answering; do NOT call the AI/Send).
   - **false →** continue to the AI + `Send reply` as normal.

> Result: if an agent sent a message from the console in the last 15 minutes, n8n
> stays silent on that chat. After 15 min of agent silence the console reports
> `active:false` again and the bot resumes automatically.

---

## Node C — Mirror the bot's reply (visibility)

Place **right after `Send reply (Meta API)`** succeeds.

- **Type:** HTTP Request — POST — `={{ $env.CONSOLE_URL }}/api/ingest`
- **Body (JSON):**
  ```json
  {
    "from": "={{ $json.from }}",
    "direction": "out",
    "source": "ai",
    "text": "={{ $json.reply_text }}"
  }
  ```
- **Settings:** *Continue On Fail = ON*.

*(Adjust `$json.reply_text` / `$json.from` to whatever those nodes actually expose.)*

---

## Console endpoints (reference)

| Endpoint | Method | Used by | Purpose |
|---|---|---|---|
| `/api/ingest` | POST | n8n A, C | mirror a message into the console |
| `/api/takeover/:id` | GET | n8n B | `{ active, remainingSeconds }` — is a human handling this chat? |
| `/api/takeover/:id` | DELETE | console UI | agent clicked "hand back to bot" |
| `/api/send` | POST | console UI | agent sends text via Meta (arms the 15-min timer) |
| `/api/send-media` | POST | console UI | agent sends a file via Meta (arms the timer) |

## Env on the console

```
TAKEOVER_MINUTES=15          # auto-resume window (default 15)
INGEST_SECRET=<random>       # optional: require this header on /api/ingest
WHATSAPP_PHONE_NUMBER_ID=900006843195557
WHATSAPP_TOKEN=<meta token>  # so the console can send directly via Meta
```

## Rollback

The 3 nodes are additive and each is *Continue On Fail*. To revert, delete nodes
A/B/C (and the IF). The bot returns to its exact previous behaviour.
