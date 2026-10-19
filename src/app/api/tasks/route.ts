import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { broadcast } from '@/lib/socket-emit'
import { positionBetween, parseLabels } from '@/lib/shared'

/**
 * POST /api/tasks — create a task in a board column.
 * Position = top of the target column (fractional indexing).
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const title = String(body.title || '').trim()
  const boardId = String(body.boardId || '')
  const status = String(body.status || 'TODO')
  const description = body.description ? String(body.description) : null
  const priority = String(body.priority || 'MEDIUM')
  const dueDate = body.dueDate ? new Date(body.dueDate) : null
  const assignedToId = body.assignedToId || null
  const labels = Array.isArray(body.labels) ? body.labels.slice(0, 6) : []

  if (!title || !boardId) {
    return NextResponse.json({ error: 'Title and boardId are required' }, { status: 400 })
  }

  // ---- Membership check ----
  const board = await db.board.findUnique({
    where: { id: boardId },
    include: { members: { select: { id: true } } },
  })
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 })
  const isMember = board.createdById === user.id || board.members.some((m) => m.id === user.id)
  if (!isMember) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  // ---- New task goes to TOP of column ----
  const topTask = await db.task.findFirst({
    where: { boardId, status },
    orderBy: { position: 'asc' },
  })
  const position = positionBetween(undefined, topTask?.position)

  const task = await db.task.create({
    data: {
      title,
      description,
      priority,
      status,
      position,
      dueDate,
      assignedToId,
      labels: JSON.stringify(labels),
      boardId,
    },
    include: {
      assignedTo: { select: { id: true, name: true, avatarColor: true } },
      comments: { include: { author: { select: { id: true, name: true, avatarColor: true } } } },
    },
  })

  await db.activity.create({
    data: { type: 'TASK_CREATED', message: `${user.name} created "${title}"`, boardId, userId: user.id },
  })

  await broadcast({
    room: `board:${boardId}`,
    event: 'task:created',
    data: { task: { ...task, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() }, by: user.id },
  })

  return NextResponse.json({ task }, { status: 201 })
}
