import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { broadcast } from '@/lib/socket-emit'

type Params = { params: Promise<{ boardId: string }> }

const MAX_CONTENT = 2000
const HISTORY_LIMIT = 200

// Attachment limits — files live on disk, DB only stores metadata
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'chat')

// Whitelist approach: block executables/scripts by default.
// SVG deliberately excluded — inline SVG from our origin is stored-XSS risk.
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
])

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

/** Strip path segments & control chars so the name is safe to render/download. */
function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? 'file'
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return (clean || 'file').slice(0, 120)
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
 *
 * Accepts two body shapes:
 *  - JSON  { content }                 → text-only message
 *  - FormData { content?, file? }      → text and/or one attachment (≤5MB)
 *
 * File bytes are written to uploads/chat/<messageId> on disk; the DB row
 * keeps only metadata (name/size/type/url). Persisted to DB, then
 * broadcast `chat:message` to the board room.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId } = await params
  const board = await assertMember(boardId, user.id)
  if (!board) return NextResponse.json({ error: 'Board not found or not a member' }, { status: 403 })

  const isMultipart = (req.headers.get('content-type') ?? '').includes('multipart/form-data')

  let text = ''
  let file: File | null = null

  if (isMultipart) {
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }
    const c = form.get('content')
    if (typeof c === 'string') text = c.trim().slice(0, MAX_CONTENT)
    const f = form.get('file')
    if (f instanceof File && f.size > 0) file = f
  } else {
    try {
      const body = await req.json()
      if (typeof body?.content === 'string') text = body.content.trim().slice(0, MAX_CONTENT)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
  }

  if (!text && !file) {
    return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 })
  }

  // ---- attachment validation (size, type, name) ----
  let fileName: string | undefined
  if (file) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File 5 MB se chhoti honi chahiye' }, { status: 413 })
    }
    if (!file.type || !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Ye file type allowed nahi hai (images, PDF, docs, zip hi chalti hain)' }, { status: 415 })
    }
    fileName = sanitizeFileName(file.name)
  }

  // 1) DB row first (metadata without url), so we have a stable id for the disk file
  const created = await db.chatMessage.create({
    data: {
      content: text,
      boardId,
      authorId: user.id,
      ...(file ? { fileName: fileName!, fileSize: file.size, fileType: file.type } : {}),
    },
    include: { author: { select: { id: true, name: true, avatarColor: true } } },
  })

  // 2) file bytes → disk, metadata url → DB. On failure: no orphan DB row.
  if (file) {
    try {
      await fs.mkdir(UPLOAD_DIR, { recursive: true })
      // deterministic disk name = messageId (Content-Type comes from DB metadata)
      await fs.writeFile(path.join(UPLOAD_DIR, created.id), Buffer.from(await file.arrayBuffer()))
      const updated = await db.chatMessage.update({
        where: { id: created.id },
        data: { fileUrl: `/api/attachments/${created.id}` },
        include: { author: { select: { id: true, name: true, avatarColor: true } } },
      })
      Object.assign(created, updated)
    } catch {
      await db.chatMessage.delete({ where: { id: created.id } }).catch(() => {})
      return NextResponse.json({ error: 'File save nahi hui — dobara try karo' }, { status: 500 })
    }
  }

  const message = { ...created, createdAt: created.createdAt.toISOString() }

  // Real-time fan-out to everyone in the board room
  await broadcast({
    room: `board:${boardId}`,
    event: 'chat:message',
    data: { message, by: user.id },
  })

  return NextResponse.json({ message }, { status: 201 })
}
