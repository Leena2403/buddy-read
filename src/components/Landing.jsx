import { useState, useEffect, useRef } from 'react'
import {
  apiGetRooms, apiCreateRoom, apiGetRoom,
  apiUpsertMember, apiDeleteRoom,
  extractPdfFromFile, extractPdfTextFromUrl,
} from '../lib/api.js'
import { BOOK_LIST, BOOKS, COLOR_OPTIONS, genRoomCode } from '../lib/constants.js'
import s from './Landing.module.css'

const COLORS = { amber:'#F59E0B', violet:'#8B5CF6', emerald:'#10B981', rose:'#F43F5E', sky:'#0EA5E9' }

// Key used to persist uploaded-PDF metadata in localStorage
const LS_PDF_BOOKS = 'folio_pdf_books'

function getSavedPdfBooks() {
  try { return JSON.parse(localStorage.getItem(LS_PDF_BOOKS) || '[]') } catch { return [] }
}

export default function Landing({ onEnterRoom, currentUser, dark, onToggleDark }) {
  const [rooms,        setRooms]      = useState([])
  const [roomsLoading, setRoomsLoad]  = useState(true)
  const [modal,        setModal]      = useState(null)
  const [searchQ,      setSearchQ]    = useState('')
  const [showSearch,   setShowSearch] = useState(false)

  // Uploaded PDF books available to re-use in new rooms
  const [pdfBooks, setPdfBooks] = useState(getSavedPdfBooks)

  const [form, setForm] = useState({
    name:  currentUser?.name  || '',
    color: currentUser?.color || 'amber',
    bookId: 'pride',        // public-domain book id OR 'pdf_upload' OR 'pdf_url' OR saved pdf id
    savedPdfId: '',         // id of a previously uploaded PDF
    code: '',
  })
  const [pdfFile,    setPdfFile]    = useState(null)
  const [pdfUrl,     setPdfUrl]     = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState('')
  const fileRef = useRef()

  useEffect(() => {
    loadRooms()
    const t = setInterval(loadRooms, 10000)
    return () => clearInterval(t)
  }, [])

  async function loadRooms() {
    try { setRooms(await apiGetRooms()) }
    catch (e) { console.warn('loadRooms:', e.message) }
    finally { setRoomsLoad(false) }
  }

  // Combined search: public-domain books + previously uploaded PDFs
  const searchResults = searchQ.trim()
    ? [
        // Public-domain books
        ...BOOK_LIST
          .filter(b =>
            b.title.toLowerCase().includes(searchQ.toLowerCase()) ||
            b.author.toLowerCase().includes(searchQ.toLowerCase()))
          .map(b => ({ ...b, _type: 'builtin' })),
        // Uploaded PDFs
        ...pdfBooks
          .filter(p => p.title.toLowerCase().includes(searchQ.toLowerCase()))
          .map(p => ({ id: p.id, title: p.title, author: 'PDF Upload', year: '', emoji: '📄', _type: 'pdf' })),
      ]
    : []

  function openModal(type) {
    setExtracting(false); setExtractMsg('')
    setModal(type)
  }
  function closeModal() { if (!extracting) setModal(null) }

  // ── Determine what source the user chose ─────────────────────────────
  const bookSource = form.bookId   // 'pride'|'gatsby'|'metamorphosis' | 'pdf_upload' | 'pdf_url' | savedPdfId

  // ── Create room (single handler, dispatches by bookSource) ───────────
  async function handleCreate() {
    if (!form.name.trim()) return

    let isPdf       = false
    let bookContent = null
    let bookTitle   = null
    let pdfUrl_val  = null

    // ── A: public domain book ─────────────────────────────────────────
    if (BOOKS[bookSource]) {
      const book = BOOKS[bookSource]
      return finalise({ isPdf: false, bookId: book.id, bookTitle: book.title, bookAuthor: book.author, bookContent: null, pdfUrl: null })
    }

    // ── B: re-use a previously uploaded PDF ──────────────────────────
    if (bookSource !== 'pdf_upload' && bookSource !== 'pdf_url') {
      const saved = pdfBooks.find(p => p.id === bookSource)
      if (saved) {
        return finalise({
          isPdf: true, bookId: 'pdf',
          bookTitle: saved.title, bookAuthor: 'PDF Upload',
          bookContent: saved.content, pdfUrl: null
        })
      }
    }

    // ── C: new file upload ────────────────────────────────────────────
    if (bookSource === 'pdf_upload') {
      if (!pdfFile) { alert('Please select a PDF file first.'); return }
      setExtracting(true); setExtractMsg('Reading PDF — extracting up to 30 pages…')
      try {
        bookContent = await extractPdfFromFile(pdfFile, 30)
      } catch (e) {
        setExtracting(false); setExtractMsg('')
        alert('Could not read PDF:\n\n' + e.message); return
      }
      setExtracting(false); setExtractMsg('')
      bookTitle  = pdfFile.name.replace(/\.pdf$/i,'').replace(/[-_]+/g,' ').trim()
      isPdf      = true

      // Save for future re-use
      const newEntry = { id: 'pdf_' + Date.now(), title: bookTitle, content: JSON.stringify(bookContent), addedAt: new Date().toISOString() }
      const updated  = [newEntry, ...pdfBooks].slice(0, 20)  // keep last 20
      setPdfBooks(updated)
      localStorage.setItem(LS_PDF_BOOKS, JSON.stringify(updated))

      return finalise({ isPdf, bookId: 'pdf', bookTitle, bookAuthor: 'PDF Upload', bookContent: JSON.stringify(bookContent), pdfUrl: null })
    }

    // ── D: URL import ─────────────────────────────────────────────────
    if (bookSource === 'pdf_url') {
      const url = pdfUrl.trim()
      if (!url || !url.startsWith('http')) { alert('Please enter a valid PDF URL (starting with http).'); return }
      setExtracting(true); setExtractMsg('Fetching PDF via server…')
      try {
        bookContent = await extractPdfTextFromUrl(url, 30)
      } catch (e) {
        setExtracting(false); setExtractMsg('')
        alert('Could not import PDF:\n\n' + e.message + '\n\nTip: Download the PDF and use the Upload option instead.'); return
      }
      setExtracting(false); setExtractMsg('')
      bookTitle = url.split('/').pop().replace(/\.pdf$/i,'').replace(/[-_]+/g,' ').trim() || 'Imported PDF'
      pdfUrl_val = url

      const newEntry = { id: 'pdf_' + Date.now(), title: bookTitle, content: JSON.stringify(bookContent), addedAt: new Date().toISOString() }
      const updated  = [newEntry, ...pdfBooks].slice(0, 20)
      setPdfBooks(updated)
      localStorage.setItem(LS_PDF_BOOKS, JSON.stringify(updated))

      return finalise({ isPdf: true, bookId: 'pdf', bookTitle, bookAuthor: 'PDF Import', bookContent: JSON.stringify(bookContent), pdfUrl: pdfUrl_val })
    }
  }

  async function finalise({ isPdf, bookId, bookTitle, bookAuthor, bookContent, pdfUrl: pu }) {
    const code = genRoomCode()
    const room = {
      id: code, code,
      bookId, bookTitle, bookAuthor,
      isPdf, pdfUrl: pu, bookContent,
      createdBy: form.name,
      members:   [{ name: form.name, color: form.color }],
      progress:  {},
      createdAt: new Date().toISOString(),
    }
    try {
      await apiCreateRoom(room)
      await apiUpsertMember(code, form.name, form.color)
    } catch (e) { console.warn('create room:', e.message) }
    setModal(null); setPdfFile(null); setPdfUrl('')
    onEnterRoom(code, { name: form.name, color: form.color })
  }

  async function handleJoin() {
    if (!form.name.trim() || !form.code.trim()) return
    const code = form.code.trim().toLowerCase()
    let room = null
    try { room = await apiGetRoom(code) } catch {}
    if (!room) { alert(`No room found with code "${code}". Check and try again.`); return }
    try { await apiUpsertMember(code, form.name, form.color) } catch {}
    setModal(null)
    onEnterRoom(code, { name: form.name, color: form.color })
  }

  async function handleDelete(e, room) {
    e.stopPropagation()
    if (!currentUser?.name || currentUser.name !== room.createdBy) {
      alert(`Only ${room.createdBy || 'the owner'} can delete this room.`); return
    }
    if (!confirm(`Delete "${room.bookTitle}"?\n\nThis permanently removes all highlights, notes, and messages.`)) return
    try {
      await apiDeleteRoom(room.id)
      setRooms(prev => prev.filter(r => r.id !== room.id))
    } catch (e) { alert('Delete failed: ' + e.message) }
  }

  function removeSavedPdf(id) {
    const updated = pdfBooks.filter(p => p.id !== id)
    setPdfBooks(updated)
    localStorage.setItem(LS_PDF_BOOKS, JSON.stringify(updated))
    if (form.bookId === id) setForm(f => ({ ...f, bookId: 'pride' }))
  }

  return (
    <div className={s.wrap}>
      <nav className={s.nav}>
        <div className={s.wordmark}><em>f</em>olio</div>
        <div className={s.navActs}>
          {/* Dark mode toggle */}
          <button className={s.darkBtn} onClick={onToggleDark} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {dark
              ? /* sun */
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              : /* moon */
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <path d="M17.5 12.5A7.5 7.5 0 0 1 7.5 2.5a7.5 7.5 0 1 0 10 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
            }
          </button>
          <button className={s.ghost} onClick={() => openModal('join')}>Join a room</button>
          <button className={s.primary} onClick={() => openModal('create')}>New room</button>
        </div>
      </nav>

      <div className={s.body}>
        {/* Hero */}
        <div className={s.hero}>
          <div className={s.tag}><span className={s.dot}/>Read together, in real time</div>
          <h1 className={s.h1}>Books are better<br/><em>shared.</em></h1>
          <p className={s.sub}>A calm reading space where you and a friend can read the same book simultaneously — highlight passages, leave notes, and talk about what you're reading as it happens.</p>
          <div className={s.heroActs}>
            <button className={s.primary} onClick={() => openModal('create')}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
              Start reading room
            </button>
            {rooms.length > 0 && (
              <button className={s.ghost} onClick={() => onEnterRoom(rooms[0].id, currentUser || { name:'Guest', color:'amber' })}>
                Open latest room
              </button>
            )}
          </div>
        </div>

        {/* ① Search public-domain books — moved to top */}
        <section className={s.section}>
          <div className={s.secLabel}>Search public-domain books</div>
          <div className={s.searchWrap}>
            <div className={s.searchBox}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{opacity:.35,flexShrink:0}}>
                <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="m10 10 3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <input className={s.searchIn} value={searchQ}
                onChange={e => { setSearchQ(e.target.value); setShowSearch(true) }}
                onFocus={() => searchResults.length && setShowSearch(true)}
                onBlur={() => setTimeout(() => setShowSearch(false), 180)}
                placeholder="Pride and Prejudice, Gatsby, Kafka…"/>
            </div>
            {showSearch && searchResults.length > 0 && (
              <div className={s.searchRes}>
                {searchResults.map(b => (
                  <div key={b.id} className={s.searchItem}
                    onMouseDown={() => {
                      setSearchQ(b.title)
                      setShowSearch(false)
                      if (b._type === 'pdf') {
                        // Directly open this saved PDF in a room
                        setForm(f => ({ ...f, bookId: b.id }))
                      } else {
                        setForm(f => ({ ...f, bookId: b.id }))
                      }
                      openModal('create')
                    }}>
                    <div className={s.bookEmoji}>{b.emoji}</div>
                    <div>
                      <div className={s.bookName}>{b.title}</div>
                      <div className={s.bookSub}>{b.author}{b.year ? ` · ${b.year}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ② Active rooms */}
        <section className={s.section}>
          <div className={s.secLabel}>Active rooms</div>
          {roomsLoading
            ? <div className={s.emptyTxt}>Loading…</div>
            : rooms.length === 0
              ? <div className={s.emptyTxt}>No rooms yet — create one above!</div>
              : <div className={s.grid}>
                  {rooms.map(r => (
                    <RoomCard key={r.id} room={r} currentUser={currentUser}
                      onClick={() => onEnterRoom(r.id, currentUser || { name:'Guest', color:'amber' })}
                      onDelete={e => handleDelete(e, r)}/>
                  ))}
                </div>
          }
        </section>

        {/* ③ PDF upload */}
        <section className={s.section}>
          <div className={s.secLabel}>Upload a PDF file</div>
          <div className={s.uploadZone}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (!f) return
              if (f.type !== 'application/pdf') { alert('Please drop a .pdf file'); return }
              setPdfFile(f); setForm(fr => ({ ...fr, bookId: 'pdf_upload' })); openModal('create')
            }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/>
            </svg>
            <div>
              <p><strong>Click to upload</strong> or drag &amp; drop a PDF</p>
              <p className={s.hint}>Text extracted · first 30 pages · highlight-ready prose</p>
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf" style={{display:'none'}}
            onChange={e => {
              const f = e.target.files[0]; e.target.value = ''
              if (!f) return
              setPdfFile(f); setForm(fr => ({ ...fr, bookId: 'pdf_upload' })); openModal('create')
            }}/>
        </section>

        {/* ④ PDF URL */}
        <section className={s.section}>
          <div className={s.secLabel}>Import PDF from a URL</div>
          <div className={s.urlRow}>
            <input className={s.urlIn} value={pdfUrl}
              onChange={e => setPdfUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && pdfUrl.trim() && (setForm(f=>({...f,bookId:'pdf_url'})), openModal('create'))}
              placeholder="https://example.com/book.pdf"/>
            <button className={s.ghost} disabled={!pdfUrl.trim()}
              onClick={() => { if(pdfUrl.trim()){ setForm(f=>({...f,bookId:'pdf_url'})); openModal('create') } }}>
              Import →
            </button>
          </div>
          <p className={s.hint}>Fetched server-side — avoids browser CORS blocks</p>
        </section>

        {/* ⑤ Previously uploaded PDFs */}
        {pdfBooks.length > 0 && (
          <section className={s.section}>
            <div className={s.secLabel}>Your uploaded PDFs</div>
            <div className={s.pdfGrid}>
              {pdfBooks.map(p => (
                <div key={p.id} className={s.pdfCard}
                  onClick={() => { setForm(f=>({...f,bookId:p.id})); openModal('create') }}>
                  <div className={s.pdfCardIcon}>📄</div>
                  <div className={s.pdfCardTitle}>{p.title}</div>
                  <button className={s.pdfCardDel}
                    onClick={e => { e.stopPropagation(); removeSavedPdf(p.id) }}
                    title="Remove from list">×</button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── MODAL: create room ──────────────────────────────────────────── */}
      {modal === 'create' && (
        <Modal title="New reading room" sub="Choose a book and start reading together." onClose={closeModal}>
          <NameColorFields form={form} setForm={setForm}/>

          <label className={s.lbl} style={{marginTop:14}}>Book source</label>
          <select className={s.inp} value={form.bookId}
            onChange={e => {
              const v = e.target.value
              setForm(f => ({ ...f, bookId: v }))
              // If switching away from file upload, clear the file
              if (v !== 'pdf_upload') setPdfFile(null)
              if (v !== 'pdf_url') setPdfUrl('')
            }}>
            <optgroup label="Public-domain books">
              {BOOK_LIST.map(b => <option key={b.id} value={b.id}>{b.title} — {b.author}</option>)}
            </optgroup>
            {pdfBooks.length > 0 && (
              <optgroup label="Your uploaded PDFs">
                {pdfBooks.map(p => <option key={p.id} value={p.id}>📄 {p.title}</option>)}
              </optgroup>
            )}
            <optgroup label="Import new PDF">
              <option value="pdf_upload">📁 Upload a PDF file…</option>
              <option value="pdf_url">🔗 Import from URL…</option>
            </optgroup>
          </select>

          {/* Show file picker if upload selected */}
          {form.bookId === 'pdf_upload' && (
            <div className={s.inlineUpload}>
              <button className={s.ghost} style={{fontSize:13}} onClick={() => fileRef.current?.click()}>
                {pdfFile ? `✓ ${pdfFile.name}` : 'Choose PDF file…'}
              </button>
              {pdfFile && <span className={s.hint}>Ready — {(pdfFile.size/1024).toFixed(0)} KB</span>}
            </div>
          )}

          {/* Show URL input if URL selected */}
          {form.bookId === 'pdf_url' && (
            <div style={{marginTop:8}}>
              <input className={s.inp} value={pdfUrl}
                onChange={e => setPdfUrl(e.target.value)}
                placeholder="https://example.com/book.pdf"/>
            </div>
          )}

          {extracting && <Extracting msg={extractMsg}/>}

          <div className={s.mActs}>
            <button className={s.ghost} onClick={closeModal} disabled={extracting}>Cancel</button>
            <button className={s.primary} onClick={handleCreate}
              disabled={!form.name.trim() || extracting ||
                (form.bookId === 'pdf_upload' && !pdfFile) ||
                (form.bookId === 'pdf_url'    && !pdfUrl.trim())}>
              {extracting ? 'Processing…' : 'Create room'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── MODAL: join room ─────────────────────────────────────────────── */}
      {modal === 'join' && (
        <Modal title="Join a room" sub="Enter the room code your friend shared." onClose={closeModal}>
          <NameColorFields form={form} setForm={setForm}/>
          <label className={s.lbl} style={{marginTop:14}}>Room code</label>
          <input className={s.inp} value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
            placeholder="e.g. abc-042"
            onKeyDown={e => e.key === 'Enter' && handleJoin()}/>
          <div className={s.mActs}>
            <button className={s.ghost} onClick={closeModal}>Cancel</button>
            <button className={s.primary} onClick={handleJoin}
              disabled={!form.name.trim() || !form.code.trim()}>
              Join room
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────
function NameColorFields({ form, setForm }) {
  return (
    <>
      <label className={s.lbl}>Your name</label>
      <input className={s.inp} autoFocus value={form.name}
        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        placeholder="e.g. Leena"/>
      <label className={s.lbl} style={{marginTop:14}}>Highlight color</label>
      <div className={s.colorRow}>
        {COLOR_OPTIONS.map(c => (
          <div key={c.id} title={c.name}
            className={`${s.swatch} ${form.color === c.id ? s.swatchOn : ''}`}
            style={{background:c.solid}}
            onClick={() => setForm(f => ({ ...f, color: c.id }))}/>
        ))}
      </div>
    </>
  )
}

function Extracting({ msg }) {
  return (
    <div className={s.extracting}>
      <div className={s.extractSpin}/>
      <span>{msg || 'Processing…'}</span>
    </div>
  )
}

function RoomCard({ room, currentUser, onClick, onDelete }) {
  const accent   = COLORS[room.members?.[0]?.color] || '#2A6049'
  const isOwner  = currentUser?.name && currentUser.name === room.createdBy
  const progVals = Object.values(room.progress || {})
  const avgProg  = progVals.length ? Math.round(progVals.reduce((a,b)=>a+b,0)/progVals.length) : 0
  return (
    <div className={s.card} style={{'--rc':accent}} onClick={onClick}>
      <div className={s.cardTop}/>
      <div className={s.cardHead}>
        <div style={{minWidth:0}}>
          <div className={s.cardBook}>{room.bookTitle||'Untitled'}</div>
          <div className={s.cardAuthor}>{room.isPdf ? '📄 ' : ''}{room.bookAuthor||''}</div>
        </div>
        {isOwner && (
          <button className={s.deleteBtn} onClick={onDelete} title="Delete room (you are the owner)">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M5 4V2.5h4V4M5.5 6.5v4M8.5 6.5v4M3 4l.7 7.5h6.6L11 4"
                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>
      <div className={s.cardRow}>
        <div className={s.avStack}>
          {(room.members||[]).slice(0,4).map((m,i)=>(
            <div key={i} className={s.av} style={{background:COLORS[m.color]||'#999',zIndex:10-i}}>
              {m.name?.[0]?.toUpperCase()}
            </div>
          ))}
        </div>
        <span className={s.cardMeta}>{(room.members||[]).map(m=>m.name).join(', ')} · {room.code}</span>
      </div>
      {avgProg > 0 && (
        <div className={s.cardProg}><div className={s.cardProgFill} style={{width:avgProg+'%'}}/></div>
      )}
    </div>
  )
}

function Modal({ title, sub, children, onClose }) {
  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.mHead}>
          <div>
            <h2 className={s.mTitle}>{title}</h2>
            <p className={s.mSub}>{sub}</p>
          </div>
          <button className={s.closeBtn} onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1.5 1.5l10 10M11.5 1.5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
