/**
 * Server-side helper: broadcast an event to a board room
 * via the socket.io mini-service (port 3003).
 *
 * Next.js API routes do ALL database writes; the socket service
 * is a stateless real-time relay. This keeps DB logic in one place
 * and mirrors the "server is source of truth" pattern.
 */
const SOCKET_URL = process.env.SOCKET_INTERNAL_URL || 'http://localhost:3004'
const SECRET = process.env.SOCKET_INTERNAL_SECRET || 'socket-internal-shared-secret-2026'

export async function broadcast(opts: {
  room: string
  event: string
  data: unknown
  exceptSocketId?: string
}): Promise<void> {
  try {
    await fetch(`${SOCKET_URL}/internal/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': SECRET,
      },
      body: JSON.stringify(opts),
      signal: AbortSignal.timeout(3000),
    })
  } catch (err) {
    // Broadcast failure must never break the API response
    console.error('[broadcast] failed:', err)
  }
}
