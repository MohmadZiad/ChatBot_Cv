# Talentwork Platform

This repository is organised as a Turbo monorepo with a dedicated frontend and backend so you can deploy each piece independently.

## Project structure

| Path | Description |
| --- | --- |
| `apps/web` | Next.js frontend (Talentwork UI). |
| `apps/api` | Fastify + Prisma backend that powers CV parsing and scoring. |
| `packages` | Shared utilities (if any) consumed by the apps. |

## Getting started

Install dependencies once from the repository root:

```bash
npm install
```

### Run only the frontend

The frontend consumes the backend through `NEXT_PUBLIC_API_BASE_URL` so it can be deployed on services such as Vercel.

```bash
npm run dev:web
```

Environment variables (create `apps/web/.env.local`):

```
NEXT_PUBLIC_APP_NAME=Talentwork
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_STORAGE_PUBLIC_BASE=http://localhost:4000/static
```

### Run only the backend

```bash
npm run dev:api
```

Create an `apps/api/.env` file with the backend secrets (database URL, storage credentials, OpenAI keys, …) and ensure the supporting services are reachable before starting the server.

### Full-stack development

To run both apps in parallel during development use Turbo:

```bash
npm run dev
```

## Building for production

```bash
npm run build:api
npm run build:web
```

Deploy the API first, then provide its public URL to the frontend via `NEXT_PUBLIC_API_BASE_URL` before building or deploying the Next.js app.

### Deployment notes

- **Render API**: the API prestart script now checks for Prisma migrations. When none are present it automatically runs `prisma db push --skip-generate` so Supabase (or any Postgres) stays in sync even if the schema was never baselined. Set `PRISMA_DB_PUSH_SKIP_GENERATE=false` if you need Prisma Client generation to run during start.
- **Environment variables**:
  - Always provide `DATABASE_URL` on Render. If `DIRECT_URL` is omitted it will automatically fall back to `DATABASE_URL` for Prisma commands.
  - Expose the API URL to the frontend via `NEXT_PUBLIC_API_BASE_URL` (for example `https://your-service.onrender.com`). Without it the browser will try to reach `http://localhost:4000` and calls will fail in production.
  - Configure CORS by setting `CORS_ORIGINS` (or `WEB_ORIGIN`) to a comma-separated list when you need to lock it down. Localhost origins (e.g. `http://localhost:3000`) are allowed by default for easier testing; set `ALLOW_LOCAL_ORIGINS=false` to opt out.
