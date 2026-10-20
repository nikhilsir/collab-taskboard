import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { broadcast } from '@/lib/socket-emit'

type Params = { params: Promise<{ boardId: string }> }

const MAX_CONTENT = 2000
const HISTORY_LIMIT = 200

/** Verify the requester is owner or member of the board. Returns board or null. */
async function assertMember(boardId: string, userId: string) {
  const board = await db.board.findUnique({
    where: { id: boardId },
    include: { members: { select: { id: true } } },
  })
  if (!board) return null
  const isAllowed = board.createdById === userId || board.members.some((m) => m.id === userId)
  return isAllowed ? board : null
}

/**
 * GET /api/boards/[boardId]/chat — message history (last 200, oldest first).
 * Only board owner/members can read.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId } = await params
  const board = await assertMember(boardId, user.id)
  if (!board) return NextResponse.json({ error: 'Board not found or not a member' }, { status: 403 })

  // Newest N from DB → reverse so the UI renders oldest → newest
  const rows = await db.chatMessage.findMany({
    where: { boardId },
    include: { author: { select: { id: true, name: true, avatarColor: true } } },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
  })
  const messages = rows.reverse()

  return NextResponse.json({ messages })
}

/**
 * POST /api/boards/[boardId]/chat — send a chat message.
 * Persists to DB, broadcasts `chat:message` to the board room.
 * Sender applies the API response optimistically (socket event
 * carries `by` so the sender ignores their own relay).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId } = await params
  const board = await assertMember(boardId, user.id)
  if (!board) return NextResponse.json({ error: 'Board not found or not a member' }, { status: 403 })

  let content: unknown
  try {
    const body = await req.json()
    content = body?.content
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const text = typeof content === 'string' ? content.trim().slice(0, MAX_CONTENT) : ''
  if (!text) {
    return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 })
  }

  const created = await db.chatMessage.create({
    data: { content: text, boardId, authorId: user.id },
    include: { author: { select: { id: true, name: true, avatarColor: true } } },
  })

  const message = { ...created, createdAt: created.createdAt.toISOString() }

  // Real-time fan-out to everyone in the board room
  await broadcast({
    room: `board:${boardId}`,
    event: 'chat:message',
    data: { message, by: user.id },
  })

  return NextResponse.json({ message }, { status: 201 })
}
