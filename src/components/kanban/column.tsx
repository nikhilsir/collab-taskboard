"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { TaskCard } from "./task-card";
import { cn } from "@/lib/utils";
import type { TaskDTO } from "@/lib/shared";

const COLUMN_META: Record<string, { title: string; dot: string; badge: string }> = {
  TODO: { title: "Todo", dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  IN_PROGRESS: { title: "In Progress", dot: "bg-sky-500", badge: "bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-300" },
  REVIEW: { title: "Review", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300" },
  DONE: { title: "Done", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300" },
}

/**
 * Kanban column — a droppable container. Cards ordered by
 * fractional `position` ascending. Whole column (including gaps
 * between cards) is a valid drop zone.
 */
export function Column({
  status,
  tasks,
  onAddTask,
  onOpenTask,
}: {
  status: string
  tasks: TaskDTO[]
  onAddTask: (status: string) => void
  onOpenTask: (task: TaskDTO) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { type: "column", status },
  })

  const meta = COLUMN_META[status] || { title: status, dot: "bg-slate-400", badge: "" }

  return (
    <div className="flex w-[280px] sm:w-[300px] shrink-0 flex-col rounded-xl border bg-muted/40">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
          <h3 className="text-sm font-semibold">{meta.title}</h3>
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", meta.badge)}>
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(status)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          aria-label={`Add task to ${meta.title}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 rounded-b-xl transition-colors max-h-[calc(100vh-320px)] sm:max-h-[calc(100vh-290px)]",
          isOver && "bg-primary/5 ring-1 ring-inset ring-primary/30"
        )}
      >
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onOpen={onOpenTask} />
        ))}

        {tasks.length === 0 && (
          <button
            onClick={() => onAddTask(status)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-lg border border-dashed py-8 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
              isOver && "border-primary/50 text-primary"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            {isOver ? "Drop here" : "Add a task"}
          </button>
        )}
      </div>
    </div>
  )
}
