import type { Task, User, Comment, Activity, ChatMessage } from '@prisma/client'

/**
 * Task shape sent to the frontend (serialized dates as ISO strings)
 */
export type TaskDTO = Omit<Task, 'dueDate' | 'createdAt' | 'updatedAt'> & {
  dueDate: string | null
  createdAt: string
  updatedAt: string
  assignedTo?: Pick<User, 'id' | 'name' | 'avatarColor'> | null
  comments?: CommentDTO[]
}

export type CommentDTO = Omit<Comment, 'createdAt'> & {
  createdAt: string
  author: Pick<User, 'id' | 'name' | 'avatarColor'>
}

export type ActivityDTO = Omit<Activity, 'createdAt'> & {
  createdAt: string
  user: Pick<User, 'id' | 'name' | 'avatarColor'>
}

export type ChatMessageDTO = Omit<ChatMessage, 'createdAt'> & {
  createdAt: string
  author: Pick<User, 'id' | 'name' | 'avatarColor'>
}

export type BoardMember = Pick<User, 'id' | 'name' | 'email' | 'avatarColor'>

export type BoardDataDTO = {
  id: string
  title: string
  createdById: string
  members: BoardMember[]
  tasks: TaskDTO[]
  activities: ActivityDTO[]
}

/**
 * The four kanban columns — matches machine test spec
 */
export const STATUSES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const
export type Status = (typeof STATUSES)[number]

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export type Priority = (typeof PRIORITIES)[number]

export const PRIORITY_STYLES: Record<Priority, { label: string; className: string }> = {
  LOW: { label: 'Low', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  MEDIUM: { label: 'Medium', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  HIGH: { label: 'High', className: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  URGENT: { label: 'Urgent', className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
}

export const LABEL_COLORS = [
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  'bg-lime-100 text-lime-700 dark:bg-lime-950 dark:text-lime-300',
  'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300',
]

/**
 * Fractional indexing: given neighbour positions, return a position
 * between them. This is how only ONE row updates per move.
 */
export function positionBetween(prev?: number, next?: number): number {
  if (prev == null && next == null) return 1000
  if (prev == null) return next! / 2
  if (next == null) return prev + 1000
  return (prev + next) / 2
}

/**
 * Safely parse the labels JSON string
 */
export function parseLabels(labels: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(labels || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
