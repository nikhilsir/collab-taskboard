"use client";

import { useEffect, useRef, useState } from "react";
import { useKanbanStore } from "@/lib/store";
import { connectSocket, getSocket, disconnectSocket } from "@/lib/kanban-socket";
import { AuthUser, TaskDTO } from "@/lib/api";
import type { ChatMessageDTO } from "@/lib/shared";
import { AuthScreen } from "@/components/kanban/auth-screen";
import { BoardSidebar } from "@/components/kanban/board-sidebar";
import { BoardHeader } from "@/components/kanban/board-header";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { TaskModal } from "@/components/kanban/task-modal";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Menu, KanbanSquare, Zap } from "lucide-react";
import { toast } from "sonner";

/**
 * CollabKanban — single-page app (sandbox serves only `/`).
 *
 * Real-time wiring:
 *  - One socket connection per authenticated session
 *  - Join/leave board rooms on selection change
 *  - All events de-duplicated + self-events skipped (server already
 *    applied them via the API response)
 *  - On reconnect → full board resync (never trust stale state)
 */
export default function Page() {
  const user = useKanbanStore((s) => s.user)
  const authChecked = useKanbanStore((s) => s.authChecked)
  const initAuth = useKanbanStore((s) => s.initAuth)
  const logout = useKanbanStore((s) => s.logout)

  const boards = useKanbanStore((s) => s.boards)
  const loadBoards = useKanbanStore((s) => s.loadBoards)
  const activeBoardId = useKanbanStore((s) => s.activeBoardId)
  const board = useKanbanStore((s) => s.board)
  const boardLoading = useKanbanStore((s) => s.boardLoading)
  const loadBoard = useKanbanStore((s) => s.loadBoard)

  const applyTask = useKanbanStore((s) => s.applyTask)
  const removeTask = useKanbanStore((s) => s.removeTask)
  const applyComment = useKanbanStore((s) => s.applyComment)
  const applyMemberJoined = useKanbanStore((s) => s.applyMemberJoined)
  const setConnection = useKanbanStore((s) => s.setConnection)
  const setOnlineUsers = useKanbanStore((s) => s.setOnlineUsers)
  const markTyping = useKanbanStore((s) => s.markTyping)
  const refreshBoard = useKanbanStore((s) => s.refreshBoard)
  const setActiveBoard = useKanbanStore((s) => s.setActiveBoard)
  const applyChatMessage = useKanbanStore((s) => s.applyChatMessage)
  const markChatTyping = useKanbanStore((s) => s.markChatTyping)

  // modal state: edit task | create (status) | closed
  const [modalState, setModalState] = useState<{
    open: boolean
    task: TaskDTO | null
    createStatus: string
  }>({ open: false, task: null, createStatus: "TODO" })

  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const wasConnected = useRef(false)

  // ---------- auth bootstrap ----------
  useEffect(() => {
    initAuth()
  }, [initAuth])

  useEffect(() => {
    if (user) loadBoards()
  }, [user, loadBoards])

  // auto-select first board
  useEffect(() => {
    if (user && !activeBoardId && boards.length > 0) {
      setActiveBoard(boards[0].id)
    }
  }, [user, boards, activeBoardId, setActiveBoard])

  // load board data on selection change
  useEffect(() => {
    if (user && activeBoardId) {
      loadBoard(activeBoardId).catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load board")
      })
    }
  }, [user, activeBoardId, loadBoard])

  // ---------- socket lifecycle ----------
  useEffect(() => {
    if (!user) {
      disconnectSocket()
      wasConnected.current = false
      return
    }

    const socket = connectSocket(user)

    const onConnect = () => {
      setConnection("online")
      // Reconnect resync: if this is NOT the first connect,
      // we might have missed events → fetch fresh board state
      if (wasConnected.current) {
        toast.info("Connection restored — resyncing board…")
        refreshBoard()
      }
      wasConnected.current = true
    }
    const onDisconnect = () => setConnection("offline")
    const onConnectError = () => setConnection("offline")

    // ---- real-time event handlers ----
    const onTaskCreated = (data: { task: TaskDTO; by: string }) => {
      if (data.by === user.id) return // own event already applied via API response
      applyTask(data.task)
      toast.success(`New task: "${data.task.title}"`)
    }
    const onTaskUpdated = (data: { task: TaskDTO; by: string }) => {
      if (data.by === user.id) return
      applyTask(data.task)
    }
    const onTaskMoved = (data: { task: TaskDTO; by: string }) => {
      if (data.by === user.id) return
      applyTask(data.task)
    }
    const onTaskDeleted = (data: { taskId: string; by: string }) => {
      if (data.by === user.id) return
      removeTask(data.taskId)
    }
    const onCommentAdded = (data: { taskId: string; comment: NonNullable<TaskDTO["comments"]>[number]; by: string }) => {
      if (data.by === user.id) return
      applyComment(data.taskId, data.comment)
    }
    const onMemberJoined = (data: { member: { id: string; name: string; email: string; avatarColor: string }; message: string }) => {
      applyMemberJoined(data.member, data.message)
      if (data.member.id !== user.id) toast.info(data.message)
    }
    const onPresenceUpdate = (data: { onlineUsers: { userId: string; name: string; avatarColor: string }[] }) => {
      setOnlineUsers(data.onlineUsers)
    }
    const onUserTyping = (data: { userId: string; name: string; at: number }) => {
      markTyping(data.userId, data.name)
    }
    const onChatMessage = (data: { message: ChatMessageDTO; by: string }) => {
      if (data.by === user.id) return // own message already applied via API response
      applyChatMessage(data.message, data.by)
    }
    const onChatTyping = (data: { userId: string; name: string; at: number }) => {
      markChatTyping(data.userId, data.name)
    }
    const onAuthError = () => {
      toast.error("Session expired — please login again")
      logout()
    }

    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    socket.on("connect_error", onConnectError)
    socket.on("task:created", onTaskCreated)
    socket.on("task:updated", onTaskUpdated)
    socket.on("task:moved", onTaskMoved)
    socket.on("task:deleted", onTaskDeleted)
    socket.on("comment:added", onCommentAdded)
    socket.on("member:joined", onMemberJoined)
    socket.on("presence:update", onPresenceUpdate)
    socket.on("user:typing", onUserTyping)
    socket.on("chat:message", onChatMessage)
    socket.on("chat:typing", onChatTyping)
    socket.on("auth:error", onAuthError)

    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      socket.off("connect_error", onConnectError)
      socket.off("task:created", onTaskCreated)
      socket.off("task:updated", onTaskUpdated)
      socket.off("task:moved", onTaskMoved)
      socket.off("task:deleted", onTaskDeleted)
      socket.off("comment:added", onCommentAdded)
      socket.off("member:joined", onMemberJoined)
      socket.off("presence:update", onPresenceUpdate)
      socket.off("user:typing", onUserTyping)
      socket.off("chat:message", onChatMessage)
      socket.off("chat:typing", onChatTyping)
      socket.off("auth:error", onAuthError)
    }
  }, [user, applyTask, removeTask, applyComment, applyMemberJoined, setConnection, setOnlineUsers, markTyping, refreshBoard, logout, applyChatMessage, markChatTyping])

  // ---------- room join/leave on board switch ----------
  useEffect(() => {
    const socket = getSocket()
    if (!socket || !user || !activeBoardId) return

    socket.emit("board:join", { boardId: activeBoardId }, (res: { ok: boolean; error?: string }) => {
      if (res && !res.ok) {
        toast.error(res.error || "Cannot join board room")
      }
    })

    return () => {
      socket.emit("board:leave", { boardId: activeBoardId })
    }
  }, [user, activeBoardId])

  // ---------- prune stale typing indicators (tasks + chat) ----------
  useEffect(() => {
    const timer = setInterval(() => {
      const { typingUsers, chatTyping } = useKanbanStore.getState()
      const now = Date.now()
      const stale = Object.entries(typingUsers).filter(([, t]) => now - t.at >= 4000)
      const staleChat = Object.entries(chatTyping).filter(([, t]) => now - t.at >= 4000)
      if (stale.length > 0 || staleChat.length > 0) {
        useKanbanStore.setState((s) => {
          const next = { ...s.typingUsers }
          for (const [uid] of stale) delete next[uid]
          const nextChat = { ...s.chatTyping }
          for (const [uid] of staleChat) delete nextChat[uid]
          return { typingUsers: next, chatTyping: nextChat }
        })
      }
    }, 1500)
    return () => clearInterval(timer)
  }, [])

  // ---------- render gates ----------
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <KanbanSquare className="h-6 w-6 animate-pulse" />
          <span>Loading workspace…</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <AuthScreen
        onAuthed={(u: AuthUser) => {
          useKanbanStore.setState({ user: u })
        }}
      />
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-64 border-r shrink-0">
        <BoardSidebar />
      </aside>

      {/* Mobile sidebar drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetTrigger asChild>
          <Button size="icon" variant="outline" className="md:hidden absolute top-3 left-3 z-30 h-9 w-9">
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-72">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <BoardSidebar onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {board || boardLoading ? (
          <>
            <BoardHeader />
            <div className="flex-1 overflow-x-auto overflow-y-hidden pt-3">
              {boardLoading && !board ? (
                <div className="flex gap-3 px-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-[280px] shrink-0 space-y-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-24 w-full" />
                      <Skeleton className="h-24 w-full" />
                    </div>
                  ))}
                </div>
              ) : board ? (
                <KanbanBoard
                  onOpenTask={(task) => setModalState({ open: true, task, createStatus: task.status })}
                  onCreateTask={(status) => setModalState({ open: true, task: null, createStatus: status })}
                />
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold">Welcome, {user.name.split(" ")[0]}! 👋</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              {boards.length === 0
                ? "Create your first board from the sidebar and start collaborating in real-time."
                : "Select a board from the sidebar to view your tasks."}
            </p>
          </div>
        )}
      </main>

      {/* Task create/edit modal */}
      <TaskModal
        open={modalState.open}
        task={modalState.task}
        createStatus={modalState.createStatus}
        onClose={() => setModalState({ open: false, task: null, createStatus: "TODO" })}
      />
    </div>
  )
}
