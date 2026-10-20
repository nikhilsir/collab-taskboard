/**
 * ============================================================
 * CollabKanban — Production Custom Server (Node.js)
 * ============================================================
 * Single Render service serves BOTH:
 *   1. Next.js app (UI + API routes)  — everything except /socket.io
 *   2. Socket.io real-time service    — path `/socket.io`
 *
 * Same-origin socket = no CORS issues, one service to manage.
 * Sandbox uses a separate mini-service (see mini-services/socket-service);
 * production merges both into this one process.
 * ============================================================
 */
import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'

const port = Number(process.env.PORT || 3000)
const dev = false
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-fallback'
const INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET || 'socket-internal-shared-secret-2026'
// Used by the socket logic to verify board membership against the Next.js API
const NEXT_API = process.env.NEXT_API_URL || `http://localhost:${port}`

const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url, true))
  })

  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 60000,
    pingInterval: 25000,
  })

  // Expose in-process emitter so Next.js API routes can broadcast
  // directly (src/lib/socket-emit.ts checks for this global first)
  globalThis.__kanbanIo = io

  // ---------- socket logic (mirrors mini-services/socket-service) ----------
  const socketUserMap = new Map() // socketId -> { userId, name, avatarColor }
  const socketRooms = new Map() // socketId -> Set<boardId>
  const presence = new Map() // room -> Map<socketId, user>

  const getRoom = (boardId) => `board:${boardId}`

  function emitPresence(room) {
    const users = presence.get(room)
    const online = []
    if (users) {
      const seen = new Set()
      for (const u of users.values()) {
        if (!seen.has(u.userId)) {
          seen.add(u.userId)
          online.push(u)
        }
      }
    }
    io.to(room).emit('presence:update', { onlineUsers: online })
  }

  async function isBoardMember(boardId, token) {
    try {
      const res = await fetch(
        `${NEXT_API}/api/internal/check-membership?boardId=${encodeURIComponent(boardId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
          body: JSON.stringify({ token }),
          signal: AbortSignal.timeout(4000),
        }
      )
      if (!res.ok) return false
      const json = await res.json()
      return !!json.isMember
    } catch {
      return false
    }
  }

  io.on('connection', (socket) => {
    const token = socket.handshake.auth?.token || ''
    let payload = null
    try {
      payload = jwt.verify(token, JWT_SECRET)
    } catch {
      socket.emit('auth:error', { message: 'Invalid or expired token' })
      socket.disconnect(true)
      return
    }

    const socketUser = {
      userId: payload.userId,
      name: socket.handshake.auth?.name || 'User',
      avatarColor: socket.handshake.auth?.avatarColor || '#6366f1',
    }
    socketUserMap.set(socket.id, socketUser)
    socketRooms.set(socket.id, new Set())
    console.log(`[socket] connected: ${socketUser.name} (${socket.id})`)

    socket.on('board:join', async (data, ack) => {
      const boardId = String(data?.boardId || '')
      if (!boardId) return
      const allowed = await isBoardMember(boardId, token)
      if (!allowed) {
        ack?.({ ok: false, error: 'Not a member of this board' })
        return
      }
      const room = getRoom(boardId)
      socket.join(room)
      socketRooms.get(socket.id)?.add(boardId)
      if (!presence.has(room)) presence.set(room, new Map())
      presence.get(room).set(socket.id, socketUser)
      emitPresence(room)
      ack?.({ ok: true })
      console.log(`[socket] ${socketUser.name} joined ${room}`)
    })

    socket.on('board:leave', (data) => {
      const boardId = String(data?.boardId || '')
      const room = getRoom(boardId)
      socket.leave(room)
      socketRooms.get(socket.id)?.delete(boardId)
      presence.get(room)?.delete(socket.id)
      emitPresence(room)
    })

    socket.on('task:typing', (data) => {
      const boardId = String(data?.boardId || '')
      if (!boardId) return
      socket.to(getRoom(boardId)).emit('user:typing', {
        userId: socketUser.userId,
        name: socketUser.name,
        context: String(data.context || ''),
        at: Date.now(),
      })
    })

    // Board chat typing indicator — relay to everyone else in the room
    // (messages go through the Next.js API → in-process broadcast)
    socket.on('chat:typing', (data) => {
      const boardId = String(data?.boardId || '')
      if (!boardId) return
      socket.to(getRoom(boardId)).emit('chat:typing', {
        userId: socketUser.userId,
        name: socketUser.name,
        at: Date.now(),
      })
    })

    socket.on('disconnect', () => {
      const boards = socketRooms.get(socket.id) || new Set()
      for (const boardId of boards) {
        const room = getRoom(boardId)
        presence.get(room)?.delete(socket.id)
        emitPresence(room)
      }
      socketRooms.delete(socket.id)
      socketUserMap.delete(socket.id)
      console.log(`[socket] disconnected: ${socketUser.name} (${socket.id})`)
    })

    socket.on('error', (err) => console.error(`[socket] error (${socket.id}):`, err))
  })
  // ---------- end socket logic ----------

  httpServer.listen(port, () => {
    console.log(`> CollabKanban production server ready on http://localhost:${port}`)
    console.log(`> Socket.io listening at path /socket.io`)
  })
})

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
