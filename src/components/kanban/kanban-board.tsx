"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  pointerWithin,
  DragOverEvent,
} from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { Column } from "./column";
import { TaskCard } from "./task-card";
import { useKanbanStore, filterTasks } from "@/lib/store";
import { api, ApiError } from "@/lib/api";
import { STATUSES, TaskDTO, positionBetween, Status } from "@/lib/shared";
import { toast } from "sonner";

/**
 * Kanban board — DndContext + 4 columns.
 *
 * Drag & drop strategy (interview-ready):
 *  1. Cards are draggable + droppable; columns are droppable.
 *  2. On drop we compute the insertion index from what's under the
 *     pointer (a card → relative to that card; a column → at the end).
 *  3. Optimistic local move first (UI feels instant), then the API
 *    call. Server computes the REAL fractional position and broadcasts.
 *  4. If the server says the task was concurrently modified (409 stale),
 *    we resync the whole board — no silent overwrites.
 */
export function KanbanBoard({
  onOpenTask,
  onCreateTask,
}: {
  onOpenTask: (task: TaskDTO) => void
  onCreateTask: (status: string) => void
}) {
  const board = useKanbanStore((s) => s.board)
  const filters = useKanbanStore((s) => s.filters)
  const user = useKanbanStore((s) => s.user)
  const moveTaskOptimistic = useKanbanStore((s) => s.moveTaskOptimistic)
  const applyTask = useKanbanStore((s) => s.applyTask)
  const refreshBoard = useKanbanStore((s) => s.refreshBoard)

  const [activeTask, setActiveTask] = useState<TaskDTO | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  )

  // Group tasks by column, sorted by fractional position (computed
  // at render — no derived state stored)
  const columns = useMemo(() => {
    const result: Record<Status, TaskDTO[]> = { TODO: [], IN_PROGRESS: [], REVIEW: [], DONE: [] }
    if (!board) return result
    const visible = filterTasks(board.tasks, filters, user?.id || "")
    for (const t of visible) {
      if (result[t.status as Status]) result[t.status as Status].push(t)
    }
    for (const s of STATUSES) result[s].sort((a, b) => a.position - b.position)
    return result
  }, [board, filters, user?.id])

  function handleDragStart(e: DragStartEvent) {
    const task = (e.active.data.current as { task: TaskDTO } | undefined)?.task
    setActiveTask(task || null)
  }

  function handleDragOver(_e: DragOverEvent) {
    // Intentionally lightweight: no live re-ordering during hover.
    // Moves are finalized on drop — simpler, race-free, and the
    // real position always comes from the server.
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveTask(null)
    const { active, over } = e
    if (!over || !board || !user) return

    const task = (active.data.current as { task: TaskDTO } | undefined)?.task
    if (!task) return

    const overData = over.data.current as { type: string; status?: string; task?: TaskDTO } | undefined

    // ---- Resolve target column ----
    let targetStatus: string | null = null
    if (overData?.type === "column") targetStatus = overData.status || null
    if (overData?.type === "task") targetStatus = overData.task!.status
    if (!targetStatus) return

    const columnTasks = columns[targetStatus as Status].filter((t) => t.id !== task.id)

    // ---- Resolve insertion index ----
    let insertAt = columnTasks.length // default: end of column
    if (overData?.type === "task" && overData.task) {
      const overIdx = columnTasks.findIndex((t) => t.id === overData.task!.id)
      if (overIdx !== -1) {
        // pointer in top half of the card → insert before it, else after
        const draggedCenter = active.rect.current.translated
          ? active.rect.current.translated.top + active.rect.current.translated.height / 2
          : over.rect.top
        const overCenter = over.rect.top + over.rect.height / 2
        insertAt = draggedCenter < overCenter ? overIdx : overIdx + 1
      }
    }

    const above = insertAt > 0 ? columnTasks[insertAt - 1] : null
    const below = insertAt < columnTasks.length ? columnTasks[insertAt] : null

    // ---- Skip pure no-op (already between the same neighbours) ----
    const sameSpot =
      task.status === targetStatus &&
      (above == null || above.position < task.position) &&
      (below == null || below.position > task.position)
    if (sameSpot) return

    // Estimated position for the optimistic update (server recomputes)
    const optimisticPos = positionBetween(above?.position, below?.position)

    // ---- 1) Optimistic update (UI feels instant) ----
    moveTaskOptimistic(task.id, targetStatus, optimisticPos)

    // ---- 2) Server move (server = source of truth) ----
    try {
      const { task: serverTask } = await api<{ task: TaskDTO }>(`/api/tasks/${task.id}/move`, {
        method: "PATCH",
        body: JSON.stringify({
          status: targetStatus,
          afterTaskId: above?.id || null,
          beforeTaskId: below?.id || null,
          version: task.version,
        }),
      })
      // Replace optimistic values with server truth
      applyTask({ ...serverTask, comments: task.comments })
    } catch (err) {
      if (err instanceof ApiError && err.stale) {
        toast.warning("Task was just moved by someone else — board resynced")
        await refreshBoard()
      } else {
        // rollback optimistic move
        applyTask(task)
        toast.error(err instanceof Error ? err.message : "Move failed")
      }
    }
  }

  if (!board) return null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      modifiers={[restrictToWindowEdges]}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-2 px-1">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={columns[status]}
            onAddTask={onCreateTask}
            onOpenTask={onOpenTask}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
        {activeTask ? <TaskCard task={activeTask} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}
