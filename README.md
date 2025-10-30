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
