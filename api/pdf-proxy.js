import https from 'https'
import http  from 'http'
import { cors } from './_mongo.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).end()

  const url = req.query?.url
  if (!url) return res.status(400).json({ error: 'url param required' })

  try { new URL(url) } catch { return res.status(400).json({ error: 'Invalid URL' }) }

  function fetch(targetUrl, hops = 5) {
    return new Promise((resolve, reject) => {
      if (!hops) return reject(new Error('Too many redirects'))
      const parsed  = new URL(targetUrl)
      const agent   = parsed.protocol === 'https:' ? https : http
      const options = {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method:   'GET',
        headers:  { 'User-Agent': 'Mozilla/5.0 (compatible; Folio/1.0; +https://folio.app)', Accept: 'application/pdf,*/*' },
        timeout:  25000,
      }
      const req2 = agent.request(options, r => {
        if ([301,302,303,307,308].includes(r.statusCode) && r.headers.location) {
          const next = r.headers.location.startsWith('http')
            ? r.headers.location : new URL(r.headers.location, targetUrl).href
          return resolve(fetch(next, hops - 1))
        }
        if (r.statusCode !== 200) return reject(new Error(`HTTP ${r.statusCode}`))
        const chunks = []
        r.on('data', c => chunks.push(c))
        r.on('end',  () => resolve(Buffer.concat(chunks)))
        r.on('error', reject)
      })
      req2.on('timeout', () => { req2.destroy(); reject(new Error('Timed out after 25s')) })
      req2.on('error', reject)
      req2.end()
    })
  }

  try {
    const buf = await fetch(url)
    if (!buf || buf.length < 100) return res.status(502).json({ error: 'Empty response' })
    if (buf[0] !== 0x25 || buf[1] !== 0x50 || buf[2] !== 0x44 || buf[3] !== 0x46)
      return res.status(422).json({ error: 'URL did not return a PDF (%PDF header missing)' })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Length', buf.length)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.status(200).end(buf)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
}
