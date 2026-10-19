"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, ClipboardList, ArrowRightLeft, Pencil, Trash2, UserPlus, MessageSquare, LayoutGrid } from "lucide-react";
import { useKanbanStore } from "@/lib/store";
import { UserAvatar } from "./user-avatar";
import type { ActivityDTO } from "@/lib/shared";

const ICONS: Record<string, React.ReactNode> = {
  BOARD_CREATED: <LayoutGrid className="h-3.5 w-3.5" />,
  TASK_CREATED: <ClipboardList className="h-3.5 w-3.5" />,
  TASK_MOVED: <ArrowRightLeft className="h-3.5 w-3.5" />,
  TASK_UPDATED: <Pencil className="h-3.5 w-3.5" />,
  TASK_DELETED: <Trash2 className="h-3.5 w-3.5" />,
  MEMBER_JOINED: <UserPlus className="h-3.5 w-3.5" />,
  COMMENT_ADDED: <MessageSquare className="h-3.5 w-3.5" />,
}

const ICON_COLORS: Record<string, string> = {
  BOARD_CREATED: "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300",
  TASK_CREATED: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300",
  TASK_MOVED: "bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-300",
  TASK_UPDATED: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300",
  TASK_DELETED: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300",
  MEMBER_JOINED: "bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-300",
  COMMENT_ADDED: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-950 dark:text-fuchsia-300",
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

/**
 * Activity timeline — audit log of everything that happened
 * on the board (bonus feature from the machine test).
 */
export function ActivityPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const board = useKanbanStore((s) => s.board)

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-sm p-0 flex flex-col">
        <SheetHeader className="px-4 py-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" /> Activity Timeline
          </SheetTitle>
          <SheetDescription>Last 30 events on this board</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-4 py-3">
            {!board || board.activities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No activity yet. Create a task to get started!
              </p>
            ) : (
              <div className="space-y-0">
                {board.activities.map((a: ActivityDTO, i) => (
                  <div key={a.id} className="flex gap-3 relative">
                    {/* timeline line */}
                    {i < board.activities.length - 1 && (
                      <div className="absolute left-[27px] top-11 bottom-0 w-px bg-border" />
                    )}
                    <UserAvatar name={a.user.name} color={a.user.avatarColor} size="sm" />
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${ICON_COLORS[a.type] || "bg-muted text-muted-foreground"}`}>
                          {ICONS[a.type] || <Activity className="h-3 w-3" />}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{timeAgo(a.createdAt)}</span>
                      </div>
                      <p className="text-sm mt-1 leading-snug">{a.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
