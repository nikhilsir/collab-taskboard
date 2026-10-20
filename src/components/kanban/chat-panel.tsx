"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessagesSquare,
  SendHorizontal,
  Loader2,
  Smile,
  Paperclip,
  X,
  File as FileIcon,
  Download,
} from "lucide-react";
import { useKanbanStore } from "@/lib/store";
import { api, apiForm, getToken } from "@/lib/api";
import { getSocket } from "@/lib/kanban-socket";
import { UserAvatar } from "./user-avatar";
import type { ChatMessageDTO } from "@/lib/shared";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MAX_CONTENT = 2000;
const MAX_FILE_MB = 5;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

// Mirrors the server whitelist (server remains the authority)
const ACCEPT_ATTR =
  "image/png,image/jpeg,image/gif,image/webp,application/pdf," +
  "text/plain,text/markdown,text/csv,application/json," +
  ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.md,.csv";

// Flat picker grid — smileys → gestures → hearts/symbols → objects
const EMOJIS = [
  "😀", "😂", "🤣", "😊", "😍", "😎", "🤔", "😅",
  "😭", "😡", "🥳", "😴", "🤯", "🥺", "😏", "🙃",
  "👍", "👎", "👏", "🙏", "💪", "🤝", "👌", "✌️",
  "🫡", "👋", "🤞", "🫶", "🤗", "😇", "🤩", "😱",
  "❤️", "🧡", "💙", "💜", "💚", "💔", "🔥", "⭐",
  "🎉", "🎊", "✅", "❌", "💯", "⚡", "🚀", "🌟",
  "📌", "📎", "📅", "📝", "💡", "🐛", "🍕", "☕",
  "🎯", "🏆", "🫢", "😜", "🤨", "😮", "🥹", "🤫",
]

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function formatBytes(n?: number | null): string {
  if (typeof n !== "number" || n < 0) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// A message made only of emoji renders bigger (WhatsApp-style)
const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}\u{200D}\u{FE0F}\u{20E3}\s]+$/u

/**
 * Board Chat — real-time group conversation for every board member.
 *
 * Data flow (interview-ready):
 *  1. Send: POST /api/boards/[id]/chat (JSON for text, FormData when a
 *     file is attached) → DB write + disk write + socket broadcast.
 *     Sender appends the API response immediately (no echo wait).
 *  2. Receive: `chat:message` socket event → applyChatMessage (dedup by id,
 *     unread badge only when panel is closed).
 *  3. Typing: lightweight `chat:typing` socket relay, debounced 1.5s,
 *     auto-expires after 4s (pruned in the panel render + global timer).
 *  4. History: fetched each time the panel opens — always fresh.
 *  5. Attachments: file bytes never enter the DB — they live on disk,
 *     DB keeps metadata; downloads/images fetch via /api/attachments/[id]
 *     with ?token= because <img>/<a> cannot send Authorization headers.
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
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastTypingSent = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // ---- attachment pick (client-side pre-check; server is the authority) ----
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    e.target.value = "" // allow re-picking the same file after removing
    if (!f) return
    if (f.size > MAX_FILE_BYTES) {
      toast.error(`File ${MAX_FILE_MB} MB se chhoti honi chahiye — ye ${formatBytes(f.size)} ki hai`)
      return
    }
    setPendingFile(f)
  }

  // ---- send (text and/or file) ----
  async function handleSend() {
    const text = draft.trim()
    if ((!text && !pendingFile) || !activeBoardId || !user || sending) return
    setSending(true)
    try {
      let message: ChatMessageDTO
      if (pendingFile) {
        const form = new FormData()
        form.append("content", text)
        form.append("file", pendingFile)
        const res = await apiForm<{ message: ChatMessageDTO }>(
          `/api/boards/${activeBoardId}/chat`,
          form
        )
        message = res.message
      } else {
        const res = await api<{ message: ChatMessageDTO }>(
          `/api/boards/${activeBoardId}/chat`,
          { method: "POST", body: JSON.stringify({ content: text }) }
        )
        message = res.message
      }
      applyChatMessage(message, user.id)
      setDraft("")
      setPendingFile(null)
      setEmojiOpen(false)
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

  function appendEmoji(emoji: string) {
    handleDraftChange((draft + emoji).slice(0, MAX_CONTENT))
  }

  // ---- typing indicator display (fresh entries only) ----
  const typingNames =
    user &&
    Object.entries(chatTyping)
      .filter(([uid, t]) => uid !== user.id && Date.now() - t.at < 4000)
      .map(([, t]) => t.name)

  if (!user || !board) return null

  const token = getToken()

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
                const hasFile = !!m.fileName
                const fileUrl = m.fileUrl || (hasFile ? `/api/attachments/${m.id}` : null)
                const viewUrl = fileUrl && token ? `${fileUrl}?token=${token}` : null
                const downloadUrl = viewUrl ? `${viewUrl}&download=1` : null
                const isImage = !!m.fileType?.startsWith("image/") && m.fileType !== "image/svg+xml"
                const emojiOnly = !!m.content.trim() && EMOJI_ONLY_RE.test(m.content)
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
                          "rounded-2xl text-sm leading-snug break-words",
                          isImage && viewUrl ? "p-1.5" : "px-3 py-2",
                          hasFile && m.content && !(isImage && viewUrl) && "space-y-1.5",
                          mine
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-muted rounded-tl-sm"
                        )}
                      >
                        {/* image attachment → inline preview, click to open */}
                        {isImage && viewUrl ? (
                          <a
                            href={viewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block"
                            aria-label={`${m.fileName} — nayi tab me kholo`}
                          >
                            <img
                              src={viewUrl}
                              alt={m.fileName || "attachment"}
                              loading="lazy"
                              className="max-h-44 w-auto max-w-full rounded-xl object-cover"
                            />
                          </a>
                        ) : hasFile && downloadUrl ? (
                          /* file attachment → download card */
                          <a
                            href={downloadUrl}
                            className={cn(
                              "flex items-center gap-2 min-w-[170px] max-w-[220px] rounded-xl px-2.5 py-2 transition-colors",
                              mine ? "bg-primary-foreground/15 hover:bg-primary-foreground/25" : "bg-background/70 hover:bg-background"
                            )}
                            aria-label={`${m.fileName} download karo`}
                          >
                            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", mine ? "bg-primary-foreground/20" : "bg-muted")}>
                              <FileIcon className={cn("h-4 w-4", mine ? "text-primary-foreground" : "text-muted-foreground")} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={cn("block truncate text-xs font-medium", mine && "text-primary-foreground")}>
                                {m.fileName}
                              </span>
                              <span className={cn("block text-[10px]", mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
                                {formatBytes(m.fileSize)} • tap to download
                              </span>
                            </span>
                            <Download className={cn("h-3.5 w-3.5 shrink-0", mine ? "text-primary-foreground/80" : "text-muted-foreground")} />
                          </a>
                        ) : null}

                        {/* caption / text content */}
                        {m.content ? (
                          <p
                            className={cn(
                              "whitespace-pre-wrap",
                              isImage && viewUrl ? "px-1.5 pb-1 pt-0.5 text-xs" : "",
                              emojiOnly && "text-3xl leading-relaxed"
                            )}
                          >
                            {m.content}
                          </p>
                        ) : null}
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

          {/* pending attachment chip */}
          {pendingFile && (
            <div className="mx-1 mb-1.5 flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5">
              <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{pendingFile.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatBytes(pendingFile.size)}</p>
              </div>
              <button
                onClick={() => setPendingFile(null)}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="File hatao"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {/* emoji picker */}
            <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  aria-label="Emoji add karo"
                >
                  <Smile className="h-5 w-5 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" className="w-72 p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="grid grid-cols-8 gap-0.5 max-h-40 overflow-y-auto">
                  {EMOJIS.map((emoji, i) => (
                    <button
                      key={`${emoji}-${i}`}
                      type="button"
                      onClick={() => appendEmoji(emoji)}
                      className="flex h-8 w-8 items-center justify-center rounded text-lg leading-none transition-colors hover:bg-muted"
                      aria-label={`Emoji ${emoji} add karo`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* file attach */}
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              aria-label="File attach karo"
            >
              <Paperclip className="h-5 w-5 text-muted-foreground" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              onChange={handleFileChange}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />

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
              className="h-10 flex-1 min-w-0"
              maxLength={MAX_CONTENT}
              aria-label="Chat message"
            />
            <Button
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={handleSend}
              disabled={(!draft.trim() && !pendingFile) || sending}
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
