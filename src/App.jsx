import { useState, useEffect } from 'react'
import Landing from './components/Landing.jsx'
import Room    from './components/Room.jsx'

const LS_USER = 'folio_user'
const LS_DARK = 'folio_dark'

export default function App() {
  const [screen, setScreen] = useState('landing')
  const [roomId, setRoomId] = useState(null)
  const [user,   setUser]   = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_USER)) } catch { return null }
  })
  const [dark, setDark] = useState(() => localStorage.getItem(LS_DARK) === 'true')

  // Apply dark class to <html> whenever dark changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem(LS_DARK, dark)
  }, [dark])

  function enterRoom(id, userData) {
    if (userData) {
      localStorage.setItem(LS_USER, JSON.stringify(userData))
      setUser(userData)
    }
    setRoomId(id)
    setScreen('room')
  }

  function goHome() {
    setScreen('landing')
    setRoomId(null)
  }

  return screen === 'room' && roomId
    ? <Room roomId={roomId} user={user} onLeave={goHome} dark={dark} onToggleDark={() => setDark(d => !d)} />
    : <Landing onEnterRoom={enterRoom} currentUser={user} dark={dark} onToggleDark={() => setDark(d => !d)} />
}
