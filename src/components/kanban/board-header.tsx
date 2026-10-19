"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  UserPlus,
  Activity,
  Moon,
  Sun,
  Wifi,
  WifiOff,
  Loader2,
  X,
} from "lucide-react";
import { useKanbanStore } from "@/lib/store";
import { AvatarStack, UserAvatar } from "./user-avatar";
import { InviteDialog } from "./invite-dialog";
import { ActivityPanel } from "./activity-panel";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Board header — title, live presence, typing indicator,
 * connection status, filters, invite, activity, theme toggle.
 */
export function BoardHeader() {
  const board = useKanbanStore((s) => s.board)
  const user = useKanbanStore((s) => s.user)
  const onlineUsers = useKanbanStore((s) => s.onlineUsers)
  const typingUsers = useKanbanStore((s) => s.typingUsers)
  const connectionStatus = useKanbanStore((s) => s.connectionStatus)
  const filters = useKanbanStore((s) => s.filters)
  const setFilters = useKanbanStore((s) => s.setFilters)
  const { theme, setTheme } = useTheme()

  const [inviteOpen, setInviteOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)

  if (!board || !user) return null

  const otherTyping = Object.entries(typingUsers).filter(
    ([uid, t]) => uid !== user.id && Date.now() - t.at < 4000
  )

  const filtersActive =
    filters.search || filters.priority !== "ALL" || filters.assignee !== "ALL" || filters.due !== "ALL"

  return (
    <div className="space-y-3 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20">
      {/* Row 1: title + actions */}
      <div className="flex items-center justify-between gap-3 px-4 pt-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-bold truncate">{board.title}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            {/* connection status */}
            {connectionStatus === "online" ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Wifi className="h-3 w-3" /> Live
              </span>
            ) : connectionStatus === "connecting" ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Connecting…
              </span>
            ) : (
              <span className="flex items-center gap-1 text-red-500">
                <WifiOff className="h-3 w-3" /> Reconnecting…
              </span>
            )}
            <span>•</span>
            <span>{board.members.length} member{board.members.length > 1 ? "s" : ""}</span>
            <span>•</span>
            <span>{board.tasks.length} tasks</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* online presence avatars */}
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center -space-x-1.5 mr-1">
              {onlineUsers.slice(0, 5).map((u) => (
                <Tooltip key={u.userId}>
                  <TooltipTrigger asChild>
                    <div>
                      <UserAvatar
                        name={u.name}
                        color={u.avatarColor}
                        size="sm"
                        ring
                        className="ring-2 ring-background"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{u.name} {u.userId === user.id ? "(you)" : ""} • online</p>
                  </TooltipContent>
                </Tooltip>
              ))}
              {onlineUsers.length === 0 && (
                <span className="text-[11px] text-muted-foreground">nobody online</span>
              )}
            </div>
          </TooltipProvider>

          <AvatarStack users={board.members} max={4} size="sm" />

          <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Invite</span>
          </Button>

          <Button size="sm" variant="outline" onClick={() => setActivityOpen(true)}>
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Activity</span>
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* typing indicator */}
      <div className="px-4 h-4">
        {otherTyping.length > 0 && (
          <p className="text-[11px] text-muted-foreground italic animate-pulse">
            {otherTyping.map(([, t]) => t.name).join(", ")}{" "}
            {otherTyping.length === 1 ? "is" : "are"} typing…
          </p>
        )}
      </div>

      {/* Row 2: filters */}
      <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            placeholder="Search tasks…"
            className="pl-9 h-9"
          />
          {filters.search && (
            <button
              onClick={() => setFilters({ search: "" })}
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Select value={filters.priority} onValueChange={(v) => setFilters({ priority: v })}>
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Priorities</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="URGENT">Urgent</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.assignee} onValueChange={(v) => setFilters({ assignee: v })}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Members</SelectItem>
            <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
            {board.members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.due} onValueChange={(v) => setFilters({ due: v })}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Due date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any Due Date</SelectItem>
            <SelectItem value="OVERDUE">Overdue</SelectItem>
            <SelectItem value="TODAY">Due Today</SelectItem>
            <SelectItem value="WEEK">This Week</SelectItem>
            <SelectItem value="NO_DATE">No Date</SelectItem>
          </SelectContent>
        </Select>

        {filtersActive && (
          <Button
            size="sm"
            variant="ghost"
            className={cn("h-9 text-muted-foreground")}
            onClick={() => setFilters({ search: "", priority: "ALL", assignee: "ALL", due: "ALL" })}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <ActivityPanel open={activityOpen} onClose={() => setActivityOpen(false)} />
    </div>
  )
}
