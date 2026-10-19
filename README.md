# CollabKanban 🎯

**Real-Time Collaborative Kanban Board** — a Trello-style project management app with live multi-user sync, built as a full-stack machine test project.

Live demo: _deployment in progress_

---

## ✨ Features

### Core (Test Requirements)
- 🔐 **JWT Authentication** — register / login with bcrypt-hashed passwords
- 📋 **Multiple Boards** — create boards, invite members by email search
- ✅ **Task CRUD** — title, description, priority (Low → Urgent), due dates, assignees
- 🖱️ **Drag & Drop** — smooth cross-column dragging with live drag preview
- ⚡ **Real-Time Sync** — Socket.io broadcasts every change to all board members instantly
- 🗂️ **4 Columns** — Todo → In Progress → Review → Done
- 🔄 **Reconnect Resync** — fresh state fetch on socket reconnection (no stale UI)

### Bonus
- 🧵 **Comments** on tasks
- 📜 **Activity Timeline** — who did what, when
- 🌙 **Dark Mode**
- 🏷️ **Labels** on tasks
- 🔎 **Filters** — priority / member / due date / debounced search
- ⌨️ **Typing Indicator** — "Priya is typing…" shown live
- 🟢 **Online Presence** — live avatars of active members
- 🔔 **Toast Notifications** for every action

### Engineering Edge Cases (the 10% that matters)
| Problem | Solution |
|---|---|
| Two users move the same task | Optimistic locking via `version` field → `409` → auto-resync |
| Repositioning floods DB writes | **Fractional indexing** — a move updates exactly 1 row |
| UI waits for server round-trip | **Optimistic updates** with rollback on failure |
| Duplicate socket events | Unique `eventId` per mutation + idempotency check |
| Memory leaks from socket listeners | `useEffect` cleanup with `socket.off()` |
| Unauthorized real-time access | JWT verified in the socket handshake + room-level membership check |

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS 4 + shadcn/ui + Lucide icons |
| Database | Prisma ORM + SQLite |
| Real-time | Socket.io (dedicated mini-service) |
| State | Zustand (client) + TanStack Query (server state) |
| Drag & Drop | @dnd-kit (core + sortable) |
| Auth | JWT (jsonwebtoken) + bcryptjs |

---

## 🚀 Getting Started

### 1. Install dependencies
```bash
npm install
# or: bun install
```

### 2. Configure environment
Create a `.env` file in the root:
```env
DATABASE_URL=file:./db/custom.db
JWT_SECRET=your-super-secret-key
SOCKET_INTERNAL_SECRET=any-random-string
```

### 3. Set up the database
```bash
npx prisma db push
```

### 4. Run the app
```bash
npm run dev
```

### 5. Run the real-time socket service (separate terminal)
```bash
cd mini-services/socket-service
npm install
npm run dev
```

Open `http://localhost:3000` — register two users in two browser tabs, open the same board, and watch changes sync live. ⚡

---

## 📐 Architecture

```
Browser (React UI, Zustand store, dnd-kit)
   │
   ├── REST APIs ────────► Next.js API Routes ────► Prisma ────► SQLite
   │                          (auth, boards, tasks)
   │
   └── WebSocket ────────► Socket.io Service ─────► broadcasts to
                              (rooms per board)      all board members
```

- **Server is the source of truth** — every mutation goes through the API first, then gets broadcast.
- Socket events carry an `eventId`; the client deduplicates and applies only server-confirmed state.
- Each board is a socket **room** — only verified members receive its events.

---

## 👤 Author

Built for the APPSICA Machine Test — Question 3: Real-Time Collaborative Kanban Board.
