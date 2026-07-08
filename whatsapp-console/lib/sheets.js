// ------------------------------------------------------------------
//  Google Sheets writer — appends/updates the `whatsapp leads` tab,
//  matching the live n8n bot's 13-column Rahul schema (A..M).
//  Auth: a Google SERVICE ACCOUNT (share the sheet with its email as
//  Editor). No-ops gracefully when not configured, so the app still
//  runs without Google credentials.
// ------------------------------------------------------------------
import { JWT } from 'google-auth-library';

const HEADERS = [
  'ig_user_id', 'ig_username', 'destination', 'normalized_destination', 'travel_date',
  'pax', 'whatsapp_number', 'status', 'quick_assistance', 'first_contact_ts',
  'last_update_ts', 'assigned_to', 'notes - AI',
]; // A..M

export function sheetsEnabled() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
    process.env.SHEET_ID
  );
}

const TAB = () => process.env.SHEET_TAB || 'whatsapp leads';

let _client;
async function client() {
  if (_client) return _client;
  _client = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  await _client.authorize();
  return _client;
}

const BASE = () => `https://sheets.googleapis.com/v4/spreadsheets/${process.env.SHEET_ID}`;

async function api(method, url, body) {
  const c = await client();
  const { token } = await c.getAccessToken();
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Sheets ${method} ${res.status}: ${await res.text()}`);
  return res.json();
}

function istNow() {
  // YYYY-MM-DD HH:MM:SS in Asia/Kolkata
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

// Read column A (ig_user_id) to find an existing row index (1-based incl header).
async function findRow(igUserId) {
  const enc = encodeURIComponent(`${TAB()}!A:A`);
  const data = await api('GET', `${BASE()}/values/${enc}`);
  const rows = data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][0] || '').toString() === igUserId) {
      return { rowNumber: i + 1 }; // sheet rows are 1-based
    }
  }
  return null;
}

async function getRowValues(rowNumber) {
  const enc = encodeURIComponent(`${TAB()}!A${rowNumber}:M${rowNumber}`);
  const data = await api('GET', `${BASE()}/values/${enc}`);
  return (data.values && data.values[0]) || [];
}

// lead: { ig_user_id, ig_username, destination, normalized_destination, travel_date,
//         pax, whatsapp_number, quick_assistance, notes }
export async function upsertLead(lead) {
  if (!sheetsEnabled()) return { skipped: 'sheets not configured' };

  const now = istNow();
  const existing = await findRow(lead.ig_user_id);
  let first = now;
  let assigned = '';
  if (existing) {
    const cur = await getRowValues(existing.rowNumber);
    first = cur[9] || now;        // preserve first_contact_ts (col J)
    assigned = cur[11] || '';     // preserve assigned_to (col L)
  }

  const filled = [lead.destination, lead.travel_date, lead.pax, lead.whatsapp_number].every(Boolean);
  const status = filled ? 'qualified' : existing ? 'in_progress' : 'new';

  const row = [
    lead.ig_user_id || '',
    lead.ig_username || '',
    lead.destination || '',
    lead.normalized_destination || '',
    lead.travel_date || '',
    lead.pax || '',
    lead.whatsapp_number || '',
    status,
    lead.quick_assistance || '',
    first,
    now,
    assigned,
    lead.notes || '',
  ];

  if (existing) {
    const enc = encodeURIComponent(`${TAB()}!A${existing.rowNumber}:M${existing.rowNumber}`);
    await api('PUT', `${BASE()}/values/${enc}?valueInputOption=USER_ENTERED`, { values: [row] });
    return { updated: existing.rowNumber, status };
  }
  const enc = encodeURIComponent(`${TAB()}!A:M`);
  await api('POST', `${BASE()}/values/${enc}:append?valueInputOption=USER_ENTERED`, { values: [row] });
  return { appended: true, status };
}

export { HEADERS };
