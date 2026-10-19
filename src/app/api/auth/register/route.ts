import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { signToken, hashPassword, pickAvatarColor } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')

    // ---- Validation ----
    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Name must be at least 2 characters' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // ---- Duplicate check ----
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    // ---- Create user ----
    const user = await db.user.create({
      data: {
        name,
        email,
        password: await hashPassword(password),
        avatarColor: pickAvatarColor(email),
      },
      select: { id: true, name: true, email: true, avatarColor: true },
    })

    const token = signToken({ userId: user.id, email: user.email })
    return NextResponse.json({ token, user }, { status: 201 })
  } catch (err) {
    console.error('[register]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
