# `.in` page — Facebook setup (ManyChat account `5567255`)

Audited 2026-09-10 against the live box. The `.in` **Facebook** page was moved to a **new,
separate** ManyChat account (`5567255`, page id `1283872341477547`); Instagram stayed on the
original account.

> ⚠️ **Read this first.** The Facebook page does **not** run the AI bot. The client built a
> **native ManyChat capture flow** — ManyChat runs the whole conversation itself and n8n is only
> a **sink** at the very end. That is the same shape as the viral / Faheem / Hakeem flows, and it
> is a perfectly valid architecture. It just means several things people assume are wrong:
>
> - **The ManyChat API key is NOT used by this flow.** n8n never sends a message here, so no
>   Send-API token is needed. The token only matters for the AI-bot shape (§3).
> - The Facebook page posts to **`5d6ecc00-f91b-4452-a06a-b38c3a0e154d`**, which belongs to
>   **`8yGvAmoeoeT4pI2K` "My workflow"** — the legacy main-page pipeline, *not* the `.in` bot.
> - The blank `instagram_in!A1` header (see [`account.md`](./account.md)) does **not** affect this
>   flow. It breaks the AI bot only.

## 1. How the Facebook flow actually runs today

```
User comments on a Post/Reel  (or sends a matching keyword)
  → Send Message #3   "Let's plan your perfect trip!"  [Plan my trip!]
  → Q1 destination      (Waiting for Text)
  → Q2 which month      (Waiting for Text)
  → Q3 WhatsApp number  (Waiting for Text)
  → Send Message #10  "Thanks for sharing your number!"
  → Randomizer 50/50 → Set assignee = Jasmine / Jensica
  → Actions #1  External Request → n8n
```

n8n side (`8yGvAmoeoeT4pI2K`, branch `Webhook3`):

```
Webhook3 → Code6 → Code7 (budget parse) → Append row "New IG Leads 6"
  → Switch → "Jasmine 2.1" / "Jensica 2.1" → HTTP Request1 (Workpex) → Send to Custom CRM
```

Verified working end to end 2026-09-10 — sheet write ✅, Workpex `Form submitted successfully` ✅,
CRM `created: true` with real UUIDs ✅.

### Request body the flow sends

```json
{
  "name": "<Full Name>",        "destination": "<destination1>",
  "travelers": "<pax>",         "contact_number": "<contact_number>",
  "budget": "<budget>",         "travel_date": "<travel_date>",
  "assignee": "<assignee>"
}
```

## 2. Open defects (2026-09-10)

### 🔴 `travelers` and `budget` never resolve — every lead loses both
The pills look correct in the ManyChat editor but arrive as literal text:

```json
"travelers": "{{cuf_14911130}}",   "budget": "{{cuf_14911121}}"
```

Across 18 sampled live executions, **100%** had unresolved tags, in two populations
(`14911121/14911130` ×14, `14910836/14910845` ×4). Neither set exists in account `5567255`,
whose real ids are `pax` = `14952106` and `budget` = `14952097` — so the flow was **copied from
another ManyChat account** and the pills kept dead foreign ids.

Downstream effect: `Code in JavaScript7` computes `travel_budget: 0` every time, `travelers`
lands empty, and the CRM scores **every lead `temperature: "cold"`**.

**Fix (ManyChat UI only):** delete those two pills and re-insert them with the **field picker**
inside account `5567255`. Never retype a `{{cuf_…}}` by hand. This is the same bug that cost
Faheem 100 leads of blank Destination.

### 🔴 Duplicated comment triggers — the opener fires twice, then the flow stalls
All 8 growth tools are 4 real ones, each existing **twice**:

| name | ids |
|---|---|
| Facebook Comments #54 | `59753998`, `59754047` |
| Facebook Comments #4 copy copy | `59754000`, `59754033` |
| Facebook Comments #5 copy copy | `59754027`, `59754032` |
| Facebook Comments #7 copy copy | `59754034`, `59754042` |

One comment trips two triggers, so the contact gets the opening message twice and the two flow
copies then contend for the conversation — which is why a contact can answer Q1 and never be
asked Q2. The account also holds redundant flow copies: `Facebook flow`, `Facebook flow copy 1`,
`For Outbound.in`, `For Outbound.in copy`, `Outbound.in FB`, `Updated flow_2026` ×3.

**Fix (ManyChat UI only):** delete one of each duplicated growth tool, and delete the unused flow
copies so exactly one flow owns the Facebook entry points.

### 🟠 Source attribution needs one line from ManyChat
`Send to Custom CRM` used to hardcode `source: 'instagram_main'`, so `.in` Facebook leads were
filed as main-page leads. It is now **channel-driven** (changed 2026-09-10):

```js
const _ch = cl(b.channel).toLowerCase();
const _ok = ['whatsapp','instagram_in','instagram_main','facebook','website'];
const src = _ok.indexOf(_ch) >= 0 ? _ch : 'instagram_main';
```

It could not simply be set to `facebook`: **at least two different ManyChat accounts post to this
one webhook** with byte-identical payloads, and the request carries no page identifier
(`user-agent: ManyChat`, empty query, nothing in the body), so n8n cannot tell them apart.
Hardcoding would have mislabelled the other page.

**To make it correct, add one typed line** to the `.in` Facebook flow's External Request body
(typed text, **not** a field pill):

```json
"channel": "facebook"
```

Until that line exists every lead keeps `instagram_main`, exactly as before — the change is a
no-op by design. The `_ok` whitelist also means a typo'd value falls back safely instead of
422-ing the CRM push.

### 🟠 No contact key → repeat enquiries duplicate
The body omits ManyChat's **Contact Id**, and the sheet node uses plain `Append`, so one person
going through the flow twice creates two rows and two CRM leads. Reported, not fixed (2026-09-10)
— the real fix needs both halves shipped together: send `ig_user_id` = Contact Id **and** switch
the node to Append-or-Update keyed on it.

### ✅ Fixed 2026-09-10 — duplicate webhook landmine
`5d6ecc00-…` was bound to **two** nodes, `Webhook2` and `Webhook3`. Only `Webhook3` was firing
(the branch with the CRM push); `Webhook2` routed to the old `IG Leads 4` tab and the dead
`admin.workpex.com` host with **no CRM push at all**. A deactivate/reactivate could have rebound
the live path to `Webhook2` and silently stopped every lead reaching the CRM, while looking
healthy from ManyChat. `Webhook2` is now on `legacy-webhook2-do-not-use-5d6ecc00`; its branch is
left intact. Backup: [`../_backups/8yGvAmoeoeT4pI2K.pre-fb-source-fix-2026-09-10.json`](../_backups/8yGvAmoeoeT4pI2K.pre-fb-source-fix-2026-09-10.json).

## 3. The AI-bot alternative (built and ready, currently unused)

If you ever want Facebook to run the **AI bot** (`ig-lead-bot`) instead of the native flow, the
n8n side is already done — this is where the new API token matters:

| Channel | ManyChat account | n8n credential |
|---|---|---|
| Instagram | original | **"ManyChat API"** (`WRHI5I3GZm4zJCrl`) |
| Facebook | `5567255` | **"ManyChat API — Outbound.in FB (acct 5567255)"** (`JxRGU6CA1s9vbhMs`) |

Patched into `AfmPZXhWMetbxHTl`, `hJyzlj8So1Hyx2Ci` and the watchdog `k1wn27UPxDASHP5Y` via a
`Route channel?` switch on `channel_label`. Verified: a `channel: "facebook"` payload took the
Facebook branch, the Instagram node did not run, and ManyChat answered `400 "Subscriber does not
exist"` for a fake subscriber — not `401`, proving the new token authenticates.

To switch over you would: point Default Reply → External Request at
`https://n8n.srv1159219.hstgr.cloud/webhook/ig-lead-bot`, send `"channel": "facebook"` (**not**
`messenger`), map `$.reply` → `bot reply` with the PENDING gate, **and first fix the blank
`instagram_in!A1` header** or the AI bot will chat perfectly and save nothing.
