import { getDb, cors } from './_mongo.js'

export default async function handler(req, res) {
  cors(res)
  const info = {
    ok:      false,
    node:    process.version,
    hasUri:  !!process.env.MONGODB_URI,
    uriLen:  process.env.MONGODB_URI?.length || 0,
    dbName:  process.env.MONGODB_DB_NAME || 'buddy-read-db',
    db:      null,
    error:   null,
  }
  try {
    const db   = await getDb()
    const cols = await db.listCollections().toArray()
    info.ok = true; info.db = 'connected'
    info.collections = cols.map(c => c.name)
  } catch (e) {
    info.db = 'FAILED'; info.error = e.message
  }
  res.setHeader('Content-Type', 'application/json')
  res.status(200).end(JSON.stringify(info, null, 2))
}
