import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { db } from '@/lib/db'
import { getAuthUser, verifyToken } from '@/lib/auth'

type Params = { params: Promise<{ messageId: string }> }

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'chat')

/**
 * GET /api/attachments/[messageId] — stream a chat attachment from disk.
 *
 * Security (interview talking points):
 *  - Files live OUTSIDE public/, so they are never statically served —
 *    every request passes this membership check first.
 *  - Auth accepts the JWT either from the Authorization header (fetch/xhr)
 *    or from ?token= — <img> tags and download links cannot attach headers,
 *    so the query param is the standard fallback for browser-native requests.
 *  - The disk path is built ONLY from the DB messageId (cuid) — no user
 *    input ever reaches a filesystem path, so no traversal is possible.
 *  - Content-Disposition is `attachment` for non-images (and for
 *    ?download=1) so files download instead of executing/rendering inline;
 *    CSP header blocks any active content on inline images.
 */
export async function GET(req: NextRequest, { params }: Params) {
  // 1) auth — header first, then ?token= fallback for <img>/<a> requests
  let user = await getAuthUser(req)
  if (!user) {
    const token = req.nextUrl.searchParams.get('token')
    const payload = token ? verifyToken(token) : null
    if (payload) {
      user = await db.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, name: true, email: true, avatarColor: true },
      })
    }
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2) find the message + its board membership
  const { messageId } = await params
  const msg = await db.chatMessage.findUnique({
    where: { id: messageId },
    include: {
      board: {
        include: { members: { select: { id: true } } },
      },
    },
  })
  if (!msg || !msg.fileName) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }
  const allowed = msg.board.createdById === user.id || msg.board.members.some((m) => m.id === user.id)
  if (!allowed) {
    return NextResponse.json({ error: 'Not a member of this board' }, { status: 403 })
  }

  // 3) read from disk — name comes from the DB id only
  let data: Buffer
  try {
    data = await fs.readFile(path.join(UPLOAD_DIR, msg.id))
  } catch {
    return NextResponse.json({ error: 'File disk par nahi mili' }, { status: 404 })
  }

  // 4) serve — inline only for safe raster images, everything else downloads
  const isImage = !!msg.fileType?.startsWith('image/') && msg.fileType !== 'image/svg+xml'
  const forceDownload = req.nextUrl.searchParams.get('download') === '1'
  const disposition = forceDownload || !isImage ? 'attachment' : 'inline'
  const encodedName = encodeURIComponent(msg.fileName)

  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': msg.fileType || 'application/octet-stream',
      'Content-Length': String(data.length),
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  })
}
