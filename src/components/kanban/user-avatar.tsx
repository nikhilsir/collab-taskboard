"use client";

import { cn } from "@/lib/utils";

/**
 * Deterministic avatar bubble — initials + user color.
 * size: sm (24px) | md (32px) | lg (40px)
 */
export function UserAvatar({
  name,
  color,
  size = "md",
  className,
  ring,
}: {
  name: string
  color: string
  size?: "xs" | "sm" | "md" | "lg"
  className?: string
  ring?: boolean
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  const sizes = {
    xs: "h-5 w-5 text-[9px]",
    sm: "h-6 w-6 text-[10px]",
    md: "h-8 w-8 text-xs",
    lg: "h-10 w-10 text-sm",
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-semibold text-white shrink-0 select-none",
        sizes[size],
        ring && "ring-2 ring-emerald-400 ring-offset-2 ring-offset-background",
        className
      )}
      style={{ backgroundColor: color }}
      title={name}
    >
      {initials || "?"}
    </div>
  )
}

/** Overlapping stack of member avatars +N overflow */
export function AvatarStack({
  users,
  max = 4,
  size = "sm",
}: {
  users: { id: string; name: string; avatarColor: string }[]
  max?: number
  size?: "xs" | "sm" | "md"
}) {
  const shown = users.slice(0, max)
  const overflow = users.length - shown.length

  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((u) => (
        <UserAvatar key={u.id} name={u.name} color={u.avatarColor} size={size} className="ring-2 ring-background" />
      ))}
      {overflow > 0 && (
        <div className="flex items-center justify-center h-6 w-6 rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background">
          +{overflow}
        </div>
      )}
    </div>
  )
}
