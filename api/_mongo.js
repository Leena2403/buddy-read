import { MongoClient } from 'mongodb'

const uri    = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB_NAME || 'buddy-read-db'

if (!uri) {
  throw new Error('MONGODB_URI is not set. Add it in Vercel → Settings → Environment Variables.')
}

// Cache the client across warm lambda invocations
let cachedClient = null

async function connect() {
  if (cachedClient) return cachedClient
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 10000,
  })
  await client.connect()
  cachedClient = client
  return client
}

export async function getDb() {
  const client = await connect()
  return client.db(dbName)
}

/** Match docs regardless of whether they stored room_id or roomId */
export function roomQuery(roomId) {
  return { $or: [{ room_id: roomId }, { roomId }] }
}

// ── Tiny ORM helpers ───────────────────────────────────────────────────────
export async function dbFind(col, filter, sort) {
  const db  = await getDb()
  let cursor = db.collection(col).find(filter)
  if (sort) cursor = cursor.sort(sort)
  return cursor.toArray()
}

export async function dbFindOne(col, filter) {
  const db = await getDb()
  return db.collection(col).findOne(filter)
}

export async function dbInsert(col, doc) {
  const db     = await getDb()
  const result = await db.collection(col).insertOne(doc)
  return { ...doc, _id: result.insertedId }
}

export async function dbUpsert(col, filter, doc) {
  const db = await getDb()
  await db.collection(col).updateOne(filter, { $set: doc }, { upsert: true })
  return doc
}

export async function dbUpdate(col, filter, patch) {
  const db = await getDb()
  return db.collection(col).updateOne(filter, { $set: patch })
}

export async function dbDeleteMany(col, filter) {
  const db = await getDb()
  return db.collection(col).deleteMany(filter)
}

// ── Response helpers ───────────────────────────────────────────────────────
export function sendOk(res, data)  {
  res.setHeader('Content-Type', 'application/json')
  res.status(200).end(JSON.stringify(data))
}

export function sendErr(res, e, status = 500) {
  const msg = e?.message || String(e)
  console.error('[folio]', msg)
  res.setHeader('Content-Type', 'application/json')
  res.status(status).end(JSON.stringify({ error: msg }))
}

/** Works whether Vercel already parsed req.body (object) or not (stream) */
export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end',  () => { try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) } })
    req.on('error', reject)
  })
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}
