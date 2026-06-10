// api.js — HTTP calls + PDF extraction
const BASE = import.meta.env.VITE_API_BASE || ''

async function req(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText)
    throw new Error(`API ${method} ${path} → ${res.status}: ${txt}`)
  }
  return res.json()
}

const get   = p      => req('GET',    p)
const post  = (p, b) => req('POST',   p, b)
const del   = p      => req('DELETE', p)
const patch = (p, b) => req('PATCH',  p, b)

export const apiGetRooms   = ()         => get('/api/rooms')
export const apiGetRoom    = id         => get(`/api/rooms?roomId=${id}`)
export const apiCreateRoom = room       => post('/api/rooms', room)
export const apiPatchRoom  = (id, data) => patch(`/api/rooms?roomId=${id}`, data)
export const apiDeleteRoom = id         => del(`/api/rooms?roomId=${id}`)

export const apiGetMembers   = roomId                           => get(`/api/members?roomId=${roomId}`)
export const apiUpsertMember = (room_id, user_name, user_color) =>
  post('/api/members', { room_id, user_name, user_color })

export const apiGetHighlights = roomId => get(`/api/highlights?roomId=${roomId}`)
export const apiAddHighlight  = hl     => post('/api/highlights', hl)
export const apiDelHighlight  = id     => del(`/api/highlights?id=${id}`)

export const apiGetNotes = roomId => get(`/api/notes?roomId=${roomId}`)
export const apiAddNote  = note   => post('/api/notes', note)
export const apiDelNote  = id     => del(`/api/notes?id=${id}`)

export const apiGetMessages = roomId => get(`/api/messages?roomId=${roomId}`)
export const apiAddMessage  = msg    => post('/api/messages', msg)

// ─── PDF.js loader ────────────────────────────────────────────────────────
let _pdfjsCache = null
async function getPdfjs() {
  if (_pdfjsCache) return _pdfjsCache
  const lib = await import('pdfjs-dist')
  lib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs', import.meta.url
  ).href
  _pdfjsCache = lib
  return lib
}

// ─── File upload → text paragraphs ───────────────────────────────────────
// This path: File → arrayBuffer() → PDF.js — no network at all, always works
export async function extractPdfFromFile(file, maxPages = 30) {
  if (!file) throw new Error('No file provided')

  let buffer
  try {
    buffer = await file.arrayBuffer()
  } catch (e) {
    throw new Error('Could not read the file: ' + e.message)
  }

  if (!buffer || buffer.byteLength < 100) {
    throw new Error('File is empty or unreadable')
  }

  // Verify %PDF magic bytes
  const magic = new Uint8Array(buffer.slice(0, 4))
  if (!(magic[0] === 0x25 && magic[1] === 0x50 && magic[2] === 0x44 && magic[3] === 0x46)) {
    throw new Error('This file does not appear to be a PDF')
  }

  const lib = await getPdfjs()
  const doc = await lib.getDocument({ data: buffer }).promise
  return _paragraphs(doc, maxPages)
}

// ─── URL import → text paragraphs ────────────────────────────────────────
// Routes through our own Express backend at /api/pdf-proxy (no CORS issues)
export async function extractPdfTextFromUrl(url, maxPages = 30) {
  if (!url || !url.trim().startsWith('http')) {
    throw new Error('Please enter a full URL starting with http:// or https://')
  }

  // Fetch via our backend proxy (server.js /api/pdf-proxy)
  // The server fetches the PDF server-side — no browser CORS restriction
  let buffer
  try {
    const proxyUrl = `${BASE}/api/pdf-proxy?url=${encodeURIComponent(url.trim())}`
    const res = await fetch(proxyUrl)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      let msg = `Server returned ${res.status}`
      try { msg = JSON.parse(body).error || msg } catch {}
      throw new Error(msg)
    }
    buffer = await res.arrayBuffer()
  } catch (e) {
    throw new Error(
      `Could not fetch the PDF.\n\n${e.message}\n\n` +
      `If the site blocks downloads, save the PDF to your computer and use the Upload option instead.`
    )
  }

  if (!buffer || buffer.byteLength < 200) {
    throw new Error('The server returned an empty response. The PDF URL may be invalid.')
  }

  const lib = await getPdfjs()
  const doc = await lib.getDocument({ data: buffer }).promise
  return _paragraphs(doc, maxPages)
}

// ─── Core extractor (shared) ──────────────────────────────────────────────
async function _paragraphs(doc, maxPages) {
  const paragraphs = []
  const limit      = Math.min(doc.numPages, maxPages)
  let chapter      = null

  for (let pg = 1; pg <= limit; pg++) {
    const page    = await doc.getPage(pg)
    const content = await page.getTextContent()

    if (!content.items.length) continue

    // Group by Y coordinate (PDF Y is bottom-up, sort descending = top-to-bottom)
    const rows = new Map()
    for (const item of content.items) {
      if (!item.str?.trim()) continue
      const y = Math.round(item.transform[5])
      if (!rows.has(y)) rows.set(y, [])
      rows.get(y).push(item.str)
    }

    const lines = [...rows.keys()]
      .sort((a, b) => b - a)
      .map(y => rows.get(y).join(' ').trim())
      .filter(l => l.length > 0)

    let buf = ''
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]

      const isChapter =
        line.length < 70 && (
          /^(chapter|part|section|prologue|epilogue|preface|introduction|\d+\.)\s/i.test(line) ||
          (line.length < 50 && line === line.toUpperCase() && /[A-Z]{2}/.test(line))
        )

      if (isChapter) {
        if (buf.trim().length > 40) {
          paragraphs.push({ id: `p${pg}_${li}b`, type: 'para', text: buf.trim(), chapter })
          buf = ''
        }
        chapter = line
        paragraphs.push({ id: `h${pg}_${li}`, type: 'chapter', text: line })
        continue
      }

      buf += (buf ? ' ' : '') + line

      // Flush at sentence boundary once we have enough
      if (/[.!?]["']?\s*$/.test(line) && buf.length > 160) {
        if (buf.trim().length > 40)
          paragraphs.push({ id: `p${pg}_${li}`, type: 'para', text: buf.trim(), chapter })
        buf = ''
      }
    }

    // Flush page remainder
    if (buf.trim().length > 40) {
      paragraphs.push({ id: `p${pg}_end`, type: 'para', text: buf.trim(), chapter })
      buf = ''
    }
  }

  if (!paragraphs.length) {
    throw new Error(
      'No readable text found. This PDF may be scanned (image-only). ' +
      'Only text-based PDFs are supported.'
    )
  }

  return paragraphs
}
