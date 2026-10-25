---
name: folder-structure-standard
description: Use ALWAYS when scaffolding a new project or deciding where a file belongs ("estrutura de pastas", "organiza as pastas do projeto", "cria a estrutura do projeto", "folder structure", "project structure", "how should I organize this") in a Next.js full-stack app, a Vite/React SPA, a Node backend (Hono, Fastify, Express — NestJS keeps its own module convention), or a pnpm monorepo combining any of those. Fires also when the question is about layering, not scaffolding — "isso é model, service ou controller?", "onde fica esse arquivo", "cria o service de...", "is this a service or a model?" — or about API versioning, test folder layout, or env/config conventions. Scope is folder/file placement and layering; it does not cover lint/format (see `biome-lint-setup`) or CI/deploy.
---

# Folder structure standard (Giehl standard)

Defines where each file goes and why, across Next.js full-stack, Vite/React SPA, Node backends, and pnpm monorepos. This was not invented from a template — it was extracted from two production codebases (`email-frota`, `sistema-recrutamento-selecao`) and cross-checked against the vocabulary Clean Architecture / Ports & Adapters uses for the same layers, plus how Loco.rs (Rails-equivalent for Rust) draws the same lines.

**Scope:** folder layout, file placement, layering (`model`/`service`/`controller`/`infra`), naming, config/env, and test layout. It does **not** cover lint/format setup (see `biome-lint-setup`) or CI/deploy.

## Read the stack-specific reference first

| Stack | Reference |
|---|---|
| Next.js full-stack (App Router) | `references/nextjs.md` |
| Vite/React SPA (frontend-only, no server) | `references/vite-spa.md` |
| Node backend — Hono, Fastify, Express (NestJS keeps its own module convention) | `references/node-backend.md` |
| pnpm monorepo combining any of the above | `references/monorepo.md` |

Everything below applies to all four; the reference files only add the concrete tree and stack-specific naming.

## The four layers, and the test that tells them apart

| Layer | Knows about | Never contains | Changes when |
|---|---|---|---|
| **`infra/`** | One external dependency (DB driver, AI provider, email API, storage, queue) | Business rules, other domains' names | The tool/library/API changes |
| **`model`** | The domain's data shape and how to persist/query it | Business rules, orchestration, HTTP | The database schema changes |
| **`service`** | Business rules; orchestrates one or more `model`s and `infra` clients | Raw SQL/HTTP calls, `Request`/`Response` objects | The business rule changes |
| **controller** (`route.ts` in Next.js; `handler.ts` in Hono/Fastify/Express) | HTTP: parsing the request, building the response | Business rules | The transport changes (REST → GraphQL, add a CLI, etc.) |

The heuristic that resolves any edge case: **if it changes because the business changed, it's a `service`. If it changes because the database/tool/library changed, it's `infra` or `model`. If it only exists because HTTP exists, it's the controller.**

`infra/` stays **strictly** for clients of external systems — database, AI providers, email, storage, queues. Logic that is pure (no I/O) but reused by 2+ domains does not belong there; it is rare enough that this standard does not prescribe a folder for it yet — decide case by case rather than defaulting it into `infra/`.

`model` is a repository in Clean Architecture terms — strictly speaking, an infrastructure detail. It still gets its own top-level folder, never nested inside `infra/`: every convention-driven framework checked (Rails, Laravel, Django, NestJS, Loco.rs) treats the persistence layer as a first-class citizen, not a bucket item. Loco.rs in particular doesn't even have a generic "infra" bucket — it names each concern at the top level (`models/`, `mailers/`, `workers/`, `initializers/`) instead of grouping integrations together; this standard uses the `infra/{database,email,openai,...}` bucket instead because that's what both source codebases already do, but `models/` staying outside of it is the one point where both conventions agree.

## Naming

- kebab-case everywhere — files, folders, **including React components** (`user-profile.tsx`, not `UserProfile.tsx`).
- Inside a dependency's own subfolder (`infra/openai/`, `infra/database/oracle/`), file names are generic — `client.ts`, `service.ts`, `index.ts` — never prefixed with the folder's own name. The folder already says what it is.
- Tests are named `<file>.test.ts`.

## Config & env

Two files, never merged, never duplicated per folder:

- **`env.ts`** — a Zod schema that parses and validates every `process.env` var once, exported as a typed `env`.
- **`config.ts`** — `export const CONFIG = Object.freeze({...})`, built from `env`, namespaced per external dependency: `CONFIG.database`, `CONFIG.openai`, `CONFIG.email`. Every `infra/` client is instantiated with its slice of `CONFIG`, never with `env` directly.

Two ways an `infra/` client receives that config, depending on what kind of resource it wraps:

- **Stateless external API client** (AI provider, email, HTTP): constructor takes an optional override, falling back to the singleton — `constructor(configOverride?: XConfig) { this.config = configOverride ?? CONFIG.x }`. This exists for tests, where you inject a fake config without touching `process.env`.
- **Stateful pooled connection** (database): a module-level singleton getter cached on `global` so it survives dev-mode hot reload without exhausting the pool — `getDb()` that lazily calls `initConnectionPool()`. No override — you don't swap a live pool's config at runtime.

## API versioning

When the API has versions, `v1` wraps `model`/`service`/the route folder — never `infra`, `env.ts`, or `config.ts`, which are shared across every version because they don't know about API contracts:

```
app/api/v1/<name>          server/v1/services/<name>          server/v1/models/<name>
```

`v2`, when it exists, can reuse a `v1` model untouched (if the data access didn't change) or fork its own — that decision is per-domain, never a blanket rule.

## The mirror rule

`api/<name>` ↔ `services/<name>` ↔ `models/<name>` ↔ `tests/integration/<name>` always use the **identical name**, inside the same version. An endpoint with no matching service/model is a signal it shouldn't be modeled as a domain resource in the first place (health checks, etc. are the exception).

## Testing

This is the one rule that's stack-dependent — **backend code is centralized, frontend code is colocated.** Always Node's native test runner (`node:test` + `node:assert`, run via `node --test`) — never Jest, Vitest, or Mocha, on either side.

**Backend (`server/`, or the whole tree in a Node backend):** centralized in `tests/{unit,integration,e2e}` at the root of `src/`, never colocated.

- **`unit/`** — mirrors the `src/` path of the isolated, pure function under test (`tests/unit/utils/format-date.test.ts` for `src/utils/format-date.ts`). `service`/`model` do not get unit tests of their own — they're exercised through `integration/`.
- **`integration/<name>/`** — one folder per domain (same name as `services/<name>`), hits the real HTTP path end to end (controller → service → model). File named after the action/verb tested: `get.test.ts`, `post.test.ts`.
- **`e2e/`** — reserved; no fixed convention defined yet.

**Frontend (`components/`, `queries/`, `lib/` — see `nextjs.md`/`vite-spa.md`):** colocated `<file>.test.ts` next to the file it tests. Don't centralize these into `tests/` — the two real frontends this standard is based on both colocate.
