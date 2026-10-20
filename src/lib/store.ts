"use client";

import { create } from "zustand";
import { api, clearAuth, getStoredUser, getToken, AuthUser } from "@/lib/api";
import type { TaskDTO, BoardDataDTO, BoardMember, ActivityDTO, ChatMessageDTO } from "@/lib/shared";

/**
 * Zustand store — single source of client state.
 *
 * Design decisions (interview talking points):
 *  - Board data lives here; socket events dispatch targeted actions so
 *    only the affected task triggers re-renders (granular state updates).
 *  - Optimistic updates for drag & drop with rollback on failure.
 *  - Event de-duplication via eventId set (socket reconnects can replay).
 */

export interface BoardSummary {
  id: string
  title: string
  createdById: string
  owner: { id: string; name: string; avatarColor: string }
  members: { id: string; name: string; avatarColor: string }[]
  _count: { tasks: number }
}

export interface Filters {
  search: string
  priority: string // "ALL" | LOW | MEDIUM | HIGH | URGENT
  assignee: string // "ALL" | "UNASSIGNED" | userId
  due: string // "ALL" | "OVERDUE" | "TODAY" | "WEEK" | "NO_DATE"
}

interface KanbanState {
  // ---- auth ----
  user: AuthUser | null
  authChecked: boolean

  // ---- boards list ----
  boards: BoardSummary[]
  boardsLoading: boolean
  activeBoardId: string | null

  // ---- board data ----
  board: BoardDataDTO | null
  boardLoading: boolean
  connectionStatus: "connecting" | "online" | "offline"
  onlineUsers: { userId: string; name: string; avatarColor: string }[]
  typingUsers: Record<string, { name: string; at: number }>

  // ---- board chat ----
  chatMessages: ChatMessageDTO[]
  chatOpen: boolean
  chatUnread: number
  chatTyping: Record<string, { name: string; at: number }>

  // ---- filters ----
  filters: Filters

  // ---- processed event dedup ----
  seenEvents: Set<string>

  // ---- actions ----
  initAuth: () => Promise<void>
  logout: () => void
  loadBoards: () => Promise<void>
  setActiveBoard: (id: string | null) => void
  loadBoard: (id: string) => Promise<void>
  refreshBoard: () => Promise<void>
  applyTask: (task: TaskDTO) => void
  removeTask: (taskId: string) => void
  applyComment: (taskId: string, comment: TaskDTO["comments"] extends (infer C)[] | undefined ? C : never) => void
  applyMemberJoined: (member: BoardMember, message: string) => void
  applyActivity: (activity: ActivityDTO) => void
  moveTaskOptimistic: (taskId: string, status: string, position: number) => void
  rollbackTask: (task: TaskDTO) => void
  setConnection: (s: "connecting" | "online" | "offline") => void
  setOnlineUsers: (users: KanbanState["onlineUsers"]) => void
  markTyping: (userId: string, name: string) => void
  setFilters: (f: Partial<Filters>) => void
  markEventSeen: (eventId: string) => boolean
  setChatOpen: (open: boolean) => void
  setChatMessages: (messages: ChatMessageDTO[]) => void
  applyChatMessage: (message: ChatMessageDTO, byUserId: string) => void
  markChatTyping: (userId: string, name: string) => void
  clearChat: () => void
}

export const useKanbanStore = create<KanbanState>((set, get) => ({
  user: null,
  authChecked: false,

  boards: [],
  boardsLoading: false,
  activeBoardId: null,

  board: null,
  boardLoading: false,
  connectionStatus: "connecting",
  onlineUsers: [],
  typingUsers: {},

  chatMessages: [],
  chatOpen: false,
  chatUnread: 0,
  chatTyping: {},

  filters: { search: "", priority: "ALL", assignee: "ALL", due: "ALL" },

  seenEvents: new Set(),

  // ---------- auth ----------
  initAuth: async () => {
    const token = getToken()
    const stored = getStoredUser()
    if (!token || !stored) {
      set({ authChecked: true, user: null })
      return
    }
    try {
      const { user } = await api<{ user: AuthUser }>("/api/auth/me")
      set({ user, authChecked: true })
    } catch {
      clearAuth()
      set({ authChecked: true, user: null })
    }
  },

  logout: () => {
    clearAuth()
    set({ user: null, board: null, activeBoardId: null, boards: [] })
  },

  // ---------- boards ----------
  loadBoards: async () => {
    set({ boardsLoading: true })
    try {
      const { boards } = await api<{ boards: BoardSummary[] }>("/api/boards")
      set({ boards, boardsLoading: false })
    } catch {
      set({ boardsLoading: false })
    }
  },

  setActiveBoard: (id) => {
    set({
      activeBoardId: id,
      board: id ? get().board?.id === id ? get().board : null : null,
      typingUsers: {},
      chatMessages: [],
      chatUnread: 0,
      chatTyping: {},
    })
  },

  loadBoard: async (id) => {
    set({ boardLoading: true, activeBoardId: id })
    try {
      const { board } = await api<{ board: BoardDataDTO }>(`/api/boards/${id}`)
      set({ board, boardLoading: false })
    } catch (err) {
      set({ board: null, boardLoading: false, activeBoardId: null })
      throw err
    }
  },

  refreshBoard: async () => {
    const id = get().activeBoardId
    if (!id) return
    try {
      const { board } = await api<{ board: BoardDataDTO }>(`/api/boards/${id}`)
      set({ board })
    } catch {
      // keep stale data on refresh failure
    }
  },

  // ---------- real-time appliers ----------
  applyTask: (task) => {
    const board = get().board
    if (!board || board.id !== task.boardId) return
    const exists = board.tasks.some((t) => t.id === task.id)
    set({
      board: {
        ...board,
        tasks: exists
          ? board.tasks.map((t) => (t.id === task.id ? task : t))
          : [task, ...board.tasks],
      },
    })
  },

  removeTask: (taskId) => {
    const board = get().board
    if (!board) return
    set({ board: { ...board, tasks: board.tasks.filter((t) => t.id !== taskId) } })
  },

  applyComment: (taskId, comment) => {
    const board = get().board
    if (!board) return
    set({
      board: {
        ...board,
        tasks: board.tasks.map((t) =>
          t.id === taskId ? { ...t, comments: [...(t.comments || []), comment] } : t
        ),
      },
    })
  },

  applyMemberJoined: (member, _message) => {
    const board = get().board
    if (!board) return
    if (board.members.some((m) => m.id === member.id)) return
    set({ board: { ...board, members: [...board.members, member] } })
  },

  applyActivity: (activity) => {
    const board = get().board
    if (!board || board.id !== activity.boardId) return
    set({ board: { ...board, activities: [activity, ...board.activities].slice(0, 30) } })
  },

  moveTaskOptimistic: (taskId, status, position) => {
    const board = get().board
    if (!board) return
    set({
      board: {
        ...board,
        tasks: board.tasks.map((t) =>
          t.id === taskId ? { ...t, status, position } : t
        ),
      },
    })
  },

  rollbackTask: (task) => {
    get().applyTask(task)
  },

  // ---------- presence ----------
  setConnection: (s) => set({ connectionStatus: s }),

  setOnlineUsers: (users) => set({ onlineUsers: users }),

  markTyping: (userId, name) => {
    set((s) => ({ typingUsers: { ...s.typingUsers, [userId]: { name, at: Date.now() } } }))
  },

  // ---------- board chat ----------
  setChatOpen: (open) => {
    set({ chatOpen: open, ...(open ? { chatUnread: 0 } : {}) })
  },

  setChatMessages: (messages) => set({ chatMessages: messages }),

  applyChatMessage: (message, byUserId) => {
    const { chatMessages, chatOpen } = get()
    if (chatMessages.some((m) => m.id === message.id)) return // dedup
    set({
      chatMessages: [...chatMessages, message],
      chatUnread: chatOpen || byUserId === get().user?.id ? get().chatUnread : get().chatUnread + 1,
    })
  },

  markChatTyping: (userId, name) => {
    set((s) => ({ chatTyping: { ...s.chatTyping, [userId]: { name, at: Date.now() } } }))
  },

  clearChat: () => set({ chatMessages: [], chatUnread: 0, chatTyping: {} }),

  // ---------- filters ----------
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),

  // ---------- event dedup ----------
  markEventSeen: (eventId) => {
    const seen = get().seenEvents
    if (seen.has(eventId)) return false
    const next = new Set(seen)
    next.add(eventId)
    // keep the set bounded
    if (next.size > 500) {
      const arr = Array.from(next)
      next.clear()
      arr.slice(-200).forEach((e) => next.add(e))
    }
    set({ seenEvents: next })
    return true
  },
}))

// Derived: filtered tasks per column (computed at render, not stored)
export function filterTasks(
  tasks: TaskDTO[],
  filters: Filters,
  currentUserId: string
): TaskDTO[] {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  return tasks.filter((t) => {
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const hay = `${t.title} ${t.description || ""}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filters.priority !== "ALL" && t.priority !== filters.priority) return false
    if (filters.assignee === "UNASSIGNED" && t.assignedToId) return false
    if (filters.assignee !== "ALL" && filters.assignee !== "UNASSIGNED" && t.assignedToId !== filters.assignee) return false
    if (filters.due !== "ALL") {
      if (filters.due === "NO_DATE" && t.dueDate) return false
      if (filters.due !== "NO_DATE") {
        if (!t.dueDate) return false
        const due = new Date(t.dueDate)
        const dueStr = due.toISOString().slice(0, 10)
        if (filters.due === "OVERDUE" && !(due < now && dueStr !== todayStr)) return false
        if (filters.due === "TODAY" && dueStr !== todayStr) return false
        if (filters.due === "WEEK" && !(due <= weekEnd && due >= now)) return false
      }
    }
    return true
  })
}
