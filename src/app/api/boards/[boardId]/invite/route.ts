import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { broadcast } from '@/lib/socket-emit'

type Params = { params: Promise<{ boardId: string }> }

/**
 * POST /api/boards/[boardId]/invite — add a member by email.
 * Only the board owner can invite.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId } = await params
  const body = await req.json()
  const email = String(body.email || '').trim().toLowerCase()

  const board = await db.board.findUnique({ where: { id: boardId } })
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 })

  // ---- Only owner can invite ----
  if (board.createdById !== user.id) {
    return NextResponse.json({ error: 'Only the board owner can invite members' }, { status: 403 })
  }

  const invitee = await db.user.findUnique({ where: { email } })
  if (!invitee) {
    return NextResponse.json({ error: 'No user found with this email. Ask them to sign up first.' }, { status: 404 })
  }

  // ---- Already a member? ----
  const existing = await db.board.findFirst({
    where: { id: boardId, members: { some: { id: invitee.id } } },
  })
  const isOwner = board.createdById === invitee.id
  if (existing || isOwner) {
    return NextResponse.json({ error: 'User is already a member of this board' }, { status: 409 })
  }

  await db.board.update({
    where: { id: boardId },
    data: { members: { connect: { id: invitee.id } } },
  })

  const memberDTO = { id: invitee.id, name: invitee.name, email: invitee.email, avatarColor: invitee.avatarColor }

  // Activity + real-time notify the whole room
  await db.activity.create({
    data: {
      type: 'MEMBER_JOINED',
      message: `${invitee.name} joined the board`,
      boardId,
      userId: invitee.id,
    },
  })
  await broadcast({
    room: `board:${boardId}`,
    event: 'member:joined',
    data: { member: memberDTO, message: `${invitee.name} joined the board` },
  })

  return NextResponse.json({ member: memberDTO }, { status: 201 })
}
