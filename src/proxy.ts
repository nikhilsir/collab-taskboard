import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// TEMPORARY debug proxy hook — captures incoming Host / X-Forwarded-Host
// headers to discover the preview gateway hostname. Safe: any logging
// failure is swallowed and traffic always continues normally.
// REMOVE after bot-id discovery.
export function proxy(request: NextRequest) {
  const h = request.headers
  const row = [
    `HOST=${h.get('host') ?? 'none'}`,
    `XFH=${h.get('x-forwarded-host') ?? 'none'}`,
    `XFP=${h.get('x-forwarded-proto') ?? 'none'}`,
    `XFF=${h.get('x-forwarded-for') ?? 'none'}`,
    `UA=${(h.get('user-agent') ?? 'none').slice(0, 60)}`,
    `PATH=${request.nextUrl.pathname}`,
  ].join(' ')
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs')
    fs.appendFileSync('/home/z/my-project/scripts/host_log.txt', `${new Date().toISOString()} ${row}\n`)
  } catch {
    // fs unavailable — fall through
  }
  return NextResponse.next()
}

export default proxy

export const config = {
  matcher: ['/'],
}
