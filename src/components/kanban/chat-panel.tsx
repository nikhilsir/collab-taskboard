"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessagesSquare, SendHorizontal, Loader2 } from "lucide-react";
import { useKanbanStore } from "@/lib/store";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/kanban-socket";
import { UserAvatar } from "./user-avatar";
import type { ChatMessageDTO } from "@/lib/shared";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MAX_CONTENT = 2000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

/**
 * Board Chat — real-time group conversation for every board member.
 *
 * Data flow (interview-ready):
 *  1. Send: POST /api/boards/[id]/chat → DB write + socket broadcast.
 *     Sender appends the API response immediately (no echo wait).
 *  2. Receive: `chat:message` socket event → applyChatMessage (dedup by id,
 *     unread badge only when panel is closed).
 *  3. Typing: lightweight `chat:typing` socket relay, debounced 1.5s,
 *     auto-expires after 4s (pruned in the panel render + global timer).
 *  4. History: fetched each time the panel opens — always fresh.
 */
export function ChatPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const user = useKanbanStore((s) => s.user)
  const board = useKanbanStore((s) => s.board)
  const activeBoardId = useKanbanStore((s) => s.activeBoardId)
  const chatMessages = useKanbanStore((s) => s.chatMessages)
  const chatTyping = useKanbanStore((s) => s.chatTyping)
  const setChatMessages = useKanbanStore((s) => s.setChatMessages)
  const applyChatMessage = useKanbanStore((s) => s.applyChatMessage)

  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastTypingSent = useRef(0)

  // ---- fetch history whenever the panel opens ----
  useEffect(() => {
    if (!open || !activeBoardId) return
    let cancelled = false
    setLoading(true)
    api<{ messages: ChatMessageDTO[] }>(`/api/boards/${activeBoardId}/chat`)
      .then(({ messages }) => {
        if (!cancelled) setChatMessages(messages)
      })
      .catch(() => {
        if (!cancelled) toast.error("Chat history load nahi hui — dobara try karo")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, activeBoardId, setChatMessages])

  // ---- auto-scroll to latest message ----
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages.length, loading, scrollToBottom])

  // ---- send ----
  async function handleSend() {
    const text = draft.trim()
    if (!text || !activeBoardId || !user || sending) return
    setSending(true)
    try {
      const { message } = await api<{ message: ChatMessageDTO }>(
        `/api/boards/${activeBoardId}/chat`,
        { method: "POST", body: JSON.stringify({ content: text }) }
      )
      applyChatMessage(message, user.id)
      setDraft("")
      // small delay lets the new bubble mount first
      requestAnimationFrame(scrollToBottom)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Message send failed")
    } finally {
      setSending(false)
    }
  }

  // ---- typing signal (debounced to at most one emit per 1.5s) ----
  function handleDraftChange(value: string) {
    setDraft(value)
    const socket = getSocket()
    if (!socket || !activeBoardId) return
    const now = Date.now()
    if (value && now - lastTypingSent.current > 1500) {
      lastTypingSent.current = now
      socket.emit("chat:typing", { boardId: activeBoardId })
    }
  }

  // ---- typing indicator display (fresh entries only) ----
  const typingNames =
    user &&
    Object.entries(chatTyping)
      .filter(([uid, t]) => uid !== user.id && Date.now() - t.at < 4000)
      .map(([, t]) => t.name)

  if (!user || !board) return null

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-sm p-0 flex flex-col gap-0">
        <SheetHeader className="px-4 py-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <MessagesSquare className="h-4 w-4" /> Board Chat
          </SheetTitle>
          <SheetDescription>
            {board.members.length} member{board.members.length > 1 ? "s" : ""} • messages sab members ko live dikhte hain
          </SheetDescription>
        </SheetHeader>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-10">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
            </div>
          ) : chatMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <MessagesSquare className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium">No messages yet</p>
              <p className="text-xs text-muted-foreground max-w-[220px]">
                Board ke members ke saath discussion shuru karo — pehla message tumhara! 👋
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {chatMessages.map((m) => {
                const mine = m.author.id === user.id
                return (
                  <div key={m.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
                    <UserAvatar
                      name={m.author.name}
                      color={m.author.avatarColor}
                      size="sm"
                      className="shrink-0 mt-0.5"
                    />
                    <div className={cn("max-w-[75%]", mine && "items-end flex flex-col")}>
                      <div className="flex items-baseline gap-1.5 mb-0.5">
                        <span className="text-[11px] font-medium">
                          {mine ? "You" : m.author.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatTime(m.createdAt)}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "rounded-2xl px-3 py-2 text-sm leading-snug break-words whitespace-pre-wrap",
                          mine
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-muted rounded-tl-sm"
                        )}
                      >
                        {m.content}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Typing indicator + input */}
        <div className="border-t shrink-0 px-3 pt-1.5 pb-3 safe-bottom">
          <div className="h-4 flex items-center px-1">
            {typingNames && typingNames.length > 0 && (
              <p className="text-[11px] text-muted-foreground italic animate-pulse">
                {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value.slice(0, MAX_CONTENT))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Message likho…"
              className="h-10 flex-1"
              maxLength={MAX_CONTENT}
              aria-label="Chat message"
            />
            <Button
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={handleSend}
              disabled={!draft.trim() || sending}
              aria-label="Send message"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizontal className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
