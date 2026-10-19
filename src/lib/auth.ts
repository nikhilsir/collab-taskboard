import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-fallback'

export interface TokenPayload {
  userId: string
  email: string
}

/**
 * Sign a JWT token for a user (expires in 7 days)
 */
export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

/**
 * Verify JWT and return payload, or null if invalid/expired
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload
  } catch {
    return null
  }
}

/**
 * Extract user from Authorization: Bearer <token> header.
 * Returns null when missing/invalid — routes must handle 401 themselves.
 */
export async function getAuthUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  const payload = verifyToken(token)
  if (!payload) return null

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, email: true, avatarColor: true },
  })
  return user
}

/**
 * Hash a password with bcrypt (10 rounds)
 */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

/**
 * Compare plaintext password with bcrypt hash
 */
export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Generate a deterministic avatar color from user id
 */
const AVATAR_COLORS = [
  '#f43f5e', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#8b5cf6', '#ec4899', '#0ea5e9',
]
export function pickAvatarColor(seed: string): string {
  let sum = 0
  for (const ch of seed) sum += ch.charCodeAt(0)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}
