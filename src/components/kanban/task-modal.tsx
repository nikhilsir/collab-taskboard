"use client";

import { useEffect, useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Trash2, X, Send, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/kanban-socket";
import { useKanbanStore } from "@/lib/store";
import { UserAvatar } from "./user-avatar";
import { PRIORITIES, PRIORITY_STYLES, LABEL_COLORS, Priority, TaskDTO, STATUSES } from "@/lib/shared";
import { cn } from "@/lib/utils";

const AVAILABLE_LABELS = ["bug", "feature", "design", "urgent-fix", "docs", "research"]

/**
 * Task modal — create AND edit in one dialog.
 * Includes: title, description, priority, due date, assignee,
 * labels, status + comments (bonus feature).
 */
export function TaskModal({
  open,
  task, // null = create mode
  createStatus = "TODO",
  onClose,
}: {
  open: boolean
  task: TaskDTO | null
  createStatus?: string
  onClose: () => void
}) {
  const board = useKanbanStore((s) => s.board)
  const user = useKanbanStore((s) => s.user)
  const applyTask = useKanbanStore((s) => s.applyTask)
  const removeTask = useKanbanStore((s) => s.removeTask)
  const applyComment = useKanbanStore((s) => s.applyComment)

  const isEdit = !!task?.id

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<Priority>("MEDIUM")
  const [status, setStatus] = useState<string>("TODO")
  const [dueDate, setDueDate] = useState<string>("")
  const [assignedToId, setAssignedToId] = useState<string>("UNASSIGNED")
  const [labels, setLabels] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // comments state
  const [commentText, setCommentText] = useState("")
  const [postingComment, setPostingComment] = useState(false)
  const commentEndRef = useRef<HTMLDivElement>(null)

  // reset form when task changes
  useEffect(() => {
    if (open) {
      setTitle(task?.title || "")
      setDescription(task?.description || "")
      setPriority((task?.priority as Priority) || "MEDIUM")
      setStatus(task?.status || createStatus)
      setDueDate(task?.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "")
      setAssignedToId(task?.assignedToId || "UNASSIGNED")
      try {
        setLabels(task ? JSON.parse(task.labels || "[]") : [])
      } catch {
        setLabels([])
      }
      setCommentText("")
    }
  }, [open, task, createStatus])

  const comments = task?.comments || []

  useEffect(() => {
    if (open) commentEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [comments.length, open])

  if (!board || !user) return null

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Title is required")
      return
    }
    setSaving(true)
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      assignedToId: assignedToId === "UNASSIGNED" ? null : assignedToId,
      labels,
    }
    try {
      if (isEdit && task) {
        const { task: updated } = await api<{ task: TaskDTO }>(`/api/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        applyTask(updated)
        toast.success("Task updated")
      } else {
        const { task: created } = await api<{ task: TaskDTO }>("/api/tasks", {
          method: "POST",
          body: JSON.stringify({ ...payload, boardId: board.id }),
        })
        applyTask(created)
        toast.success("Task created")
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!task) return
    setDeleting(true)
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" })
      removeTask(task.id)
      toast.success("Task deleted")
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setDeleting(false)
    }
  }

  async function handleComment() {
    if (!task || !commentText.trim()) return
    setPostingComment(true)
    try {
      const { comment } = await api<{ comment: NonNullable<TaskDTO["comments"]>[number] }>(
        `/api/tasks/${task.id}/comments`,
        { method: "POST", body: JSON.stringify({ content: commentText.trim() }) }
      )
      applyComment(task.id, comment)
      setCommentText("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Comment failed")
    } finally {
      setPostingComment(false)
    }
  }

  function toggleLabel(label: string) {
    setLabels((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]))
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Task" : "Create Task"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update task details — changes sync live to all members" : "Add a new task to the board"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2 -mr-2">
          <div className="space-y-4 pb-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Title *</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="task-desc">Description</Label>
              <Textarea
                id="task-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add details, acceptance criteria, links…"
                rows={3}
              />
            </div>

            {/* Row: priority / status / due / assignee */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        <span className={cn("rounded px-1.5 py-0.5 text-xs", PRIORITY_STYLES[p].className)}>
                          {PRIORITY_STYLES[p].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Assignee</Label>
                <Select value={assignedToId} onValueChange={setAssignedToId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                    {board.members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-2">
                          <UserAvatar name={m.name} color={m.avatarColor} size="xs" />
                          {m.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Labels */}
            <div className="space-y-1.5">
              <Label>Labels</Label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_LABELS.map((label) => {
                  const idx = AVAILABLE_LABELS.indexOf(label)
                  const active = labels.includes(label)
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleLabel(label)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                        active
                          ? cn(LABEL_COLORS[idx % LABEL_COLORS.length], "border-transparent")
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {active && <X className="mr-1 inline h-3 w-3" />}
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Comments (edit mode only) */}
            {isEdit && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <MessageSquare className="h-4 w-4" />
                  Comments ({comments.length})
                </div>

                <div className="max-h-40 space-y-2 overflow-y-auto">
                  {comments.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">No comments yet — start the discussion.</p>
                  )}
                  {comments.map((c) => (
                    <div key={c.id} className="flex gap-2">
                      <UserAvatar name={c.author.name} color={c.author.avatarColor} size="sm" />
                      <div className="flex-1 rounded-lg bg-background border px-2.5 py-1.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-semibold">{c.author.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(c.createdAt).toLocaleString("en-GB", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-foreground/90 mt-0.5 break-words">{c.content}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={commentEndRef} />
                </div>

                <div className="flex gap-2">
                  <Input
                    value={commentText}
                    onChange={(e) => {
                      setCommentText(e.target.value)
                      // typing indicator — relayed to other board members
                      getSocket()?.emit("task:typing", { boardId: board.id, context: `comment:${task.id}` })
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        handleComment()
                      }
                    }}
                    placeholder="Write a comment…"
                    className="h-9"
                  />
                  <Button size="icon" className="h-9 w-9" onClick={handleComment} disabled={postingComment || !commentText.trim()}>
                    {postingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex items-center gap-2 sm:justify-between">
          {isEdit ? (
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Task"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
