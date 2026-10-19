import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

type Params = { params: Promise<{ boardId: string }> }

/**
 * GET /api/boards/[boardId] — full board data:
 * tasks (+assignee, +comments), members, activities.
 * Membership is verified: only owner/members can read.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId } = await params

  const board = await db.board.findUnique({
    where: { id: boardId },
    include: {
      members: { select: { id: true, name: true, email: true, avatarColor: true } },
      owner: { select: { id: true, name: true, email: true, avatarColor: true } },
    },
  })

  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 })

  // ---- Authorization: owner or member only ----
  const isAllowed = board.createdById === user.id || board.members.some((m) => m.id === user.id)
  if (!isAllowed) {
    return NextResponse.json({ error: 'You are not a member of this board' }, { status: 403 })
  }

  const tasks = await db.task.findMany({
    where: { boardId },
    include: {
      assignedTo: { select: { id: true, name: true, avatarColor: true } },
      comments: {
        include: { author: { select: { id: true, name: true, avatarColor: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { position: 'asc' },
  })

  const activities = await db.activity.findMany({
    where: { boardId },
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  // Members list includes owner
  const members = board.members.some((m) => m.id === board.owner.id)
    ? board.members
    : [...board.members, board.owner]

  return NextResponse.json({
    board: {
      id: board.id,
      title: board.title,
      createdById: board.createdById,
      members,
      tasks,
      activities,
    },
  })
}
