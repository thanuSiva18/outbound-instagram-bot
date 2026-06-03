# Plan — Intent-aware Priya (NOT YET APPLIED)

> Status: **PLANNED, awaiting approval.** Do not deploy until Faheem confirms.
> Goal: Priya should recognise WHY someone is DMing and respond right, instead
> of forcing every message into the 5-field travel-lead funnel.

## The 4 intents

| Intent | Trigger examples | Priya's behavior | Sheet? |
|--------|------------------|------------------|--------|
| **travel_lead** | "want to go Bali", "trip for 4", any travel interest | Run the existing 5-field flow (name → destination → pax → whatsapp → budget). UNCHANGED. | ✅ save lead |
| **office_info** | "where's your office?", "timings?", "contact number?", "are you open?" | Answer directly from business facts (address / hours / phone / map). Then warmly offer: "planning a trip? I can help right here 😊" | ❌ no |
| **career** | "are you hiring?", "job", "resume", "vacancy", "career" | Warm reply + redirect to careers page: https://www.outboundtravelers.com/careers | ❌ no |
| **customer_query** | "where's my booking?", "what's in the package?", "visa?", existing-customer questions | Answer what's general. Only if SERIOUS (wants a quote/booking) give the WhatsApp number; otherwise just answer + invite them to plan. | ❌ no (v1) |

## Business facts Priya will use (office_info)
- **Address:** First Floor, Me Diagnostic Centre, No.15-274E, Nagercoil, Tamil Nadu 629003
- **Phone:** 079040 27064
- **Hours:** Mon–Sat 9am–6pm, **Sunday closed**
- **Map:** https://share.google/idBAL5lUH8U9qzXmR
- **Careers:** https://www.outboundtravelers.com/careers
- **Website:** https://www.outboundtravelers.com
- **Sales WhatsApp (SERIOUS leads ONLY):** +91 9597959728

## ⚠️ WhatsApp redirect rule (important)
The WhatsApp number is a GATE for hot leads, not a catch-all. Priya gives it out
ONLY when the inquiry is genuinely serious, e.g.:
- the lead has shared real trip details (destination + pax, ideally budget), OR
- they explicitly ask to talk to someone / book / get a quote / "send details".
Do NOT give WhatsApp for: casual questions, office-info, career, vague browsing,
or before the lead has shown real intent. For those, answer in chat only.
When a lead qualifies (all 5 fields), the closing message SHOULD include the
WhatsApp number so they can continue with a human.

## Design (how it's built)
1. **System prompt** (in Normalize node) gets a new top section:
   "First, classify the user's intent: travel_lead | office_info | career | customer_query.
    Then respond per the rules for that intent." + the business facts block + the
    existing 5-field flow (only runs for travel_lead).
2. **JSON output** gains an `intent` field so Parse can branch:
   `{ reply, intent, fields:{...}, status }`.
3. **Parse + validate**: only treat it as a lead (write name/dest/etc + status logic)
   when `intent === "travel_lead"`. For other intents, still reply, but DON'T
   overwrite lead fields / don't force status. Sheet stays lead-only.
4. **Save lead**: unchanged node, but only meaningfully writes for travel_lead rows.
   (Open question: skip the Sheet write entirely for non-lead intents — see below.)

## Open questions before building
- **Mixed intent:** if someone asks "what time you open? also I want Bali for 4" —
  treat as travel_lead (answer hours in the reply, then continue capture). [proposed]
- **Returning lead asks office info mid-capture:** answer the info, then resume the
  next missing field. (Memory already supports this.)
- **Sheet for non-leads:** v1 = do not write non-lead intents at all. Confirmed.
- **Customer_query depth:** v1 keeps it light (general answer + route to WhatsApp).
  Deep booking lookups are out of scope.

## Test cases to run after building
- "are you hiring?" → careers URL, no lead flow, no sheet row
- "where is your office?" → address+hours, no sheet row
- "you open on sunday?" → "Sunday we're closed, open Mon–Sat 9–6"
- "what's included in Bali package?" → general answer + offer to plan
- "hi I want Thailand for 3" → normal lead flow (regression check)
- "office timing? and I want Bali trip" → answers hours AND starts capture
