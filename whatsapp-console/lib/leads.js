// ------------------------------------------------------------------
//  Lead orchestration: read a conversation -> extract fields -> cache
//  on the conversation -> upsert the Google Sheet row.
// ------------------------------------------------------------------
import { getConversation, setLead } from './store.js';
import { extractLead } from './extract.js';
import { upsertLead, sheetsEnabled } from './sheets.js';

function formatWhatsapp(from) {
  // 919876543210 -> "+91 98765 43210"
  const m = from.match(/^(\d{2})(\d{5})(\d{5})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]}` : `+${from}`;
}

export async function saveLeadFromConversation(id) {
  const conv = getConversation(id);
  if (!conv) return null;

  const fields = await extractLead(conv);
  const lead = {
    ig_user_id: id,
    ig_username: conv.name && !conv.name.startsWith('+') ? conv.name : '',
    whatsapp_number: formatWhatsapp(id),
    ...fields,
  };

  setLead(id, lead); // cache on the conversation for the UI lead strip

  if (sheetsEnabled()) {
    const res = await upsertLead(lead);
    setLead(id, { sheet_status: res.status, sheet_synced: true });
    return { lead, sheet: res };
  }
  setLead(id, { sheet_synced: false });
  return { lead, sheet: { skipped: true } };
}
