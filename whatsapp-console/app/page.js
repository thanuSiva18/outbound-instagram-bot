'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

const TICK = (
  <svg className="ticks" viewBox="0 0 16 11" fill="none">
    <path d="M11.07.65a.5.5 0 0 0-.7.05L5.3 6.9 3.4 5a.5.5 0 1 0-.7.72l2.3 2.3a.5.5 0 0 0 .73-.04L11.12 1.3a.5.5 0 0 0-.05-.65z" fill="currentColor" />
    <path d="M15.07.65a.5.5 0 0 0-.7.05L9.3 6.9l-.32-.33-.72.9.55.56a.5.5 0 0 0 .73-.04L15.12 1.3a.5.5 0 0 0-.05-.65z" fill="currentColor" />
  </svg>
);

const initials = (name = '') =>
  name.replace(/^\+/, '').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '#';

const fmtCountdown = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
};

const SIM_LINES = [
  'How much would the package cost?',
  'Can you share a brochure?',
  'Around 15th August works for us',
  'Just 2 of us travelling',
  'Yes please, go ahead 🙏',
  'Do you have Maldives too?',
];

function MediaView({ media }) {
  if (media.kind === 'image' && media.url) {
    return <a href={media.url} target="_blank" rel="noreferrer"><img className="media-img" src={media.url} alt={media.filename || 'image'} /></a>;
  }
  const ext = (media.filename || '').split('.').pop()?.toUpperCase().slice(0, 4) || 'FILE';
  return (
    <a className="media-doc" href={media.url || '#'} target="_blank" rel="noreferrer" download>
      <span className="ext">{ext}</span>
      <span className="fn">{media.filename || `${media.kind} file`}</span>
    </a>
  );
}

function LeadStrip({ lead }) {
  if (!lead) return null;
  const has = lead.destination || lead.travel_date || lead.pax || lead.quick_assistance;
  if (!has) return null;
  return (
    <div className="lead-strip">
      📋
      {lead.destination ? <span className="pill"><b>Dest:</b> {lead.normalized_destination || lead.destination}</span> : null}
      {lead.travel_date ? <span className="pill"><b>Date:</b> {lead.travel_date}</span> : null}
      {lead.pax ? <span className="pill"><b>Pax:</b> {lead.pax}</span> : null}
      {lead.quick_assistance ? <span className="pill"><b>Callback:</b> {lead.quick_assistance}</span> : null}
      {lead.sheet_status ? <span className="pill"><b>Status:</b> {lead.sheet_status}</span> : null}
      <span className={`sync ${lead.sheet_synced ? 'ok' : 'off'}`}>
        {lead.sheet_synced ? '✓ Synced to Sheet' : '○ Sheet not configured'}
      </span>
    </div>
  );
}

export default function Page() {
  const [convos, setConvos] = useState([]);
  const [mode, setMode] = useState('simulation');
  const [ai, setAi] = useState('scripted');
  const [activeId, setActiveId] = useState(null);
  const [conv, setConv] = useState(null);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const messagesRef = useRef(null);
  const fileRef = useRef(null);
  const activeRef = useRef(null);
  activeRef.current = activeId;

  const loadConvos = useCallback(async () => {
    const r = await fetch('/api/conversations', { cache: 'no-store' });
    const d = await r.json();
    setConvos(d.conversations || []);
    setMode(d.mode);
    setAi(d.ai);
  }, []);

  const loadThread = useCallback(async (id) => {
    if (!id) return;
    const r = await fetch(`/api/conversations/${id}`, { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    if (activeRef.current === id) setConv(d.conversation);
  }, []);

  // initial load + polling
  useEffect(() => {
    loadConvos();
    const iv = setInterval(() => {
      loadConvos();
      if (activeRef.current) loadThread(activeRef.current);
    }, 2500);
    return () => clearInterval(iv);
  }, [loadConvos, loadThread]);

  // auto-scroll on new messages
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv?.messages?.length, activeId]);

  // 1s ticker for the takeover countdown
  useEffect(() => {
    const iv = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  async function handBackToBot() {
    if (!activeId) return;
    await fetch(`/api/takeover/${activeId}`, { method: 'DELETE' });
    await loadThread(activeId);
    await loadConvos();
  }

  async function openChat(id) {
    setActiveId(id);
    setConv(null);
    await loadThread(id);
    fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markRead: true }),
    }).then(loadConvos);
  }

  async function send() {
    const text = input.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    setInput('');
    await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: activeId, text }),
    });
    await loadThread(activeId);
    await loadConvos();
    setSending(false);
  }

  async function toggleAuto() {
    if (!conv) return;
    const next = !conv.autoReply;
    setConv({ ...conv, autoReply: next });
    await fetch(`/api/conversations/${activeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoReply: next }),
    });
    loadConvos();
  }

  async function simulateInbound() {
    if (!activeId) return;
    const text = SIM_LINES[Math.floor(Math.random() * SIM_LINES.length)];
    await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: activeId, text }),
    });
    await loadThread(activeId);
    await loadConvos();
  }

  // Dev: fake an inbound photo so media rendering is visible without going live.
  async function simulateInboundImage() {
    if (!activeId) return;
    await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: activeId, text: 'Here is my passport photo 📷', media: { kind: 'image', url: '/sample.svg', mime: 'image/svg+xml', filename: 'passport.svg' } }),
    });
    await loadThread(activeId);
    await loadConvos();
  }

  async function uploadFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeId) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('to', activeId);
    fd.append('caption', input.trim());
    setInput('');
    await fetch('/api/send-media', { method: 'POST', body: fd });
    await loadThread(activeId);
    await loadConvos();
  }

  const filtered = convos.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const hasText = input.trim().length > 0;

  return (
    <div className="app">
      <div className={`mode-tag ${mode === 'live' ? 'mode-live' : 'mode-sim'}`}>
        {mode === 'live' ? '● LIVE — Meta Cloud API connected' : '● SIMULATION — add Meta token to go live'} · AI: {ai}
      </div>

      {/* ---------------- Sidebar ---------------- */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="avatar" style={{ background: '#00a884' }}>OT</div>
          <div className="header-icons">
            <button className="icon-btn" title="New chat">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.005 3.175H4.674C3.642 3.175 3 3.789 3 4.821V21.02l3.544-3.514h12.461c1.033 0 2.064-1.06 2.064-2.093V4.821c-.001-1.032-1.032-1.646-2.064-1.646zm-4.989 9.869H7.041V11.1h6.975v1.944zm3-4H7.041V7.1h9.975v1.944z" /></svg>
            </button>
            <button className="icon-btn" title="Menu">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 12 9zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 12 15z" /></svg>
            </button>
          </div>
        </div>

        <div className="search-wrap">
          <div className="search-box">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.002zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z" /></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search or start new chat" />
          </div>
        </div>

        <div className="chat-list">
          {filtered.map((c) => (
            <div key={c.id} className={`chat-item ${c.id === activeId ? 'active' : ''} ${c.unread ? 'unread' : ''}`} onClick={() => openChat(c.id)}>
              <div className="avatar" style={{ background: c.color }}>{initials(c.name)}</div>
              <div className="meta">
                <div className="chat-row">
                  <span className="chat-name">{c.takeover ? '🧑 ' : ''}{c.name}</span>
                  <span className="chat-time">{c.last?.t || ''}</span>
                </div>
                <div className="chat-preview-row">
                  <span className="chat-preview">
                    {c.last ? (c.last.dir === 'out' ? '✓ ' : '') + c.last.text.replace(/\n/g, ' ') : 'No messages yet'}
                  </span>
                  {c.unread ? <span className="badge">{c.unread}</span> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ---------------- Conversation ---------------- */}
      {activeId && conv ? (
        <section className="chat">
          <div className="chat-header">
            <div className="avatar" style={{ background: conv.color }}>{initials(conv.name)}</div>
            <div className="meta">
              <div className="name">{conv.name}</div>
              <div className="status">{conv.phone}</div>
            </div>
            {mode !== 'live' && (
              <>
                <button className="icon-btn" title="Simulate an incoming text" onClick={simulateInbound} style={{ width: 'auto', padding: '0 8px', fontSize: 13, color: '#54656f' }}>
                  🧪 Text
                </button>
                <button className="icon-btn" title="Simulate an incoming photo" onClick={simulateInboundImage} style={{ width: 'auto', padding: '0 8px', fontSize: 13, color: '#54656f' }}>
                  🖼 Photo
                </button>
              </>
            )}
            <div className={`ai-toggle ${conv.autoReply ? 'on' : ''}`} onClick={toggleAuto} title="When ON, the AI auto-replies. Turn OFF to take over manually.">
              <span>🤖 AI {conv.autoReply ? 'ON' : 'OFF'}</span>
              <span className="switch" />
            </div>
          </div>

          {conv.humanTakeoverUntil && conv.humanTakeoverUntil > nowTs ? (
            <div className="takeover-bar">
              <span className="dot" />
              🧑 You're handling this chat — <b>bot paused</b>, resumes in {fmtCountdown(conv.humanTakeoverUntil - nowTs)}
              <button className="handback" onClick={handBackToBot}>↩ Hand back to bot now</button>
            </div>
          ) : null}

          <LeadStrip lead={conv.lead} />

          <div className="messages" ref={messagesRef}>
            <div className="date-pill">Today</div>
            {conv.messages.map((m) => (
              <div key={m.id} className={`msg ${m.dir === 'out' ? 'out' : 'in'} ${m.media ? 'has-media' : ''} ${m.media && !m.text ? 'media-only' : ''}`}>
                {m.media ? <MediaView media={m.media} /> : null}
                {m.text ? <span className="body">{m.text}</span> : null}
                {m.buttons?.length ? (
                  <div className="qr-buttons">
                    {m.buttons.map((b, i) => <button key={i} className="qr-btn">{b}</button>)}
                  </div>
                ) : null}
                <span className="stamp">
                  {m.dir === 'out' && m.source ? <span className="src">{m.source === 'ai' ? '🤖' : '🧑'}</span> : null}
                  {m.t}
                  {m.dir === 'out' ? (
                    <span className={`ticks ${m.status === 'read' ? 'read' : ''}`}>{m.status === 'failed' ? '⚠️' : TICK}</span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>

          <div className="composer">
            <button className="icon-btn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.153 11.603c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962zm-3.204 1.362c-.026-.307-.131 5.218 6.063 5.551 6.066-.25 6.066-5.551 6.066-5.551-6.078 1.416-12.129 0-12.129 0zm11.363 1.108s-.669 1.959-5.051 1.959c-3.505 0-5.388-1.164-5.607-1.959 0 0 5.912 1.055 10.658 0zM11.804 1.011C5.609 1.011.978 6.033.978 12.228s4.826 10.761 11.021 10.761S23.02 18.423 23.02 12.228c.001-6.195-5.021-11.217-11.216-11.217zM12 21.354c-5.273 0-9.381-3.886-9.381-9.159s3.942-9.548 9.215-9.548 9.548 4.275 9.548 9.548c-.001 5.272-4.109 9.159-9.382 9.159z" /></svg></button>
            <button className="icon-btn" title="Attach a file" onClick={() => fileRef.current?.click()}><svg viewBox="0 0 24 24" fill="currentColor"><path d="M1.816 15.556v.002c0 1.502.584 2.912 1.646 3.972s2.472 1.647 3.974 1.647a5.58 5.58 0 0 0 3.972-1.645l9.547-9.548c.769-.768 1.147-1.767 1.058-2.817-.079-.968-.548-1.927-1.319-2.698-1.594-1.592-4.068-1.711-5.517-.262l-7.916 7.915c-.881.881-.792 2.25.214 3.261.959.958 2.423 1.053 3.263.215l5.511-5.512c.28-.28.267-.722.053-.936l-.244-.244c-.191-.191-.567-.349-.957.04l-5.506 5.506c-.18.18-.635.127-.976-.214-.098-.097-.576-.613-.213-.973l7.915-7.917c.818-.817 2.267-.699 3.23.262.5.501.802 1.1.849 1.685.051.573-.156 1.111-.589 1.543l-9.547 9.549a3.97 3.97 0 0 1-2.829 1.171 3.975 3.975 0 0 1-2.83-1.173 3.973 3.973 0 0 1-1.172-2.828c0-1.071.415-2.076 1.172-2.83l7.209-7.211c.157-.157.264-.579.156-.687l-.13-.13c-.211-.21-.587-.394-.967-.014l-7.21 7.211a5.587 5.587 0 0 0-1.646 3.975z" /></svg></button>
            <input ref={fileRef} type="file" hidden onChange={uploadFile} accept="image/*,application/pdf,video/mp4,audio/*" />
            <div className="input">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                placeholder={conv.autoReply ? 'AI is handling this chat — type to take over' : 'Type a message'}
              />
            </div>
            <button className="send-btn" title="Send" onClick={send}>
              {hasText ? (
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M1.101 21.757 23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.999 14.942c2.001 0 3.531-1.53 3.531-3.531V4.35c0-2.001-1.53-3.531-3.531-3.531S8.469 2.35 8.469 4.35v7.061c0 2.001 1.53 3.531 3.53 3.531zm6.238-3.53c0 3.531-2.942 6.002-6.237 6.002s-6.237-2.471-6.237-6.002H3.761c0 4.001 3.178 7.297 7.061 7.885v3.884h2.354v-3.884c3.884-.588 7.061-3.884 7.061-7.885h-2z" /></svg>
              )}
            </button>
          </div>
        </section>
      ) : (
        <section className="empty">
          <div className="ring">
            <svg width="110" height="110" viewBox="0 0 24 24" fill="#00a884"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2z" /></svg>
          </div>
          <h2>Outbound WhatsApp Console</h2>
          <p>Pick a chat on the left to send and receive WhatsApp messages. Toggle <b>AI</b> per chat to let the bot auto-reply, or take over manually at any time.</p>
          <div className="foot">🔒 Powered by Meta WhatsApp Cloud API</div>
        </section>
      )}
    </div>
  );
}
