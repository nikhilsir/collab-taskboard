import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

/**
 * GET /api/users/search?q=<email-or-name>
 * Used by the invite dialog to find users by email.
 */
export async function GET(req: NextRequest) {
  const me = await getAuthUser(req)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim().toLowerCase() || ''
  if (q.length < 2) return NextResponse.json({ users: [] })

  const users = await db.user.findMany({
    where: {
      AND: [
        { id: { not: me.id } },
        {
          OR: [
            { email: { contains: q } },
            { name: { contains: q } },
          ],
        },
      ],
    },
    select: { id: true, name: true, email: true, avatarColor: true },
    take: 5,
  })

  return NextResponse.json({ users })
}
