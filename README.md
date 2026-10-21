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

## 🌍 Deploy to Render (live URL)

Production runs as **one service** — `server.mjs` serves the Next.js app **and** Socket.io (path `/socket.io`) on the same port, so there are no CORS issues. Production uses **PostgreSQL** (Neon) instead of local SQLite.

### 1. Create the database (Neon)
1. Sign up at [neon.tech](https://neon.tech) → create a project → copy the connection string (`postgresql://…`).

### 2. Create the Render service
1. [render.com](https://render.com) → **New → Web Service** → connect this GitHub repo.
2. Settings:

| Setting | Value |
|---|---|
| Runtime | Node |
| Build Command | `npm install && npm run db:gen:pg && npm run db:push:pg && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/` |

3. Environment variables:

| Key | Value |
|---|---|
| `DATABASE_URL` | your Neon `postgresql://…` string |
| `JWT_SECRET` | any long random string |
| `SOCKET_INTERNAL_SECRET` | `socket-internal-shared-secret-2026` |
| `NODE_ENV` | `production` |

The build command generates the Prisma client from `prisma/schema.postgres.prisma` and pushes the schema to Neon, so every deploy auto-syncs the database (including the `ChatMessage` table).

> ⚠️ **Chat attachments note:** uploaded files are written to the service's local disk. Render's free tier has an ephemeral disk — files survive until the next deploy/restart. For permanent storage add a Render Persistent Disk or swap `uploads/chat` for S3/Cloudinary.

### Local production check
```bash
npm run db:gen:pg   # generate client from the postgres schema
npm run build && npm start
```

---

## 👤 Author

Built for the APPSICA Machine Test — Question 3: Real-Time Collaborative Kanban Board.
