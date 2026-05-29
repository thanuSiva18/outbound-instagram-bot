// ─────────────────────────────────────────────────────────────────────────
// NODE: "Normalize input"  (Code node, runs once, mode: "Run Once for All Items")
// Pulls the ManyChat webhook payload into clean JSON for the OpenAI node.
//
// ⚠️ GOTCHA (CLAUDE.md §4.0): the webhook payload lives under $json.body,
//    NOT $json. Read every ManyChat field from $json.body.*
// ⚠️ Code node MUST return [{ json: { ... } }].
// ─────────────────────────────────────────────────────────────────────────

const body = $json.body || $json || {};

const s = (v) => (v === undefined || v === null ? '' : String(v).trim());

// Field values ManyChat carries from its Custom User Fields (may be empty "").
const known = {
  name:            s(body.name),
  whatsapp_number: s(body.whatsapp_number),
  destination:     s(body.destination),
  pax:             s(body.pax),
  budget:          s(body.budget),
};

return [{
  json: {
    ig_user_id:        s(body.ig_user_id),
    ig_username:       s(body.ig_username),
    user_message:      s(body.message_text),
    known_fields:      known,
    known_fields_json: JSON.stringify(known),
  },
}];
