// ------------------------------------------------------------------
//  Simple JSON-file message store.
//  v1 persistence: one file, read-modify-write. Swap for Postgres/
//  Prisma later — the call sites below are the only interface.
//  Shape mirrors Meta Cloud API so the DB migration stays clean.
// ------------------------------------------------------------------
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'store.json');

function nowTime() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function seed() {
  return {
    conversations: {
      '919876543210': {
        id: '919876543210',
        name: 'Priya Sharma',
        phone: '+91 98765 43210',
        color: '#0a7cff',
        unread: 0,
        autoReply: true,
        updatedAt: Date.now() - 60000,
        messages: [
          { id: 'm1', dir: 'in', text: 'Hi! I saw your Bali package on Instagram ✨', t: '10:24' },
          { id: 'm2', dir: 'out', text: "Hi Priya! 🌴 I'm Rahul from Outbound Travelers. Which destination are you dreaming of?", t: '10:24', status: 'read', source: 'ai' },
          { id: 'm3', dir: 'in', text: 'Bali for our honeymoon 💍', t: '10:25' },
          { id: 'm4', dir: 'out', text: 'Lovely! What travel date are you looking at?', t: '10:25', status: 'read', source: 'ai' },
        ],
      },
      '919812345678': {
        id: '919812345678',
        name: 'Arjun Mehta',
        phone: '+91 98123 45678',
        color: '#e542a3',
        unread: 2,
        autoReply: false,
        updatedAt: Date.now() - 30000,
        messages: [
          { id: 'a1', dir: 'out', text: 'Hi Arjun! Which destination are you planning? ✈️', t: '09:02', status: 'read', source: 'ai' },
          { id: 'a2', dir: 'in', text: 'Thailand', t: '09:40' },
          { id: 'a3', dir: 'in', text: 'Phuket + Krabi if possible', t: '09:41' },
        ],
      },
    },
  };
}

function read() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE)) {
      const s = seed();
      fs.writeFileSync(FILE, JSON.stringify(s, null, 2));
      return s;
    }
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    return { conversations: {} };
  }
}

function write(db) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

const colors = ['#0a7cff', '#e542a3', '#f5a623', '#7e57c2', '#26a69a', '#ef5350'];
function pickColor(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % colors.length;
  return colors[h];
}

export function listConversations() {
  const db = read();
  return Object.values(db.conversations)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      color: c.color,
      unread: c.unread || 0,
      autoReply: !!c.autoReply,
      takeover: Date.now() < (c.humanTakeoverUntil || 0),
      last: c.messages[c.messages.length - 1] || null,
    }));
}

export function getConversation(id) {
  const db = read();
  return db.conversations[id] || null;
}

// Ensure a conversation exists (inbound from an unknown number creates one).
export function upsertConversation(id, { name, phone } = {}) {
  const db = read();
  if (!db.conversations[id]) {
    db.conversations[id] = {
      id,
      name: name || phone || `+${id}`,
      phone: phone || `+${id}`,
      color: pickColor(id),
      unread: 0,
      autoReply: true,
      updatedAt: Date.now(),
      messages: [],
    };
    write(db);
  } else if (name && db.conversations[id].name?.startsWith('+')) {
    db.conversations[id].name = name;
    write(db);
  }
  return db.conversations[id];
}

export function addMessage(id, msg) {
  const db = read();
  const conv = db.conversations[id];
  if (!conv) return null;
  const m = {
    id: msg.id || 'm_' + Math.floor(Date.now() + Math.random() * 1000),
    dir: msg.dir,
    text: msg.text,
    t: msg.t || nowTime(),
    status: msg.dir === 'out' ? msg.status || 'sent' : undefined,
    source: msg.source, // 'ai' | 'human' | undefined
    buttons: msg.buttons,
    media: msg.media, // { kind, url, mime, filename, caption } | undefined
  };
  conv.messages.push(m);
  conv.updatedAt = Date.now();
  if (msg.dir === 'in') conv.unread = (conv.unread || 0) + 1;
  write(db);
  return m;
}

export function setStatus(id, messageId, status) {
  const db = read();
  const conv = db.conversations[id];
  if (!conv) return;
  const m = conv.messages.find((x) => x.id === messageId);
  if (m) { m.status = status; write(db); }
}

export function markRead(id) {
  const db = read();
  const conv = db.conversations[id];
  if (conv) { conv.unread = 0; write(db); }
}

export function setAutoReply(id, value) {
  const db = read();
  const conv = db.conversations[id];
  if (conv) { conv.autoReply = !!value; write(db); }
  return conv;
}

// ---- Human takeover (15-min auto-resume) ----------------------------------
// When a human agent sends, the bot pauses on that chat; the window refreshes
// on every human message and lapses after TAKEOVER_MINUTES of silence.
const TAKEOVER_MS = (Number(process.env.TAKEOVER_MINUTES) || 15) * 60 * 1000;

export function markHumanSend(id) {
  const db = read();
  const conv = db.conversations[id];
  if (!conv) return null;
  conv.humanTakeoverUntil = Date.now() + TAKEOVER_MS;
  write(db);
  return conv.humanTakeoverUntil;
}

export function getTakeover(id) {
  const conv = getConversation(id);
  const until = conv?.humanTakeoverUntil || 0;
  return { active: Date.now() < until, until, remainingMs: Math.max(0, until - Date.now()) };
}

// Hand the chat back to the bot immediately (agent clicked "give back to bot").
export function clearTakeover(id) {
  const db = read();
  const conv = db.conversations[id];
  if (conv) { conv.humanTakeoverUntil = 0; write(db); }
  return conv || null;
}

// Merge extracted lead fields onto a conversation (destination, travel_date, pax, ...).
export function setLead(id, partial) {
  const db = read();
  const conv = db.conversations[id];
  if (!conv) return null;
  conv.lead = { ...(conv.lead || {}), ...partial };
  write(db);
  return conv.lead;
}
