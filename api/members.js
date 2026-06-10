import { getDb, dbFind, roomQuery, sendOk, sendErr, readBody, cors } from './_mongo.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const { roomId } = req.query

  try {
    if (req.method === 'GET') {
      if (!roomId) return sendOk(res, [])
      return sendOk(res, await dbFind('members', roomQuery(roomId), { joined_at: 1 }))
    }

    if (req.method === 'POST') {
      const { room_id, user_name, user_color } = await readBody(req)
      if (!room_id || !user_name) return sendErr(res, new Error('room_id and user_name required'), 400)
      const db  = await getDb()
      const col = db.collection('members')
      const now = new Date()
      const existing = await col.findOne({ room_id, user_name })
      if (existing) {
        await col.updateOne({ room_id, user_name }, { $set: { user_color, last_seen: now } })
        return sendOk(res, { ...existing, user_color, last_seen: now })
      }
      const doc    = { room_id, roomId: room_id, user_name, user_color, joined_at: now, last_seen: now }
      const result = await col.insertOne(doc)
      return sendOk(res, { ...doc, _id: result.insertedId })
    }

    res.status(405).end()
  } catch (e) { sendErr(res, e) }
}
