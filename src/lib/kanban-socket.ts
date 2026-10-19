"use client";

import { io, Socket } from "socket.io-client";
import type { AuthUser } from "@/lib/api";

/**
 * Socket.io client singleton.
 *
 * IMPORTANT (sandbox gateway): the URL is ALWAYS `/?XTransformPort=3003`
 * with path `/` — Caddy forwards it to the socket mini-service.
 * Never write a port or localhost in the client URL.
 *
 * JWT is passed in the auth payload — the server verifies it during
 * the handshake (socket-level authentication).
 */
let socket: Socket | null = null

export function connectSocket(user: AuthUser): Socket {
  if (socket?.connected) return socket

  if (socket) socket.disconnect()

  const auth = {
    token: localStorage.getItem("kanban_token"),
    name: user.name,
    avatarColor: user.avatarColor,
  }
  const common = {
    auth,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity, // keep trying — we resync on reconnect
    reconnectionDelay: 1000,
    timeout: 10000,
  }

  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    // Production (Render): same-origin custom server, socket.io at /socket.io
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL, { ...common, path: "/socket.io" })
  } else {
    // Sandbox (Caddy gateway): forwards /?XTransformPort=3003 to the mini-service
    socket = io("/?XTransformPort=3003", { ...common, path: "/" })
  }

  return socket
}

export function getSocket(): Socket | null {
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
