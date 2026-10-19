import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

export type AuthedContext = {
  user: { id: string; name: string; email: string; avatarColor: string }
  task: NonNullable<Awaited<ReturnType<typeof db.task.findUnique>>>
}

/**
 * Verifies JWT, loads the task and checks board membership.
 * Returns either an error response or the authed context.
 */
export async function requireTaskAccess(req: NextRequest, taskId: string) {
  const user = await getAuthUser(req)
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { board: { include: { members: { select: { id: true } } } } },
  })
  if (!task) {
    return { error: NextResponse.json({ error: 'Task not found' }, { status: 404 }) }
  }

  const isMember = task.board.createdById === user.id || task.board.members.some((m) => m.id === user.id)
  if (!isMember) {
    return { error: NextResponse.json({ error: 'You are not a member of this board' }, { status: 403 }) }
  }

  return { user, task }
}
