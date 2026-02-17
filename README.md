# Progress Manager

Stage 0 foundation plus Stage 1 MVP board scaffolding for a monday.com-inspired work management product.

## Stack baseline

- Next.js 16 + TypeScript
- Tailwind CSS 4
- Prisma + Postgres
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
- `POST /api/boards/:boardId/groups` creates a group.
- `PATCH /api/boards/:boardId/groups/:groupId` updates group collapse/name.
- `POST /api/boards/:boardId/items` creates an item.
- `PATCH /api/boards/:boardId/items/:itemId` updates item fields.
- `PATCH /api/boards/:boardId/items/:itemId/cells/:columnId` updates a cell value.

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
- `STAGE1_DEV_USER_EMAIL` (temporary Stage 1 dev auth scaffold)
- `STAGE1_DEV_USER_NAME` (optional)
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
