import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { signToken, comparePassword } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const valid = await comparePassword(password, user.password)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const token = signToken({ userId: user.id, email: user.email })
    return NextResponse.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, avatarColor: user.avatarColor },
    })
  } catch (err) {
    console.error('[login]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
