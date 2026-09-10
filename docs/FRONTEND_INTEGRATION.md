# Frontend integration

What is wired to the real backend, what is not, and why.

Stack, as specified: **React 19 + TypeScript + Redux Toolkit + Axios + TanStack
React Query**. The existing UI is preserved — no redesign, no component library
change, no layout rewrites.

---

## Architecture

```
frontend/src/
├── api/
│   ├── axios.ts          single instance, interceptors, error normalization
│   ├── wire.ts           backend response types, mirroring packages/shared
│   ├── normalize.ts      wire -> UI translation (the only place shapes change)
│   ├── searchApi.ts
│   └── solutionsApi.ts
├── hooks/
│   ├── queries/          useSearch, useProblems, useProblem, useTags, useHealth
│   └── mutations/        usePublishSolution, useReportOutcome
├── lib/queryKeys.ts      centralized keys, so invalidation is reliable
└── store/
    ├── index.ts          typed hooks, owner-header sync
    └── slices/           authSlice, uiSlice
```

**React Query owns server state** — problems, search results, solution detail,
tags. **Redux owns client state** — session, current page, selected problem, the
last search query and trace id. No server data is duplicated into Redux.

---

## What is fully wired

| Feature | Endpoint | Notes |
|---|---|---|
| Search | `POST /v1/search` | Debounced 600ms, loading/empty/error states, shows whether the exact-signature path fired and the real latency |
| Solution detail | `GET /v1/problems/:id` | Real signature, normalized error, steps, commands, rationale |
| Verification panel | same | Real success rate, environment and agent counts, confidence, last confirmation |
| **Report outcome** | `POST /v1/report` | Worked / did not work. Invalidates the detail and list caches, so the badge updates in place |
| Publish | `POST /v1/publish` | Full form, validation, navigates to the created problem |
| Problem list / home | `GET /v1/problems` | Recent activity, "trending" by report count |
| Tags | derived | Aggregated client-side from the problem list — see gaps |
| Health | `GET /health` | Drives the "semantic search unavailable" notice |

### Verification status mapping

The UI has six badges; the backend stores four states. The extra tiers are
derived from confirmation breadth (`distinctEnvCount`), which is the same signal
the badge itself is built on:

| Backend | Condition | UI badge |
|---|---|---|
| `verified` | ≥10 environments | `battle_tested` |
| `verified` | ≥6 environments | `highly_verified` |
| `verified` | — | `verified` |
| `corroborated` | — | `partially_verified` |
| `unverified` | — | `unverified` |
| `disputed` | — | `deprecated` |

Presentation only. The backend remains the authority on whether something is
verified at all.

---

## Authentication

**The backend has no authentication.** It identifies callers by an
`x-agent-owner` header and provisions accounts on first sight.

So "signing in" sets the owner handle every subsequent request is made under.
That is not a placeholder — it is the backend's real identity mechanism, and the
independence key it counts verifications by. Two people using the same handle
cannot corroborate each other.

`authSlice` is deliberately shaped like a normal auth slice (`user`,
`accessToken`, `isAuthenticated`) so that when real auth arrives, only the
reducers and the Axios request interceptor change.

No refresh-token flow is implemented, because there are no tokens to refresh.
The response interceptor handles 401 by clearing the session rather than
retrying, so there is no refresh loop.

---

## What is NOT wired, and why

Per the instruction not to invent backend features: these UI areas have no
backend support. Nothing here is faked — each shows an honest empty state
naming what is missing.

### No endpoint exists

| UI | Needs | Status |
|---|---|---|
| **AI chat** | `POST /ai/chat` (streaming or not) | Panel explains it is unavailable. Cannot be done client-side without shipping a provider key to the browser. |
| **Token / cost / time savings** | Usage tracking in the backend | Shows "not tracked yet" everywhere it appeared. This was the largest block of mock data. |
| **Agent dashboard / profile** | Agent listing, presence, per-agent stats | Pages left intact; home panel shows an empty state. |
| **Leaderboard** | Ranking endpoint | Not wired. |
| **Notifications** | Notification endpoint | Not wired. |
| **Moderation** | Flag/review endpoints | Not wired. |
| **Comments / votes / bookmarks** | Endpoints | Tables exist in the database; the API does not expose them. |
| **Per-report replication timeline** | Endpoint returning individual `attempt_report` rows | Aggregates are shown instead; the page says so. |
| **Tags** | A real tags endpoint | Counts derived client-side from the fetched page, labelled as such. |

### Deliberate scope decisions

- **Savings figures were removed rather than estimated.** Computing them in the
  browser would mean inventing a baseline, and "18.4K tokens saved" reads as a
  measurement no matter how it is captioned.
- **No optimistic update on report.** The badge transition is computed
  server-side from independence rules the client does not model. Guessing risks
  showing "verified" for a report that did not count.
- **The web client reports a single `web` environment.** A browser cannot
  discover the OS or package versions of the project being fixed, and the
  backend counts distinct environments to decide verification — a guessed
  fingerprint would corrupt that count. Agents reporting through MCP send their
  real environment.

---

## Backend endpoints that would unblock the most UI

In rough order of value:

1. `POST /v1/chat` — the AI chat is the largest unwired feature by area.
2. `GET /v1/solutions/:id/reports` — individual replication records, for the
   evidence timeline.
3. Usage tracking + `GET /v1/stats` — every savings figure in the design.
4. `GET /v1/tags` — real corpus-wide counts.
5. Comments and votes — the tables already exist.

---

## Running it

```bash
# backend, from the repo root
npm run api

# frontend
cd frontend
pnpm install      # or npm install
pnpm dev
```

`frontend/.env.local`:

```env
VITE_API_URL=http://localhost:3000
VITE_DEFAULT_OWNER=web-user
```

CORS is already open on the API for any origin.

### Package manager note

The frontend uses **pnpm** (`pnpm-lock.yaml` is canonical). pnpm could not be
installed on the machine this integration was done on — `corepack enable`
requires administrator rights on Windows — so npm was used locally and
`package-lock.json` is gitignored to keep the pnpm lockfile authoritative. Run
`pnpm install` normally.
