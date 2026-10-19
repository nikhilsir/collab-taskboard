import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

/**
 * POST /api/internal/check-membership
 * Called by the socket service (server-to-server, shared secret)
 * to authorize room joins — implements room-level authorization.
 *
 * Headers: x-internal-secret: <shared secret>
 * Body: { token }  Query: ?boardId=
 */
export async function POST(req: NextRequest) {
  // Service-to-service auth
  if (req.headers.get('x-internal-secret') !== (process.env.SOCKET_INTERNAL_SECRET || 'socket-internal-shared-secret-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const boardId = req.nextUrl.searchParams.get('boardId')
  if (!boardId) return NextResponse.json({ isMember: false })

  let token = ''
  try {
    const body = await req.json()
    token = String(body.token || '')
  } catch {
    return NextResponse.json({ isMember: false })
  }

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ isMember: false })

  const board = await db.board.findUnique({
    where: { id: boardId },
    include: { members: { select: { id: true } } },
  })
  if (!board) return NextResponse.json({ isMember: false })

  const isMember = board.createdById === payload.userId || board.members.some((m) => m.id === payload.userId)
  return NextResponse.json({ isMember })
}
