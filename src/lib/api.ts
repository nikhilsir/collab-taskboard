/**
 * Authenticated fetch helper — attaches the JWT from localStorage
 * and normalizes error handling. Mirrors the axios interceptor
 * pattern commonly used in MERN apps.
 */
export const TOKEN_KEY = "kanban_token"
export const USER_KEY = "kanban_user"

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function storeAuth(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export interface AuthUser {
  id: string
  name: string
  email: string
  avatarColor: string
}

export class ApiError extends Error {
  status: number
  stale?: boolean
  constructor(status: number, message: string, stale?: boolean) {
    super(message)
    this.status = status
    this.stale = stale
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  }

  const res = await fetch(path, { ...options, headers })

  if (res.status === 401 && typeof window !== "undefined") {
    clearAuth()
    window.location.reload()
    throw new ApiError(401, "Session expired")
  }

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new ApiError(res.status, (json as { error?: string }).error || `Request failed (${res.status})`, (json as { stale?: boolean }).stale)
  }

  return json as T
}
