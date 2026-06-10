import { dbFind, dbFindOne, dbUpsert, dbUpdate, dbDeleteMany, roomQuery, sendOk, sendErr, readBody, cors } from './_mongo.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const { roomId } = req.query

  try {
    // GET /api/rooms          → list all rooms
    // GET /api/rooms?roomId=x → get one room
    if (req.method === 'GET') {
      if (roomId) {
        const room = await dbFindOne('rooms', { $or: [{ id: roomId }, { code: roomId }] })
        return sendOk(res, room || null)
      }
      const rooms = await dbFind('rooms', {}, { created_at: -1 })
      return sendOk(res, rooms.slice(0, 50))
    }

    // POST /api/rooms  — create or upsert a room
    if (req.method === 'POST') {
      const body = await readBody(req)
      if (!body.id) return sendErr(res, new Error('id is required'), 400)
      const doc = { ...body, created_at: new Date(), updated_at: new Date() }
      await dbUpsert('rooms', { id: doc.id }, doc)
      return sendOk(res, doc)
    }

    // PATCH /api/rooms?roomId=x — update progress / fields
    if (req.method === 'PATCH') {
      if (!roomId) return sendErr(res, new Error('roomId required'), 400)
      const body   = await readBody(req)
      const patch  = { ...body, updated_at: new Date() }
      await dbUpdate('rooms', { $or: [{ id: roomId }, { code: roomId }] }, patch)
      const room = await dbFindOne('rooms', { $or: [{ id: roomId }, { code: roomId }] })
      return sendOk(res, room)
    }

    // DELETE /api/rooms?roomId=x — remove room + all related data
    if (req.method === 'DELETE') {
      if (!roomId) return sendErr(res, new Error('roomId required'), 400)
      const room = await dbFindOne('rooms', { $or: [{ id: roomId }, { code: roomId }] })
      if (!room)  return sendErr(res, new Error('Room not found'), 404)
      const rId = room.id || roomId
      await Promise.all([
        dbDeleteMany('rooms',      { $or: [{ id: rId }, { code: rId }] }),
        dbDeleteMany('highlights', roomQuery(rId)),
        dbDeleteMany('notes',      roomQuery(rId)),
        dbDeleteMany('messages',   roomQuery(rId)),
        dbDeleteMany('members',    roomQuery(rId)),
      ])
      return sendOk(res, { ok: true })
    }

    res.status(405).end()
  } catch (e) { sendErr(res, e) }
}
