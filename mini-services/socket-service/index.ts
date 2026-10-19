import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'

/**
 * ============================================================
 * SOCKET.IO REAL-TIME SERVICE (port 3003)
 * ============================================================
 * Stateless real-time relay for the Kanban board:
 *  - JWT verified on handshake (auth payload)
 *  - Room per board: `board:{boardId}` — room-level authorization
 *    via internal membership check against the Next.js API
 *  - Presence (online members) + typing indicator
 *  - `/internal/emit` endpoint: Next.js API routes (which own the
 *    database) push broadcasts here after mutations
 *
 * This mirrors the MERN architecture where socket.io lives inside
 * the Express server — here the gateway (Caddy) forwards
 * `/?XTransformPort=3003` to this service.
 * ============================================================
 */

const PORT = 3003
const INTERNAL_PORT = 3004 // separate server: socket.io owns ALL of :3003 (path '/')
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-fallback'
const INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET || 'socket-internal-shared-secret-2026'
const NEXT_API = process.env.NEXT_API_URL || 'http://localhost:3000'

const httpServer = createServer()

const io = new Server(httpServer, {
  // DO NOT change the path — Caddy forwards `/?XTransformPort=3003` here
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

type SocketUser = { userId: string; name: string; avatarColor: string }
type PresenceMap = Map<string, Map<string, SocketUser>> // room -> socketId -> user

/** board rooms this socket has joined: boardId -> room name */
const socketRooms = new Map<string, Set<string>>()
const presence: PresenceMap = new Map()

function getRoom(boardId: string) {
  return `board:${boardId}`
}

/** Broadcast de-duplicated (per user) presence list of a room */
function emitPresence(room: string) {
  const users = presence.get(room)
  const online: SocketUser[] = []
  if (users) {
    const seen = new Set<string>()
    for (const u of users.values()) {
      if (!seen.has(u.userId)) {
        seen.add(u.userId)
        online.push(u)
      }
    }
  }
  io.to(room).emit('presence:update', { onlineUsers: online })
}

/**
 * Room-level authorization: before joining a board room, verify with
 * the Next.js API that this user is actually a member of the board.
 */
async function isBoardMember(boardId: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${NEXT_API}/api/internal/check-membership?boardId=${encodeURIComponent(boardId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return false
    const json = (await res.json()) as { isMember: boolean }
    return !!json.isMember
  } catch {
    return false
  }
}

io.on('connection', (socket: Socket) => {
  // ---- JWT verification on handshake ----
  const token = (socket.handshake.auth?.token as string) || ''
  let payload: { userId: string; email: string } | null = null
  try {
    payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string }
  } catch {
    socket.emit('auth:error', { message: 'Invalid or expired token' })
    socket.disconnect(true)
    return
  }

  const socketUser: SocketUser = {
    userId: payload.userId,
    name: (socket.handshake.auth?.name as string) || 'User',
    avatarColor: (socket.handshake.auth?.avatarColor as string) || '#6366f1',
  }
  socketRooms.set(socket.id, new Set())
  console.log(`[socket] connected: ${socketUser.name} (${socket.id})`)

  socket.on('board:join', async (data: { boardId: string }, ack?: (res: unknown) => void) => {
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
    presence.get(room)!.set(socket.id, socketUser)
    emitPresence(room)

    ack?.({ ok: true })
    console.log(`[socket] ${socketUser.name} joined ${room}`)
  })

  socket.on('board:leave', (data: { boardId: string }) => {
    const boardId = String(data?.boardId || '')
    const room = getRoom(boardId)
    socket.leave(room)
    socketRooms.get(socket.id)?.delete(boardId)
    presence.get(room)?.delete(socket.id)
    emitPresence(room)
  })

  // Typing indicator — relay to everyone else in the room
  socket.on('task:typing', (data: { boardId: string; context: string }) => {
    const boardId = String(data?.boardId || '')
    if (!boardId) return
    socket.to(getRoom(boardId)).emit('user:typing', {
      userId: socketUser.userId,
      name: socketUser.name,
      context: String(data.context || ''),
      at: Date.now(),
    })
  })

  socket.on('disconnect', () => {
    const boards = socketRooms.get(socket.id) || new Set<string>()
    for (const boardId of boards) {
      const room = getRoom(boardId)
      presence.get(room)?.delete(socket.id)
      emitPresence(room)
    }
    socketRooms.delete(socket.id)
    console.log(`[socket] disconnected: ${socketUser.name} (${socket.id})`)
  })

  socket.on('error', (err) => console.error(`[socket] error (${socket.id}):`, err))
})

// ---- Internal emit endpoint on its OWN port -------------------------------
// socket.io (engine.io) with path '/' intercepts every request on :3003,
// so server-to-server HTTP lives on :3004 instead.
const internalServer = createServer((req, res) => {
  if (req.method === 'POST' && req.url?.startsWith('/internal/emit')) {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      // Shared-secret auth between services
      if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Unauthorized' }))
        return
      }
      try {
        const { room, event, data, exceptSocketId } = JSON.parse(body)
        if (!room || !event) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'room and event are required' }))
          return
        }
        if (exceptSocketId) {
          io.to(room).except(exceptSocketId).emit(event, data)
        } else {
          io.to(room).emit(event, data)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'socket-service' }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

internalServer.listen(INTERNAL_PORT, () => {
  console.log(`Internal emit endpoint on port ${INTERNAL_PORT}`)
})

httpServer.listen(PORT, () => {
  console.log(`Socket.io service running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0))
})
