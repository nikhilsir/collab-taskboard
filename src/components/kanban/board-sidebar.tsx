"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KanbanSquare, Plus, LogOut, Loader2, Users, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useKanbanStore, BoardSummary } from "@/lib/store";
import { UserAvatar } from "./user-avatar";

/**
 * Left sidebar — brand, board list, create board, user + logout.
 * Responsive: drawer on mobile (handled by parent), fixed on desktop.
 */
export function BoardSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const boards = useKanbanStore((s) => s.boards)
  const boardsLoading = useKanbanStore((s) => s.boardsLoading)
  const activeBoardId = useKanbanStore((s) => s.activeBoardId)
  const setActiveBoard = useKanbanStore((s) => s.setActiveBoard)
  const user = useKanbanStore((s) => s.user)
  const logout = useKanbanStore((s) => s.logout)
  const loadBoards = useKanbanStore((s) => s.loadBoards)

  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [creating, setCreating] = useState(false)

  if (!user) return null

  async function handleCreate() {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const { board } = await api<{ board: BoardSummary }>("/api/boards", {
        method: "POST",
        body: JSON.stringify({ title: newTitle.trim() }),
      })
      await loadBoards()
      setActiveBoard(board.id)
      toast.success(`Board "${board.title}" created`)
      setCreateOpen(false)
      setNewTitle("")
      onNavigate?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-muted/30">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-4 border-b">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <KanbanSquare className="h-5 w-5" />
        </div>
        <span className="font-bold text-base">CollabKanban</span>
      </div>

      {/* Boards list */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            My Boards
          </span>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
            aria-label="Create board"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {boardsLoading && boards.length === 0 ? (
          <div className="space-y-1.5 px-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-11 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : boards.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <LayoutGrid className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground mb-3">No boards yet. Create your first one!</p>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New Board
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {boards.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setActiveBoard(b.id)
                  onNavigate?.()
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                  activeBoardId === b.id
                    ? "bg-background shadow-sm border font-semibold"
                    : "hover:bg-background/60 text-foreground/90"
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <LayoutGrid className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{b.title}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {b.members.length} • {b._count.tasks} tasks
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* User + logout */}
      <div className="border-t px-3 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <UserAvatar name={user.name} color={user.avatarColor} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-500"
          onClick={() => {
            logout()
            toast.success("Logged out")
          }}
          aria-label="Logout"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      {/* Create board dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Board</DialogTitle>
            <DialogDescription>Boards hold your kanban columns and tasks.</DialogDescription>
          </DialogHeader>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="e.g. Website Redesign"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newTitle.trim()}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
