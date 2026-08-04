# Universal Activity Timeline

A cross-platform activity tracking system that aggregates digital activity from **Windows** and **Android** into a single, searchable chronological timeline. Built with TypeScript end-to-end, containerized with Docker, and authenticated via Supabase Auth.

> **[Live Demo](https://universal-timeline-bb6v.vercel.app/)** · Viewing demo data when the backend is asleep — sign in to explore the full UI.

---

## Architecture

```
┌──────────────┐     ┌──────────────┐
│  Windows PC  │     │   Android    │
│  (.NET 9)    │     │  (Kotlin)    │
│              │     │              │
│ GetForeground│     │ UsageStats   │
│ Window()     │     │ Manager      │
│ + Idle Det.  │     │ + Notif.     │
│ + SyncQueue  │     │ + SyncQueue  │
└──────┬───────┘     └──────┬───────┘
       │   Batched POST /events    │
       │   (offline-tolerant)      │
       └───────────┬───────────────┘
                   ▼
         ┌─────────────────┐
         │  NestJS Backend  │
         │  (TypeScript)    │
         │                  │
         │ • JWT Auth Guard │
         │ • Merge Intervals│
         │ • Idempotency    │
         │ • Aggregations   │
         └────────┬─────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
  ┌───────────┐     ┌──────────────┐
  │ PostgreSQL │     │ Supabase Auth│
  │ (Neon/     │     │ (JWT tokens) │
  │ TimescaleDB│     └──────────────┘
  │ locally)   │
  └───────────┘
                  │
                  ▼
         ┌─────────────────┐
         │  Next.js Frontend│
         │  (React 19)      │
         │                  │
         │ • Timeline View  │
         │ • Summary Charts │
         │ • Search/Filter  │
         │ • Demo Fallback  │
         └─────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | NestJS, TypeORM, PostgreSQL | REST API, event processing, aggregations |
| **Frontend** | Next.js 16, React 19, Recharts | Timeline visualization, summary dashboards |
| **Windows Client** | .NET 9, WinForms, Win32 API | Foreground app tracking, idle detection |
| **Android Client** | Kotlin, Jetpack Compose, WorkManager | UsageStats tracking, notification capture |
| **Auth** | Supabase Auth | JWT-based authentication across all clients |
| **Database** | TimescaleDB (local), Neon (prod) | Time-series optimized storage |
| **Infra** | Docker, Render, Vercel, GitHub Actions | Containerization, deployment, CI/CD |

---

## Features

### Event Tracking
- **Windows**: Polls `GetForegroundWindow()` every 5 seconds to detect active application, window title, and process name. Detects idle state via `GetLastInputInfo()` after 2 minutes of inactivity.
- **Android**: Queries `UsageStatsManager` every 60 seconds via a foreground service. Captures notification metadata and screen on/off events via broadcast receivers.

### Offline-First Sync
- Events are queued locally in a `SyncQueue` and flushed in batches of up to 50 every 60 seconds.
- Failed syncs retry with **exponential backoff** (1s → 2s → 4s → ... → 60s max).
- Queue caps at 10,000 events and drops oldest on overflow.
- Content-based **idempotency hashing** prevents duplicate events from network retries.

### Interval Merging
- An O(n log n) merge algorithm consolidates adjacent same-activity events with gaps ≤ 60 seconds into unified segments, reducing noise and storage.

### Timeline UI
- Color-coded horizontal bars on a time axis for each day.
- Activity type filtering (coding, browsing, communication, design, productivity).
- Full-text search across activity names.
- Daily, weekly, and monthly summary views with pie charts and bar charts.
- Period-over-period comparison toggle.
- **Graceful demo fallback**: when the backend is unreachable, the UI renders realistic sample data with a subtle banner instead of an error page.

---

## Project Structure

```
UniversalTimeline/
├── backend/universal-timeline/   # NestJS API
│   └── src/
│       ├── common/               # Auth guard, exception filter, logger
│       ├── events/               # Event entity, controller, service
│       ├── processing/           # Merge intervals algorithm
│       ├── summary/              # Aggregation queries
│       ├── sync/                 # Sync queue (shared logic)
│       └── timeline/             # Timeline query endpoint
├── frontend/                     # Next.js 16 web app
│   └── src/
│       ├── app/                  # Pages (login, timeline)
│       ├── components/           # TimelineView, SummaryView
│       ├── context/              # AuthContext (Supabase)
│       └── lib/                  # API client, demo data, Supabase client
├── client/windows/               # .NET 9 Windows client
│   └── UniversalTimeline.Client/
│       ├── ActivityTracker.cs    # Win32 foreground window polling
│       ├── SyncQueue.cs          # Offline queue with retry
│       ├── SupabaseAuth.cs       # Auth integration
│       └── TrayApplicationContext.cs  # System tray app
├── clients/android/              # Kotlin Android client
│   └── app/src/main/java/.../
│       ├── tracking/             # UsageStats, notifications, screen
│       ├── sync/                 # SyncQueue, SupabaseAuth
│       └── ui/                   # Jetpack Compose screens
├── docker-compose.yml            # Local dev: backend + TimescaleDB
├── render.yaml                   # Render deployment blueprint
└── .github/workflows/ci.yml     # CI: backend tests + frontend build
```

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 20+
- [Docker](https://www.docker.com/) (for local PostgreSQL)
- [.NET 9 SDK](https://dotnet.microsoft.com/) (for Windows client)
- [Android Studio](https://developer.android.com/studio) (for Android client)

### 1. Clone and Install

```bash
git clone https://github.com/YourUsername/UniversalTimeline.git
cd UniversalTimeline
```

### 2. Set Up Environment Variables

Copy the example env files and fill in your credentials:

```bash
# Backend
cp backend/universal-timeline/.env.example backend/universal-timeline/.env

# Frontend
# Create frontend/.env.local with:
#   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
#   NEXT_PUBLIC_API_URL=http://localhost:3001

# Android
# Create clients/android/local.properties with:
#   supabase.url=your_supabase_url
#   supabase.anon_key=your_anon_key
```

### 3. Start the Database

```bash
docker compose up -d db
```

### 4. Start the Backend

```bash
cd backend/universal-timeline
npm install
npm run start:dev
```

### 5. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit **http://localhost:3000** for the frontend.

---

## Deployment

| Service | Platform | URL |
|---------|----------|-----|
| Frontend | Vercel | Auto-deploys on push to `main` |
| Backend | Render | Auto-deploys on push to `main` |
| Database | Neon (prod) / TimescaleDB (local) | Managed PostgreSQL |
| Auth | Supabase | Hosted auth service |
| CI/CD | GitHub Actions | Runs backend tests + frontend build checks |

---

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **TimescaleDB** (local) | Hypertable partitioning makes time-range queries on `activity_events` fast without manual partition management. Production uses standard PostgreSQL on Neon since the dataset is small enough. |
| **Event segments, not raw polls** | Storing one event per app-switch (with `start_time`/`end_time`) instead of one row per 5-second poll reduces storage by ~12x and makes timeline rendering trivial. |
| **Offline-first sync with idempotency** | Clients operate normally without network. Exponential backoff prevents server overload during recovery. SHA-256 content hashing makes retries safe. |
| **Merge intervals algorithm** | Consolidating rapid app-switch noise (e.g., alt-tabbing) into clean segments. Same core logic as LeetCode #56, applied to real data. |
| **Supabase Auth** | JWT-based auth that works identically across web, Windows, and Android without building a custom auth server. |
| **Demo data fallback** | Frontend gracefully degrades when the backend is asleep (Render free tier) so recruiters always see a functional demo. |

---

## License

This project is unlicensed — built as a personal portfolio project.