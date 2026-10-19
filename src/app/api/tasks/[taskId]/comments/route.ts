import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { broadcast } from '@/lib/socket-emit'
import { requireTaskAccess } from '@/lib/task-access'

type Params = { params: Promise<{ taskId: string }> }

/**
 * POST /api/tasks/[taskId]/comments — add a comment to a task (bonus feature)
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { taskId } = await params
  const ctx = await requireTaskAccess(req, taskId)
  if (ctx.error) return ctx.error
  const { user, task } = ctx

  const body = await req.json()
  const content = String(body.content || '').trim()
  if (!content) return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 })

  const comment = await db.comment.create({
    data: { content, taskId, authorId: user.id },
    include: { author: { select: { id: true, name: true, avatarColor: true } } },
  })

  await db.activity.create({
    data: { type: 'COMMENT_ADDED', message: `${user.name} commented on "${task.title}"`, boardId: task.boardId, userId: user.id },
  })

  await broadcast({
    room: `board:${task.boardId}`,
    event: 'comment:added',
    data: { taskId, comment, by: user.id },
  })

  return NextResponse.json({ comment }, { status: 201 })
}
