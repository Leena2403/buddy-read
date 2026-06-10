import { useState, useEffect, useRef, useCallback } from 'react'
import {
  apiGetRoom, apiGetHighlights, apiAddHighlight, apiDelHighlight,
  apiGetNotes, apiAddNote, apiDelNote,
  apiGetMessages, apiAddMessage,
  apiGetMembers, apiUpsertMember, apiPatchRoom,
} from '../lib/api.js'
import { BOOKS, USER_COLORS, timeAgo, fmtTime, genId } from '../lib/constants.js'
import PdfReader from './PdfReader.jsx'
import s from './Room.module.css'

const POLL_MS = 3000

export default function Room({ roomId, user, onLeave, dark, onToggleDark }) {
  const [room,        setRoom]        = useState(null)
  const [highlights,  setHighlights]  = useState([])
  const [notes,       setNotes]       = useState([])
  const [messages,    setMessages]    = useState([])
  const [members,     setMembers]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [sideTab,     setSideTab]     = useState('notes')
  const [sideOpen,    setSideOpen]    = useState(true)
  const [toolbarPos,  setToolbarPos]  = useState(null)
  const [selection,   setSelection]   = useState(null)  // { text, paragraphId }
  const [notePassage, setNotePassage] = useState(null)  // { text, paragraphId }
  const [noteText,    setNoteText]    = useState('')
  const [chatText,    setChatText]    = useState('')
  const [toast,       setToast]       = useState(null)
  const [progress,    setProgress]    = useState(0)
  const [followUser,  setFollowUser]  = useState(null)

  const readerRef    = useRef()
  const chatRef      = useRef()
  const noteTaRef    = useRef()
  const selectionRef = useRef(null)   // always current, avoids stale closure in mouseup

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const [r, hl, nt, ms, mb] = await Promise.all([
          apiGetRoom(roomId),
          apiGetHighlights(roomId),
          apiGetNotes(roomId),
          apiGetMessages(roomId),
          apiGetMembers(roomId),
        ])
        if (cancelled) return
        setRoom(r)
        setHighlights(normalizeList(hl))
        setNotes(normalizeList(nt))
        setMessages(normalizeList(ms))
        setMembers(mb || [])
      } catch (e) {
        console.error('Room init error:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    if (user) apiUpsertMember(roomId, user.name, user.color).catch(() => {})
    return () => { cancelled = true }
  }, [roomId, user])

  // ── Polling ───────────────────────────────────────────────────────────────
  useEffect(() => {
    async function poll() {
      try {
        const [hl, nt, ms, mb] = await Promise.all([
          apiGetHighlights(roomId),
          apiGetNotes(roomId),
          apiGetMessages(roomId),
          apiGetMembers(roomId),
        ])
        setHighlights(prev => {
          const next = normalizeList(hl)
          // changed if counts differ or last-item id differs (highlights sorted asc)
          const last = arr => arr[arr.length - 1]?.id
          return (prev.length === next.length && last(prev) === last(next)) ? prev : next
        })
        setNotes(prev => {
          const next = normalizeList(nt)
          // notes sorted desc — compare first item
          const first = arr => arr[0]?.id
          return (prev.length === next.length && first(prev) === first(next)) ? prev : next
        })
        setMessages(prev => {
          const next = normalizeList(ms)
          if (next.length > prev.length) {
            setTimeout(() => {
              if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
            }, 50)
          }
          return next.length !== prev.length ? next : prev
        })
        setMembers(mb || [])
      } catch { /* silent — server may be momentarily unavailable */ }
    }
    const t = setInterval(poll, POLL_MS)
    return () => clearInterval(t)
  }, [roomId])

  // ── Reading progress ──────────────────────────────────────────────────────
  const progressThrottle = useRef(null)
  useEffect(() => {
    const el = readerRef.current
    if (!el) return
    const handler = () => {
      const pct = Math.round(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight) * 100)
      setProgress(pct)
      clearTimeout(progressThrottle.current)
      progressThrottle.current = setTimeout(() => {
        if (user) apiPatchRoom(roomId, { [`progress.${user.name}`]: pct }).catch(() => {})
      }, 1500)
    }
    el.addEventListener('scroll', handler, { passive: true })
    return () => { el.removeEventListener('scroll', handler); clearTimeout(progressThrottle.current) }
  }, [roomId, user])

  // ── Text selection toolbar ────────────────────────────────────────────────
  useEffect(() => {
    function onUp(e) {
      if (document.getElementById('folio-tb')?.contains(e.target)) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setToolbarPos(null); setSelection(null); return
      }
      const range = sel.getRangeAt(0)
      const txt   = sel.toString().trim()
      const reader = document.getElementById('folio-reader')
      if (!reader?.contains(range.commonAncestorContainer)) { setToolbarPos(null); return }

      let node = range.startContainer
      while (node && node.nodeType !== 1) node = node.parentNode
      while (node && !node.dataset?.pid)  node = node.parentNode
      const pid = node?.dataset?.pid || ''

      const rect = range.getBoundingClientRect()
      const info = { text: txt, paragraphId: pid }
      selectionRef.current = info
      setSelection(info)
      setToolbarPos({ top: rect.top + window.scrollY - 54, left: rect.left + rect.width / 2 })
    }
    function onDown(e) {
      if (!document.getElementById('folio-tb')?.contains(e.target)) {
        setToolbarPos(null); setSelection(null)
      }
    }
    document.addEventListener('mouseup', onUp)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('mouseup', onUp); document.removeEventListener('mousedown', onDown) }
  }, [])

  // ── Highlight ─────────────────────────────────────────────────────────────
  async function doHighlight() {
    const sel = selectionRef.current
    if (!sel?.text || !user) return
    const hl = {
      id:          genId(),
      roomId,
      room_id:     roomId,     // send both so server is happy either way
      text:        sel.text,
      paragraphId: sel.paragraphId,
      author:      user.name,
      color:       user.color,
      createdAt:   new Date().toISOString(),
    }
    // Optimistic
    setHighlights(prev => [...prev, hl])
    setToolbarPos(null); setSelection(null)
    window.getSelection()?.removeAllRanges()
    try {
      const saved = await apiAddHighlight(hl)
      // Merge server response (has _id etc)
      setHighlights(prev => prev.map(h => h.id === hl.id ? { ...hl, ...saved } : h))
      showToast('Highlighted!')
    } catch (e) {
      console.error('Highlight save failed:', e)
      setHighlights(prev => prev.filter(h => h.id !== hl.id))
      showToast('Failed to save highlight')
    }
  }

  // ── Note ──────────────────────────────────────────────────────────────────
  function openNoteComposer() {
    const sel = selectionRef.current
    if (!sel) return
    const passage = sel.text.length > 90 ? sel.text.slice(0, 90) + '…' : sel.text
    setNotePassage({ text: passage, paragraphId: sel.paragraphId })
    setToolbarPos(null); setSelection(null)
    window.getSelection()?.removeAllRanges()
    setSideTab('notes'); setSideOpen(true)
    setTimeout(() => noteTaRef.current?.focus(), 120)
  }

  async function postNote() {
    if (!noteText.trim() || !user) return
    const note = {
      id:          genId(),
      roomId,
      room_id:     roomId,
      author:      user.name,
      color:       user.color,
      text:        noteText,
      passage:     notePassage?.text || '',
      paragraphId: notePassage?.paragraphId || '',
      createdAt:   new Date().toISOString(),
    }
    setNotes(prev => [note, ...prev])
    setNoteText(''); setNotePassage(null)
    try {
      await apiAddNote(note)
      showToast('Note saved')
    } catch {
      setNotes(prev => prev.filter(n => n.id !== note.id))
      showToast('Failed to save note')
    }
  }

  async function handleDeleteNote(noteId) {
    setNotes(prev => prev.filter(n => n.id !== noteId))
    try { await apiDelNote(noteId) } catch {}
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!chatText.trim() || !user) return
    const msg = {
      id:        genId(),
      roomId,
      room_id:   roomId,
      author:    user.name,
      color:     user.color,
      text:      chatText,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, msg])
    setChatText('')
    setTimeout(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, 50)
    try { await apiAddMessage(msg) }
    catch { setMessages(prev => prev.filter(m => m.id !== msg.id)) }
  }

  // ── Follow user ───────────────────────────────────────────────────────────
  function handleFollowUser(name) {
    if (followUser === name) { setFollowUser(null); showToast('Stopped following'); return }
    setFollowUser(name)
    const pct = room?.progress?.[name]
    if (pct !== undefined && readerRef.current) {
      const el = readerRef.current
      el.scrollTop = (pct / 100) * (el.scrollHeight - el.clientHeight)
    }
    showToast(`Following ${name}'s position`)
  }

  function jumpTo(pid) {
    if (!pid) return
    const el = document.getElementById('para_' + pid)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function copyLink() {
    const text = `Join my Folio reading room!\nCode: ${roomId}\n\nOpen Folio and enter this code to join.`
    navigator.clipboard?.writeText(text).catch(() => {})
    showToast('Room code copied!')
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  // ── Render guards ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={s.loadWrap}>
        <div className={s.spinner} />
        <p>Loading room…</p>
      </div>
    )
  }
  if (!room) {
    return (
      <div className={s.loadWrap}>
        <p>Room not found. <button onClick={onLeave} style={{textDecoration:'underline',background:'none',border:'none',cursor:'pointer'}}>Go back</button></p>
      </div>
    )
  }

  const book    = BOOKS[room.bookId]
  const myColor = USER_COLORS[user?.color || 'amber']

  let pdfParagraphs = null
  if (room.isPdf && room.bookContent) {
    try { pdfParagraphs = typeof room.bookContent === 'string' ? JSON.parse(room.bookContent) : room.bookContent } catch {}
  }

  return (
    <div className={s.root}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className={s.header}>
        <div className={s.hLeft}>
          <button className={s.backBtn} onClick={onLeave} title="Leave room">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2.5L4.5 7 9 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div>
            <div className={s.bookTitle}>{room.bookTitle || 'Untitled'}</div>
            <div className={s.bookSub}>{room.isPdf ? 'PDF' : room.bookAuthor} · {room.code}</div>
          </div>
        </div>

        <div className={s.hCenter}>
          {/* Deduplicate: prefer members from DB (has last_seen), fall back to current user if not yet in DB */}
          {(() => {
            const fromDb = members.map(m => m.user_name)
            // If current user isn't in DB yet (first load), show them too
            const allUsers = [...members]
            if (user && !fromDb.includes(user.name)) {
              allUsers.unshift({ user_name: user.name, user_color: user.color })
            }
            return allUsers.map(m => {
              const mc         = USER_COLORS[m.user_color] || USER_COLORS.amber
              const isMe       = m.user_name === user?.name
              const isFollowing = followUser === m.user_name
              return (
                <button key={m.user_name}
                  className={`${s.pill} ${isFollowing ? s.pillActive : ''}`}
                  style={{ background: mc.light, color: mc.text }}
                  onClick={() => !isMe && handleFollowUser(m.user_name)}
                  title={isMe ? 'You' : `Click to follow ${m.user_name}'s reading position`}>
                  <span className={s.pillDot} style={{ background: mc.solid }} />
                  {m.user_name}
                  {isMe && <span style={{ opacity: .55, fontSize: '10px', marginLeft: '3px' }}>(you)</span>}
                  {!isMe && room.progress?.[m.user_name] !== undefined &&
                    <span className={s.pillPct}>{room.progress[m.user_name]}%</span>}
                </button>
              )
            })
          })()}
        </div>

        <div className={s.hRight}>
          <button className={s.iconBtn} onClick={onToggleDark} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {dark
              ? <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              : <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M17.5 12.5A7.5 7.5 0 0 1 7.5 2.5a7.5 7.5 0 1 0 10 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            }
          </button>
          <button className={s.iconBtn} onClick={() => setSideOpen(o => !o)} title="Toggle sidebar">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="14" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.3"/>
              <line x1="11" y1="1.3" x2="11" y2="14.7" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
          </button>
          <button className={s.shareBtn} onClick={copyLink}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <circle cx="11" cy="2.5" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="11" cy="11.5" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="2.5" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M4.2 6.2l5.1-2.6M4.2 7.8l5.1 2.6" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            Share
          </button>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className={s.body}>

        {/* Reader */}
        <div className={s.reader} ref={readerRef}>
          {room.isPdf && !pdfParagraphs
            ? <PdfReader
                pdfUrl={room.pdfUrl}
                highlights={highlights}
                user={user}
                roomId={roomId}
                onAddHighlight={hl => {
                  setHighlights(p => [...p, hl])
                  apiAddHighlight({ ...hl, room_id: roomId }).catch(() => {})
                }}
              />
            : <BookReader
                book={book}
                customParagraphs={pdfParagraphs}
                highlights={highlights}
              />
          }
        </div>

        {/* Sidebar */}
        {sideOpen && (
          <aside className={`${s.sidebar} animate-slide`}>
            <div className={s.tabs}>
              {['notes', 'chat'].map(t => (
                <button key={t}
                  className={`${s.tab} ${sideTab === t ? s.tabOn : ''}`}
                  onClick={() => setSideTab(t)}>
                  {t === 'notes' ? 'Notes' : 'Chat'}
                  {t === 'chat' && messages.length > 0 &&
                    <span className={s.badge}>{messages.length}</span>}
                </button>
              ))}
              <button className={s.sideClose} onClick={() => setSideOpen(false)} title="Close sidebar">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Notes */}
            {sideTab === 'notes' && (
              <div className={s.pane}>
                <div className={s.notesList}>
                  {notes.length === 0
                    ? <EmptyState icon="✎" text="No notes yet. Select text in the book, then click Add note." />
                    : notes.map(n => (
                        <NoteCard key={n.id || n._id} note={n} currentUser={user}
                          onJump={() => jumpTo(n.paragraphId)}
                          onDelete={() => handleDeleteNote(n.id)} />
                      ))
                  }
                </div>
                <div className={s.noteComposerWrap}>
                  {notePassage && (
                    <div className={s.passagePreview}>
                      <button className={s.clearPass} onClick={() => setNotePassage(null)}>×</button>
                      <em>"{notePassage.text}"</em>
                    </div>
                  )}
                  <div className={s.noteComposer}>
                    <textarea ref={noteTaRef} className={s.noteTa}
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postNote() }}
                      placeholder={notePassage ? 'Write your thought… (⌘↵ to post)' : 'Select text in the book to attach a note…'}
                      rows={3} />
                    <div className={s.noteFooter}>
                      <span className={s.noteWho}>
                        <span className={s.noteAvatar} style={{ background: myColor?.solid }}>
                          {user?.name?.[0]}
                        </span>
                        {user?.name}
                      </span>
                      <button className={s.postBtn} onClick={postNote} disabled={!noteText.trim()}>
                        Post
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Chat */}
            {sideTab === 'chat' && (
              <div className={s.pane}>
                <div className={s.chatMsgs} ref={chatRef}>
                  {messages.length === 0
                    ? <EmptyState icon="💬" text="Chat with your reading buddies. Share reactions, theories, questions." />
                    : <>
                        <div className={s.dayLabel}>Today</div>
                        {messages.map(m => (
                          <ChatMsg key={m.id || m._id} msg={m} isSelf={m.author === user?.name} />
                        ))}
                      </>
                  }
                </div>
                <div className={s.chatInput}>
                  <textarea className={s.chatTa}
                    value={chatText}
                    onChange={e => setChatText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                    placeholder="Message the room… (Enter to send)"
                    rows={1} />
                  <button className={s.sendBtn} onClick={sendMessage} disabled={!chatText.trim()}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M12.5 1.5L1.5 6l4 2.5 2.5 4 4.5-11z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Progress bar */}
      <div className={s.progressBar} style={{ width: progress + '%', background: myColor?.solid }} />

      {/* Selection toolbar */}
      {toolbarPos && (
        <div id="folio-tb" className={s.toolbar}
          style={{ top: toolbarPos.top, left: toolbarPos.left, transform: 'translateX(-50%)' }}>
          <button className={s.tbBtn} onClick={doHighlight}>
            <span className={s.tbDot} style={{ background: myColor?.solid }} />
            Highlight
          </button>
          <div className={s.tbSep} />
          <button className={s.tbBtn} onClick={openNoteComposer}>
            <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
              <rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M3.5 4.5h6M3.5 6.5h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
            Add note
          </button>
        </div>
      )}

      {toast && <div className={s.toast}>{toast}</div>}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Normalise a list from the API — always returns an array, handles null */
function normalizeList(data) {
  if (!data) return []
  if (!Array.isArray(data)) return []
  return data
}

// ── BookReader ─────────────────────────────────────────────────────────────
function BookReader({ book, customParagraphs, highlights }) {
  const paragraphs = customParagraphs || book?.paragraphs || []

  if (!paragraphs.length) {
    return <div className={s.noBook}>Book content not found.</div>
  }

  return (
    <div className={s.bookContent} id="folio-reader">
      {!customParagraphs && book && (
        <div className={s.bookMeta}>
          <div className={s.metaLabel}>{book.author} · {book.year} · Public domain</div>
          <h1 className={s.bookH1}>{book.title}</h1>
          <p className={s.bookH1Sub}><em>Reading edition</em></p>
        </div>
      )}
      {paragraphs.map((para, i) => {
        if (para.type === 'chapter' || (!para.text && para.chapter)) {
          return (
            <div key={para.id || `ch_${i}`}
              className={`${s.chapterLabel} ${i > 0 ? s.chapterSpaced : ''}`}>
              {para.text}
            </div>
          )
        }
        if (!para.text) return null
        // Match highlights by paragraphId
        const paraHls = highlights.filter(h =>
          h.paragraphId === para.id || h.paragraph_id === para.id
        )
        return (
          <HighlightedPara key={para.id || `p_${i}`}
            para={para}
            highlights={paraHls}
            isFirst={i === (customParagraphs ? 0 : 1)}
          />
        )
      })}
    </div>
  )
}

// Splits paragraph text into segments with highlights overlaid
function HighlightedPara({ para, highlights, isFirst }) {
  const text = para.text || ''
  if (!highlights.length) {
    return (
      <p id={'para_' + para.id} data-pid={para.id}
        className={`${s.para} ${isFirst ? s.paraFirst : ''}`}>
        {text}
      </p>
    )
  }

  // Build non-overlapping segments sorted by position
  let segments = [{ text, start: 0, end: text.length, hl: null }]

  highlights.forEach(hl => {
    if (!hl.text) return
    const idx = text.indexOf(hl.text)
    if (idx === -1) return
    const hlEnd = idx + hl.text.length
    const next  = []

    segments.forEach(seg => {
      if (seg.hl) { next.push(seg); return } // already highlighted
      const overlapStart = Math.max(seg.start, idx)
      const overlapEnd   = Math.min(seg.end, hlEnd)
      if (overlapEnd <= overlapStart) { next.push(seg); return } // no overlap

      if (seg.start < overlapStart)
        next.push({ text: text.slice(seg.start, overlapStart), start: seg.start, end: overlapStart, hl: null })
      next.push({ text: text.slice(overlapStart, overlapEnd), start: overlapStart, end: overlapEnd, hl })
      if (overlapEnd < seg.end)
        next.push({ text: text.slice(overlapEnd, seg.end), start: overlapEnd, end: seg.end, hl: null })
    })
    segments = next
  })

  return (
    <p id={'para_' + para.id} data-pid={para.id}
      className={`${s.para} ${isFirst ? s.paraFirst : ''}`}>
      {segments.map((seg, i) =>
        seg.hl
          ? <HlSpan key={i} seg={seg} />
          : <span key={i}>{seg.text}</span>
      )}
    </p>
  )
}

function HlSpan({ seg }) {
  const [tip, setTip] = useState(false)
  const c = USER_COLORS[seg.hl.color] || USER_COLORS.amber
  const ts = seg.hl.createdAt || seg.hl.created_at
  return (
    <mark className={s.hl}
      style={{ background: c.bg, boxShadow: `0 1.5px 0 ${c.solid}90` }}
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}>
      {seg.text}
      {tip && (
        <span className={s.hlTip}>
          <span className={s.hlTipDot} style={{ background: c.solid }} />
          {seg.hl.author}{ts ? ` · ${timeAgo(ts)}` : ''}
        </span>
      )}
    </mark>
  )
}

// ── NoteCard ───────────────────────────────────────────────────────────────
function NoteCard({ note, currentUser, onJump, onDelete }) {
  const c = USER_COLORS[note.color] || USER_COLORS.amber
  const isMine = note.author === currentUser?.name
  const ts = note.createdAt || note.created_at
  return (
    <div className={s.noteCard} onClick={onJump} title="Click to jump to this passage">
      <div className={s.noteHead}>
        <div className={s.noteAuthor}>
          <div className={s.noteDot} style={{ background: c.solid }} />
          <span style={{ color: c.text, fontWeight: 500 }}>{note.author}</span>
        </div>
        <div className={s.noteHeadRight}>
          <span className={s.noteTime}>{ts ? timeAgo(ts) : ''}</span>
          {isMine && (
            <button className={s.noteDelBtn}
              onClick={e => { e.stopPropagation(); onDelete() }}
              title="Delete note">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      {note.passage && (
        <div className={s.notePassage} style={{ borderLeftColor: c.solid }}>
          "{note.passage}"
        </div>
      )}
      <div className={s.noteText}>{note.text}</div>
    </div>
  )
}

// ── ChatMsg ────────────────────────────────────────────────────────────────
function ChatMsg({ msg, isSelf }) {
  const c  = USER_COLORS[msg.color] || USER_COLORS.amber
  const ts = msg.createdAt || msg.created_at
  if (isSelf) {
    return (
      <div className={s.msgSelf}>
        <div className={s.msgSelfBubble}>{msg.text}</div>
        <div className={s.msgTime}>{ts ? fmtTime(ts) : ''}</div>
      </div>
    )
  }
  return (
    <div className={s.msg}>
      <div className={s.msgAvatar} style={{ background: c.solid }}>
        {msg.author?.[0]?.toUpperCase()}
      </div>
      <div className={s.msgBody}>
        <div className={s.msgMeta}>
          <span className={s.msgName}>{msg.author}</span>
          <span className={s.msgTime}>{ts ? fmtTime(ts) : ''}</span>
        </div>
        <div className={s.msgBubble}>{msg.text}</div>
      </div>
    </div>
  )
}

function EmptyState({ icon, text }) {
  return (
    <div className={s.empty}>
      <div className={s.emptyIcon}>{icon}</div>
      <p>{text}</p>
    </div>
  )
}
