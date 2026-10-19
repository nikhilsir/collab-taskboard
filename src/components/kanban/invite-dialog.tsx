"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, UserPlus, Search } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useKanbanStore } from "@/lib/store";
import { UserAvatar } from "./user-avatar";
import type { BoardMember } from "@/lib/shared";

/**
 * Invite members dialog — search users by email/name,
 * owner-only action. Live notified to the room via socket.
 */
export function InviteDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const board = useKanbanStore((s) => s.board)
  const applyMemberJoined = useKanbanStore((s) => s.applyMemberJoined)
  const user = useKanbanStore((s) => s.user)

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<BoardMember[]>([])
  const [searching, setSearching] = useState(false)
  const [inviting, setInviting] = useState<string | null>(null)

  // debounce search 300ms (avoids API call per keystroke)
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const { users } = await api<{ users: BoardMember[] }>(
          `/api/users/search?q=${encodeURIComponent(query.trim())}`
        )
        setResults(users)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, open])

  async function handleInvite(member: BoardMember) {
    if (!board) return
    setInviting(member.id)
    try {
      await api(`/api/boards/${board.id}/invite`, {
        method: "POST",
        body: JSON.stringify({ email: member.email }),
      })
      applyMemberJoined(member, `${member.name} joined`)
      toast.success(`${member.name} added to the board`)
      setResults((prev) => prev.filter((r) => r.id !== member.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed")
    } finally {
      setInviting(null)
    }
  }

  if (!board || !user) return null
  const isOwner = board.createdById === user.id

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Invite Members
          </DialogTitle>
          <DialogDescription>
            {isOwner
              ? "Search by email or name to add teammates to this board."
              : "Only the board owner can invite members."}
          </DialogDescription>
        </DialogHeader>

        {isOwner ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users by email or name…"
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1.5">
              {searching && (
                <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Searching…
                </div>
              )}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-4">
                  No users found. They need to sign up first.
                </p>
              )}
              {results.map((u) => {
                const alreadyMember = board.members.some((m) => m.id === u.id)
                return (
                  <div key={u.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar name={u.name} color={u.avatarColor} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={alreadyMember ? "secondary" : "default"}
                      disabled={alreadyMember || inviting === u.id}
                      onClick={() => handleInvite(u)}
                    >
                      {inviting === u.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : alreadyMember ? (
                        "Member"
                      ) : (
                        "Add"
                      )}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            <UserPlus className="h-6 w-6 mx-auto mb-2 opacity-40" />
            Ask the board owner to invite new members.
          </div>
        )}

        {/* current members */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Members ({board.members.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {board.members.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-1 pr-2.5">
                <UserAvatar name={m.name} color={m.avatarColor} size="xs" />
                <span className="text-xs font-medium">{m.name}</span>
                {m.id === board.createdById && <span className="text-[9px] text-muted-foreground">(owner)</span>}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
