import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

/**
 * GET /api/boards — all boards where I am owner OR member
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const boards = await db.board.findMany({
    where: {
      OR: [{ createdById: user.id }, { members: { some: { id: user.id } } }],
    },
    include: {
      owner: { select: { id: true, name: true, avatarColor: true } },
      members: { select: { id: true, name: true, avatarColor: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ boards })
}

/**
 * POST /api/boards — create a new board
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const title = String(body.title || '').trim()
  if (!title) {
    return NextResponse.json({ error: 'Board title is required' }, { status: 400 })
  }

  const board = await db.board.create({
    data: { title, createdById: user.id },
    include: {
      owner: { select: { id: true, name: true, avatarColor: true } },
      members: { select: { id: true, name: true, avatarColor: true } },
      _count: { select: { tasks: true } },
    },
  })

  // Activity log
  await db.activity.create({
    data: {
      type: 'BOARD_CREATED',
      message: `${user.name} created the board`,
      boardId: board.id,
      userId: user.id,
    },
  })

  return NextResponse.json({ board }, { status: 201 })
}
