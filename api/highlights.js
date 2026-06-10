import { dbFind, dbInsert, dbDeleteMany, roomQuery, sendOk, sendErr, readBody, cors } from './_mongo.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const { roomId, id } = req.query

  try {
    if (req.method === 'GET') {
      if (!roomId) return sendOk(res, [])
      return sendOk(res, await dbFind('highlights', roomQuery(roomId), { created_at: 1 }))
    }

    if (req.method === 'POST') {
      const body = await readBody(req)
      const rId  = body.room_id || body.roomId
      if (!rId) return sendErr(res, new Error('roomId required'), 400)
      const doc = { ...body, room_id: rId, roomId: rId, created_at: new Date() }
      return sendOk(res, await dbInsert('highlights', doc))
    }

    if (req.method === 'DELETE') {
      if (!id) return sendErr(res, new Error('id required'), 400)
      await dbDeleteMany('highlights', { id })
      return sendOk(res, { ok: true })
    }

    res.status(405).end()
  } catch (e) { sendErr(res, e) }
}
