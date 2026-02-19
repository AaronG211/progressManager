# Progress Manager

Stage 0 foundation plus Stage 1 MVP board scaffolding for a monday.com-inspired work management product.

## Stack baseline

- Next.js 16 + TypeScript
- Tailwind CSS 4
- Prisma + Postgres
- Supabase Auth (magic link)
- Radix UI primitives
- Vitest + Testing Library

## Local setup

1. Install dependencies:

```bash
pnpm install
```

2. Configure environment variables:

```bash
cp .env.example .env
```

3. Generate Prisma client:

```bash
pnpm db:generate
```

4. Run development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Health and board endpoints

- `GET /api/health` returns service metadata and timestamp.
- `GET /api/ready` validates database readiness.
- `GET /api/boards/bootstrap` returns the active board snapshot and bootstraps defaults on first run.
- `GET /api/boards/bootstrap?itemOffset=<n>&itemLimit=<n>` returns paged snapshot envelope:
  `{ snapshot, pageInfo }`.
- `POST /api/boards/:boardId/groups` creates a group.
- `PATCH /api/boards/:boardId/groups/:groupId` updates group collapse/name.
- `POST /api/boards/:boardId/items` creates an item.
- `PATCH /api/boards/:boardId/items/:itemId` updates item fields.
- `PATCH /api/boards/:boardId/items/:itemId/cells/:columnId` updates a cell value.
- `PATCH /api/boards/:boardId/columns/reorder` persists drag-reordered column order.
- `GET /api/boards/:boardId/export/csv` downloads board data as CSV.
- `GET|PATCH /api/boards/:boardId/share` reads/updates board visibility and share-link settings.
- `GET /api/boards/share/:token` returns a read-only board snapshot for public share links.
- `GET /api/boards/share/:token?itemOffset=<n>&itemLimit=<n>` returns paged snapshot envelope:
  `{ snapshot, pageInfo }`.
- `GET /api/workspaces/:workspaceId/members` returns members and pending invites.
- `GET /api/workspaces/:workspaceId/invites` lists pending invites (owner/admin).
- `POST /api/workspaces/:workspaceId/invites` creates an invite link (owner/admin).
- `PATCH /api/workspaces/:workspaceId/members/:memberUserId` updates member role (owner/admin).
- `GET|POST /api/workspaces/invites/:token/accept` accepts invite for current user.
- `GET /api/notifications` returns current user notifications.
- `PATCH /api/notifications/:notificationId` marks a notification as read/unread.
- `GET /api/boards/:boardId/views` returns saved board views.
- `PATCH /api/boards/:boardId/views/:viewId` updates view name/config.

Stage 1 keyboard interactions:

- Arrow keys move focus across the board grid.
- Press `Enter` on text cells (item name / text column) to enter edit mode.
- Press `Esc` while editing a text cell to cancel and restore previous value.
- Groups with more than 200 items use windowed row rendering (virtualization).

Stage 2 collaboration foundation:

- Workspace invite links include role (`ADMIN`/`MEMBER`/`VIEWER`) with 7-day expiry.
- Board write APIs now enforce role-based permissions (`VIEWER` is read-only).
- Board permissions support `private` vs `workspace-visible` plus optional read-only share links.
- Workspace invite/member role changes write audit log records (`WorkspaceAuditLog`).
- Audit log now captures item updates, item cell updates, and column reorder events.
- Notifications v1 now include `@mention` and assignment-change events.
- Board table rows show `last edited by` presence-lite metadata.
- Public share links render `/share/:token` in view-only mode.

Stage 3 views foundation:

- Board snapshots now include persisted views (`Table`, `Kanban`, `Calendar`, `Timeline`).
- View config supports saved filters/sort (`status`, `person`, `date range`, `sort`).
- Board UI supports view switching with shared underlying board data across views.
- Expanded column types now supported end-to-end: `NUMBER`, `TAGS`, `CHECKBOX`, `URL`.
- Saved view filters now also support `number range`, `tag contains`, `checkbox`, and `URL contains`.
- Timeline view now supports date-range rendering with saved start/end date-column selection per view.
- Non-table views (`Kanban`, `Calendar`, `Timeline`) now use incremental rendering with a `Load more items` control for large result sets.
- Board shell now requests paged board snapshots from `/api/boards/bootstrap` and `/api/boards/share/:token` using `itemOffset` + `itemLimit`, then merges subsequent pages client-side.
- Pagination merge logic is now extracted to shared Stage 3 helpers with dedicated tests, including large-board pagination coverage (>5k items).
- Paginated bootstrap/share responses expose Stage 3 sampling headers (`x-stage3-page-*`, `x-stage3-payload-bytes`, `x-stage3-duration-ms`, `server-timing`) and emit telemetry events.

Stage 3 performance baseline:

- Run benchmark:
  - `pnpm bench:stage3`
- Latest local sample (February 19, 2026):
  - `paginate-first-page`: `avg=0.03ms` (`min=0.00ms`, `max=0.13ms`)
  - `paginate-deep-page`: `avg=0.01ms` (`min=0.00ms`, `max=0.01ms`)
  - `apply-view-filters` (10k items): `avg=3.29ms` (`min=0.96ms`, `max=8.84ms`)

Stage 3 acceptance checklist:

- `Table`, `Kanban`, `Calendar`, `Timeline` views all render from one shared board schema/value model.
- Saved view config is persisted via `PATCH /api/boards/:boardId/views/:viewId` and reapplied on reload.
- Editing in non-table views (status/date, including timeline date-range inputs) updates shared item data.
- Large-board handling includes pagination metadata + client merge flow for `/api/boards/bootstrap` and `/api/boards/share/:token`.
- Quality gate pass:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`

## Auth flow (Stage 1)

- `/login` renders the magic-link sign-in form.
- `/auth/callback` exchanges Supabase auth code for a session and redirects back to `/`.
- `/` and all board APIs require an authenticated Supabase session.
- Local setup requirement in Supabase dashboard:
  - Authentication -> URL configuration -> add redirect URLs:
    - `http://localhost:3000/auth/callback`
    - your Vercel domain equivalent, e.g. `https://your-app.vercel.app/auth/callback`

Synthetic handled-error test for observability scaffold:

- `GET /api/health?mode=error`

## Database

- `prisma/schema.prisma` now includes Stage 1 board models:
  - `WorkspaceMember`
  - `Board`, `BoardGroup`, `BoardColumn`, `BoardItem`, `BoardCellValue`
- Managed Postgres connection settings:
  - `DATABASE_URL` for app runtime
  - `DIRECT_URL` for Prisma migrations

Helpful commands:

```bash
pnpm db:generate
pnpm db:migrate:dev
```

`pnpm build` runs `prisma generate` automatically through the `prebuild` hook.

## CI/CD

### CI workflow

`/.github/workflows/ci.yml` runs on push/PR and enforces:

- lint
- typecheck
- test
- build

### Staging deploy workflow

`/.github/workflows/staging-deploy.yml` is manual (`workflow_dispatch`) and performs:

1. install + build
2. Vercel pull/build/deploy
3. post-deploy health check against `/api/health`

Required GitHub secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

## Vercel environment requirements

Set these for staging/production as needed:

- `DATABASE_URL`
- `DIRECT_URL`
- `APP_VERSION`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SENTRY_DSN` (optional)
- `SENTRY_ENVIRONMENT` (optional)
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_POSTHOG_KEY` (optional)
- `NEXT_PUBLIC_POSTHOG_HOST` (optional)

## Stage 0 release notes

- Restored runnable Next.js baseline and normalized setup docs.
- Added Stage 0 architecture folders (`components`, `lib`, `styles`, `api`).
- Added typed env parsing for server/client with Zod.
- Added Prisma/Postgres baseline and readiness check flow.
- Added health/readiness APIs with handled error path support.
- Added UI primitives (button/input/dropdown/modal/tooltip/toast) and command palette shell.
- Added observability wrappers for Sentry/PostHog with no-op fallback.
- Added unit and API/component smoke tests.
- Added CI workflow and one-click staging deploy workflow with health verification.
