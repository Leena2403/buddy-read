import { useState, useEffect, useRef } from 'react'
import { USER_COLORS, genId, timeAgo } from '../lib/constants.js'
import s from './PdfReader.module.css'

let pdfjsLib = null
async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib
  const mod = await import('pdfjs-dist')
  pdfjsLib = mod
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs', import.meta.url
  ).href
  return pdfjsLib
}

export default function PdfReader({ pdfUrl, highlights = [], user, roomId, onAddHighlight }) {
  const [pdf,     setPdf]     = useState(null)
  const [numPgs,  setNumPgs]  = useState(0)
  const [curPage, setCurPage] = useState(1)
  const [scale,   setScale]   = useState(1.3)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [selInfo, setSelInfo] = useState(null)
  const [tbPos,   setTbPos]   = useState(null)
  const canvasRef   = useRef()
  const textRef     = useRef()
  const renderRef   = useRef(null)
  const myColor     = USER_COLORS[user?.color || 'amber']

  useEffect(() => {
    if (!pdfUrl) return
    load(pdfUrl)
  }, [pdfUrl])

  useEffect(() => {
    if (pdf) renderPage(curPage)
  }, [pdf, curPage, scale])

  async function load(url) {
    setLoading(true); setError(null)
    try {
      const lib = await getPdfjs()
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
      const task = lib.getDocument({ url: proxyUrl })
      const doc  = await task.promise
      setPdf(doc); setNumPgs(doc.numPages)
    } catch(e) {
      setError('Could not load PDF. Check the URL and try again.')
      console.error(e)
    } finally { setLoading(false) }
  }

  async function renderPage(n) {
    if (!pdf || !canvasRef.current) return
    if (renderRef.current) { try { renderRef.current.cancel() } catch {} renderRef.current = null }
    try {
      const page = await pdf.getPage(n)
      const vp   = page.getViewport({ scale })
      const canvas = canvasRef.current
      canvas.width  = vp.width
      canvas.height = vp.height
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp })
      renderRef.current = task
      await task.promise

      // Render text layer
      const textContent = await page.getTextContent()
      if (textRef.current) {
        textRef.current.innerHTML = ''
        textRef.current.style.width  = vp.width  + 'px'
        textRef.current.style.height = vp.height + 'px'
        const lib = await getPdfjs()
        await new lib.renderTextLayer({
          textContentSource: textContent,
          container: textRef.current,
          viewport: vp,
          textDivs: [],
        }).promise
      }
    } catch(e) {
      if (e?.name !== 'RenderingCancelledException') console.error(e)
    }
  }

  // Handle text selection in text layer
  useEffect(() => {
    function onUp() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) { setTbPos(null); setSelInfo(null); return }
      const txt  = sel.toString().trim()
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      setSelInfo({ text: txt, page: curPage })
      setTbPos({ top: rect.top + window.scrollY - 52, left: rect.left + rect.width/2 })
    }
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [curPage])

  function doHighlight() {
    if (!selInfo || !user) return
    const hl = {
      id: genId(), roomId,
      text: selInfo.text, paragraphId: 'pdf_p' + selInfo.page,
      author: user.name, color: user.color,
      createdAt: new Date().toISOString(),
      isPdf: true, page: selInfo.page
    }
    onAddHighlight?.(hl)
    setTbPos(null); setSelInfo(null)
    window.getSelection()?.removeAllRanges()
  }

  const pageHls = highlights.filter(h => h.isPdf && h.page === curPage)

  if (loading) return <div className={s.center}><div className={s.spin}/><p>Loading PDF…</p></div>
  if (error)   return <div className={s.center} style={{color:'#c44'}}>{error}</div>

  return (
    <div className={s.wrap}>
      <div className={s.controls}>
        <div className={s.pageCtrl}>
          <button className={s.pgBtn} onClick={()=>setCurPage(p=>Math.max(1,p-1))} disabled={curPage<=1}>‹</button>
          <span className={s.pgInfo}>
            <input type="number" min={1} max={numPgs} value={curPage}
              onChange={e=>setCurPage(Math.min(numPgs,Math.max(1,+e.target.value)))}
              className={s.pgIn}/>
            <span>/ {numPgs}</span>
          </span>
          <button className={s.pgBtn} onClick={()=>setCurPage(p=>Math.min(numPgs,p+1))} disabled={curPage>=numPgs}>›</button>
        </div>
        <div className={s.zoomCtrl}>
          <button className={s.pgBtn} onClick={()=>setScale(x=>Math.max(.6,x-.2))}>−</button>
          <span className={s.zoomLbl}>{Math.round(scale*100)}%</span>
          <button className={s.pgBtn} onClick={()=>setScale(x=>Math.min(2.5,x+.2))}>+</button>
        </div>
      </div>

      <div className={s.pageWrap}>
        <div style={{position:'relative',display:'inline-block'}}>
          <canvas ref={canvasRef} className={s.canvas}/>
          <div ref={textRef} className={s.textLayer}/>
        </div>
      </div>

      {pageHls.length > 0 && (
        <div className={s.hlList}>
          <div className={s.hlListLabel}>Highlights on page {curPage}</div>
          {pageHls.map(hl => {
            const c = USER_COLORS[hl.color] || USER_COLORS.amber
            return (
              <div key={hl.id} className={s.hlItem} style={{borderLeftColor:c.solid}}>
                <div className={s.hlItemText}>"{hl.text?.slice(0,80)}{hl.text?.length>80?'…':''}"</div>
                <div className={s.hlItemMeta}><div style={{width:7,height:7,borderRadius:'50%',background:c.solid}}/>{hl.author} · {timeAgo(hl.createdAt||hl.created_at)}</div>
              </div>
            )
          })}
        </div>
      )}

      {tbPos && selInfo && (
        <div className={s.toolbar} style={{top:tbPos.top,left:tbPos.left,transform:'translateX(-50%)'}}>
          <button className={s.tbBtn} onClick={doHighlight}>
            <span style={{width:10,height:10,borderRadius:'50%',background:myColor?.solid,display:'inline-block'}}/>
            Highlight
          </button>
        </div>
      )}
    </div>
  )
}
