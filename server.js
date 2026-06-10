import express from 'express'
import { MongoClient } from 'mongodb'
import https from 'https'
import http from 'http'
import dotenv from 'dotenv'

dotenv.config()

const app  = express()
const port = process.env.PORT || 4000
const uri  = process.env.MONGODB_URI
const db_name = process.env.MONGODB_DB_NAME || 'buddy-read-db'

if (!uri) {
  console.error('❌  Missing MONGODB_URI in .env')
  process.exit(1)
}

const client = new MongoClient(uri)
await client.connect()
console.log('✅  Connected to MongoDB:', db_name)
const db = client.db(db_name)

app.use(express.json({ limit: '10mb' }))

// CORS — allow the Vite dev server and any deployed frontend
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

function err(res, e) {
  console.error(e)
  res.status(500).json({ error: String(e) })
}

// ── Rooms ─────────────────────────────────────────────────────────────────
app.get('/api/rooms', async (req, res) => {
  try {
    const { roomId } = req.query
    if (roomId) {
      const room = await db.collection('rooms').findOne({ $or: [{ id: roomId }, { code: roomId }] })
      return res.json(room || null)
    }
    const rooms = await db.collection('rooms').find().sort({ created_at: -1 }).limit(50).toArray()
    res.json(rooms)
  } catch (e) { err(res, e) }
})

app.post('/api/rooms', async (req, res) => {
  try {
    const room = req.body
    if (!room?.id) return res.status(400).json({ error: 'Room id required' })
    const doc = { ...room, created_at: new Date(), updated_at: new Date() }
    await db.collection('rooms').updateOne({ id: doc.id }, { $set: doc }, { upsert: true })
    res.json(doc)
  } catch (e) { err(res, e) }
})

app.patch('/api/rooms/:id', async (req, res) => {
  try {
    const { id } = req.params
    const update = { ...req.body, updated_at: new Date() }
    await db.collection('rooms').updateOne({ $or: [{ id }, { code: id }] }, { $set: update })
    const room = await db.collection('rooms').findOne({ $or: [{ id }, { code: id }] })
    res.json(room)
  } catch (e) { err(res, e) }
})

// ── Members ───────────────────────────────────────────────────────────────
app.get('/api/members', async (req, res) => {
  try {
    const { roomId } = req.query
    if (!roomId) return res.json([])
    // Accept room_id OR roomId in the collection
    const members = await db.collection('members')
      .find({ $or: [{ room_id: roomId }, { roomId }] })
      .sort({ joined_at: 1 }).toArray()
    res.json(members)
  } catch (e) { err(res, e) }
})

app.post('/api/members', async (req, res) => {
  try {
    const { room_id, user_name, user_color } = req.body
    if (!room_id || !user_name) return res.status(400).json({ error: 'room_id and user_name required' })
    const now = new Date()
    const existing = await db.collection('members').findOne({ room_id, user_name })
    if (existing) {
      await db.collection('members').updateOne({ room_id, user_name }, { $set: { user_color, last_seen: now } })
      return res.json({ ...existing, user_color, last_seen: now })
    }
    const result = await db.collection('members').insertOne({ room_id, user_name, user_color, joined_at: now, last_seen: now })
    res.json({ _id: result.insertedId, room_id, user_name, user_color, joined_at: now, last_seen: now })
  } catch (e) { err(res, e) }
})

// ── Highlights ────────────────────────────────────────────────────────────
app.get('/api/highlights', async (req, res) => {
  try {
    const { roomId } = req.query
    if (!roomId) return res.json([])
    // Accept highlights stored with either field name
    const highlights = await db.collection('highlights')
      .find({ $or: [{ room_id: roomId }, { roomId }] })
      .sort({ created_at: 1 }).toArray()
    res.json(highlights)
  } catch (e) { err(res, e) }
})

app.post('/api/highlights', async (req, res) => {
  try {
    const payload = req.body
    // Normalise: always store both room_id and roomId for robustness
    const rId = payload.room_id || payload.roomId
    const doc = {
      ...payload,
      room_id:   rId,
      roomId:    rId,
      created_at: new Date(),
    }
    const result = await db.collection('highlights').insertOne(doc)
    res.json({ ...doc, _id: result.insertedId })
  } catch (e) { err(res, e) }
})

app.delete('/api/highlights', async (req, res) => {
  try {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'missing id' })
    await db.collection('highlights').deleteMany({ id })
    res.json({ ok: true })
  } catch (e) { err(res, e) }
})

// ── Notes ─────────────────────────────────────────────────────────────────
app.get('/api/notes', async (req, res) => {
  try {
    const { roomId } = req.query
    if (!roomId) return res.json([])
    const notes = await db.collection('notes')
      .find({ $or: [{ room_id: roomId }, { roomId }] })
      .sort({ created_at: -1 }).toArray()
    res.json(notes)
  } catch (e) { err(res, e) }
})

app.post('/api/notes', async (req, res) => {
  try {
    const payload = req.body
    const rId = payload.room_id || payload.roomId
    const doc = {
      ...payload,
      room_id:    rId,
      roomId:     rId,
      created_at: new Date(),
    }
    const result = await db.collection('notes').insertOne(doc)
    res.json({ ...doc, _id: result.insertedId })
  } catch (e) { err(res, e) }
})

app.delete('/api/notes', async (req, res) => {
  try {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'missing id' })
    await db.collection('notes').deleteMany({ id })
    res.json({ ok: true })
  } catch (e) { err(res, e) }
})

// ── Messages ──────────────────────────────────────────────────────────────
app.get('/api/messages', async (req, res) => {
  try {
    const { roomId } = req.query
    if (!roomId) return res.json([])
    const messages = await db.collection('messages')
      .find({ $or: [{ room_id: roomId }, { roomId }] })
      .sort({ created_at: 1 }).toArray()
    res.json(messages)
  } catch (e) { err(res, e) }
})

app.post('/api/messages', async (req, res) => {
  try {
    const payload = req.body
    const rId = payload.room_id || payload.roomId
    const doc = {
      ...payload,
      room_id:    rId,
      roomId:     rId,
      created_at: new Date(),
    }
    const result = await db.collection('messages').insertOne(doc)
    res.json({ ...doc, _id: result.insertedId })
  } catch (e) { err(res, e) }
})

// ── Debug ─────────────────────────────────────────────────────────────────
app.get('/api/debug', (req, res) => {
  res.json({
    ok: true,
    node: process.version,
    db: db_name,
    hasUri: !!uri,
  })
})

// ── Delete room + cascade ──────────────────────────────────────────────────
app.delete("/api/rooms", async (req, res) => {
  try {
    const { roomId } = req.query
    if (!roomId) return res.status(400).json({ error: "roomId required" })
    const filter = { $or: [{ id: roomId }, { code: roomId }] }
    const room = await db.collection("rooms").findOne(filter)
    if (!room) return res.status(404).json({ error: "Room not found" })
    const rId = room.id || roomId
    // Cascade delete everything tied to this room
    await Promise.all([
      db.collection("rooms").deleteOne(filter),
      db.collection("highlights").deleteMany({ $or: [{ room_id: rId }, { roomId: rId }] }),
      db.collection("notes").deleteMany({ $or: [{ room_id: rId }, { roomId: rId }] }),
      db.collection("messages").deleteMany({ $or: [{ room_id: rId }, { roomId: rId }] }),
      db.collection("members").deleteMany({ $or: [{ room_id: rId }, { roomId: rId }] }),
    ])
    console.log("Deleted room", rId, "and all associated data")
    res.json({ ok: true, roomId: rId })
  } catch (e) { err(res, e) }
})

// ── PDF proxy — fetches PDFs server-side, bypassing browser CORS ──────────
app.get('/api/pdf-proxy', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'url param required' })

  // Only allow http/https
  let parsedUrl
  try {
    parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Only http/https URLs are supported' })
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  try {
    const chunks = await new Promise((resolve, reject) => {
      const transport = parsedUrl.protocol === 'https:' ? https : http
      const options = {
        hostname: parsedUrl.hostname,
        port:     parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path:     parsedUrl.pathname + parsedUrl.search,
        method:   'GET',
        headers:  {
          'User-Agent': 'Mozilla/5.0 (compatible; Folio/1.0)',
          'Accept':     'application/pdf,*/*',
        },
        timeout: 20000,
      }

      const request = transport.get(options, incoming => {
        // Follow up to 3 redirects
        if ([301, 302, 303, 307, 308].includes(incoming.statusCode) && incoming.headers.location) {
          incoming.resume()
          // Recurse by calling the route again won't work here — just reject with a hint
          return reject(new Error(`Redirect to ${incoming.headers.location} — try that URL directly`))
        }

        if (incoming.statusCode !== 200) {
          incoming.resume()
          return reject(new Error(`Remote server returned HTTP ${incoming.statusCode}`))
        }

        const parts = []
        incoming.on('data', chunk => parts.push(chunk))
        incoming.on('end', () => resolve(parts))
        incoming.on('error', reject)
      })

      request.on('timeout', () => { request.destroy(); reject(new Error('Request timed out after 20s')) })
      request.on('error', reject)
    })

    const buf = Buffer.concat(chunks)
    if (buf.length < 100) return res.status(502).json({ error: 'Empty response from remote server' })

    // Check PDF magic bytes
    if (buf.slice(0, 4).toString('ascii') !== '%PDF') {
      return res.status(415).json({ error: 'URL did not return a PDF (check the URL points directly to a .pdf file)' })
    }

    console.log(`[pdf-proxy] Fetched ${url} — ${buf.length} bytes`)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Length', buf.length)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.send(buf)
  } catch (e) {
    console.error('[pdf-proxy] Error:', e.message)
    res.status(502).json({ error: e.message })
  }
})

app.listen(port, () => {
  console.log(`🚀  Folio API server → http://localhost:${port}`)
})

// ── Delete room + cascade ─────────────────────────────────────────────────
// (Add this before app.listen)
