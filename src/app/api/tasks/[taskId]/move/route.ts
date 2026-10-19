import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { broadcast } from '@/lib/socket-emit'
import { requireTaskAccess } from '@/lib/task-access'
import { positionBetween, STATUSES } from '@/lib/shared'

type Params = { params: Promise<{ taskId: string }> }

/**
 * PATCH /api/tasks/[taskId]/move — drag & drop move.
 *
 * Race-condition safe:
 * 1. Client sends the task `version` it saw. If the DB version is newer
 *    (someone else moved it meanwhile), we reject with 409 — client resyncs.
 * 2. New position is computed server-side with fractional indexing,
 *    so only THIS row is written — neighbours are untouched.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { taskId } = await params
  const ctx = await requireTaskAccess(req, taskId)
  if (ctx.error) return ctx.error
  const { user, task } = ctx

  const body = await req.json()
  const status = String(body.status || '')
  const beforeTaskId = body.beforeTaskId || null // id of task that will be AFTER ours (null = end of list)
  const afterTaskId = body.afterTaskId || null   // id of task that will be BEFORE ours (null = top)
  const clientVersion = Number(body.version ?? -1)

  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // ---- Version guard: reject moves based on stale data ----
  if (clientVersion !== -1 && clientVersion !== task.version) {
    return NextResponse.json(
      { error: 'Task was modified by someone else. Resyncing...', stale: true },
      { status: 409 }
    )
  }

  // ---- Compute fractional position from neighbours (server = source of truth) ----
  let afterPos: number | undefined
  let beforePos: number | undefined

  if (afterTaskId) {
    const after = await db.task.findUnique({ where: { id: afterTaskId }, select: { position: true } })
    afterPos = after?.position
  }
  if (beforeTaskId) {
    const before = await db.task.findUnique({ where: { id: beforeTaskId }, select: { position: true } })
    beforePos = before?.position
  }

  const position = positionBetween(afterPos, beforePos)

  const updated = await db.task.update({
    where: { id: taskId },
    data: { status, position, version: { increment: 1 } },
    include: {
      assignedTo: { select: { id: true, name: true, avatarColor: true } },
      comments: { include: { author: { select: { id: true, name: true, avatarColor: true } } } },
    },
  })

  await db.activity.create({
    data: {
      type: 'TASK_MOVED',
      message: `${user.name} moved "${updated.title}" to ${status.replace('_', ' ')}`,
      boardId: updated.boardId,
      userId: user.id,
    },
  })

  await broadcast({
    room: `board:${updated.boardId}`,
    event: 'task:moved',
    data: { task: updated, by: user.id },
  })

  return NextResponse.json({ task: updated })
}
