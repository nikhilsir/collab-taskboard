"use client";

import { memo } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, MessageSquare, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./user-avatar";
import { PRIORITY_STYLES, LABEL_COLORS, parseLabels, Priority } from "@/lib/shared";
import type { TaskDTO } from "@/lib/shared";

/**
 * Memoized task card — re-renders ONLY when its own task changes,
 * not when other tasks update (React.memo).
 *
 * It is BOTH draggable (drag source) and droppable (drop target used
 * to compute the insertion index when dropping onto a card).
 */
function TaskCardInner({
  task,
  onOpen,
  overlay = false,
}: {
  task: TaskDTO
  onOpen?: (task: TaskDTO) => void
  overlay?: boolean
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `drag-${task.id}`,
    data: { type: "task", task },
    disabled: overlay,
  })

  const { setNodeRef: setDropRef } = useDroppable({
    id: `drop-${task.id}`,
    data: { type: "task", task },
    disabled: overlay,
  })

  const labels = parseLabels(task.labels)
  const priority = PRIORITY_STYLES[task.priority as Priority] || PRIORITY_STYLES.MEDIUM

  const dueDate = task.dueDate ? new Date(task.dueDate) : null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isOverdue = dueDate && dueDate < today
  const isDueSoon = dueDate && !isOverdue && (dueDate.getTime() - today.getTime()) <= 2 * 86400000

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  return (
    <div
      ref={overlay ? undefined : (node) => {
        setDragRef(node)
        setDropRef(node)
      }}
      style={style}
      {...(overlay ? {} : listeners)}
      {...(overlay ? {} : attributes)}
      onClick={overlay ? undefined : () => onOpen?.(task)}
      className={cn(
        "group relative rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing transition-all",
        "hover:shadow-md hover:border-primary/40",
        isDragging && "opacity-40 scale-[0.98]",
        overlay && "shadow-2xl rotate-2 cursor-grabbing w-72"
      )}
    >
      {/* drag handle strip (visual affordance) */}
      {!overlay && (
        <GripVertical className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}

      <div className="flex items-start justify-between gap-2 pr-4">
        <p className={cn("text-sm font-medium leading-snug", overlay && "text-sm")}>{task.title}</p>
      </div>

      {task.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{task.description}</p>
      )}

      {labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {labels.map((label, i) => (
            <span
              key={`${label}-${i}`}
              className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", LABEL_COLORS[i % LABEL_COLORS.length])}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0 h-4", priority.className)}>
            {priority.label}
          </Badge>
          {dueDate && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-[10px] font-medium",
                isOverdue ? "text-red-500" : isDueSoon ? "text-amber-500" : "text-muted-foreground"
              )}
            >
              <CalendarDays className="h-3 w-3" />
              {dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          )}
          {(task.comments?.length || 0) > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              {task.comments?.length}
            </span>
          )}
        </div>
        {task.assignedTo && (
          <UserAvatar name={task.assignedTo.name} color={task.assignedTo.avatarColor} size="xs" />
        )}
      </div>
    </div>
  )
}

export const TaskCard = memo(TaskCardInner)
