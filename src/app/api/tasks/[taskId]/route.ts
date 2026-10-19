import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { broadcast } from '@/lib/socket-emit'
import { requireTaskAccess } from '@/lib/task-access'

type Params = { params: Promise<{ taskId: string }> }

/**
 * PATCH /api/tasks/[taskId] — edit task fields via the task modal.
 * Also updates `version` so concurrent edits can be detected.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { taskId } = await params
  const ctx = await requireTaskAccess(req, taskId)
  if (ctx.error) return ctx.error
  const { user, task } = ctx

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.title !== undefined) {
    const title = String(body.title).trim()
    if (!title) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
    data.title = title
  }
  if (body.description !== undefined) data.description = body.description ? String(body.description) : null
  if (body.priority !== undefined) data.priority = String(body.priority)
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId || null
  if (body.labels !== undefined && Array.isArray(body.labels)) data.labels = JSON.stringify(body.labels.slice(0, 6))

  // Status change from the modal (dropdown) — keep position inside new column
  if (body.status !== undefined && body.status !== task.status) {
    const topTask = await db.task.findFirst({
      where: { boardId: task.boardId, status: String(body.status) },
      orderBy: { position: 'asc' },
    })
    data.status = String(body.status)
    data.position = topTask ? topTask.position / 2 : 1000
  }

  data.version = { increment: 1 }

  const updated = await db.task.update({
    where: { id: taskId },
    data,
    include: {
      assignedTo: { select: { id: true, name: true, avatarColor: true } },
      comments: { include: { author: { select: { id: true, name: true, avatarColor: true } } } },
    },
  })

  await db.activity.create({
    data: { type: 'TASK_UPDATED', message: `${user.name} updated "${updated.title}"`, boardId: updated.boardId, userId: user.id },
  })

  await broadcast({
    room: `board:${updated.boardId}`,
    event: 'task:updated',
    data: { task: updated, by: user.id },
  })

  return NextResponse.json({ task: updated })
}

/**
 * DELETE /api/tasks/[taskId]
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { taskId } = await params
  const ctx = await requireTaskAccess(req, taskId)
  if (ctx.error) return ctx.error
  const { user, task } = ctx

  await db.task.delete({ where: { id: taskId } })

  await db.activity.create({
    data: { type: 'TASK_DELETED', message: `${user.name} deleted "${task.title}"`, boardId: task.boardId, userId: user.id },
  })

  await broadcast({
    room: `board:${task.boardId}`,
    event: 'task:deleted',
    data: { taskId, by: user.id },
  })

  return NextResponse.json({ success: true })
}
