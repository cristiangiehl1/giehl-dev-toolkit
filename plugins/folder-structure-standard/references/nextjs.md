# Next.js full-stack (App Router)

Two variants, depending on whether this Next.js app owns its own database or talks to a separate backend API. Everything under `app/` and the frontend-side folders (`components/`, `queries/`, `schemas/`, `hooks/`, `lib/`) is identical either way — only `server/` changes shape. Pick the variant that matches the project; don't build both.

```
src/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx              # shared shell for every auth page — no auth lib prescribed yet
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── logout/page.tsx
│   │   └── forgot-password/page.tsx
│   ├── api/
│   │   └── v1/
│   │       └── vehicles/
│   │           ├── route.ts        # the controller: parse request → call service → return response
│   │           └── [id]/route.ts
│   └── <page>/
│       ├── _components/            # used only by this page — underscore opts the folder out of routing
│       └── page.tsx
│
├── components/
│   ├── ui/                          # design-system primitives — never business-specific
│   ├── site-header.tsx              # flat: layout-level pieces shared across every domain
│   └── <domain>/                    # reusable across the domain's several pages (e.g. vagas/, profile/)
│
├── queries/
│   └── <domain>/
│       └── use-<action>.ts          # TanStack Query hooks — the client-side "service" layer
│
├── schemas/
│   └── <domain>/
│       └── <form>-form.ts           # Zod validation, one file per form
│
├── hooks/                            # generic UI-behavior hooks — no data fetching (that's queries/)
│
├── lib/
│   ├── ky/
│   │   ├── client.ts                 # browser-side HTTP client
│   │   └── server-client.ts          # server-side HTTP client (Server Components/Actions) — mainly the BFF variant
│   ├── utils.ts
│   └── <domain>/                      # pure domain logic (calculation, formatting) — colocated *.test.ts
│
└── server/                            # see "Variant A" / "Variant B" below
```

## Variant A — standalone (this app owns the database)

```
server/
├── env.ts                       # zod: parses process.env once
├── config.ts                    # CONFIG.database / CONFIG.openai / CONFIG.email — frozen, namespaced
├── infra/                        # shared across every API version — never versioned
│   ├── database/
│   │   └── oracle/
│   │       ├── client.ts        # getDb(): global-cached singleton pool getter, `server-only`
│   │       └── service.ts       # the class: pool, query(), etc.
│   ├── openai/
│   │   ├── client.ts            # constructor(configOverride?) { this.config = configOverride ?? CONFIG.openai }
│   │   └── service.ts
│   └── email/
│       └── client.ts
└── v1/
    ├── models/
    │   └── vehicles/
    │       ├── entities/
    │       ├── sql/             # only when there's no ORM (e.g. Oracle) — one .sql file per method
    │       └── vehicles.model.ts
    └── services/
        └── vehicles/
            └── vehicles.service.ts
```

Use this when the app is the only thing talking to its database — no separate backend exists.

## Variant B — BFF (a separate backend API already exists)

```
server/
├── http/
│   ├── api-error-response.ts     # parses the backend API's error shape into this app's error type
│   └── require-authorization.ts   # guard: checks session before calling the backend
├── session/
│   ├── candidate-session.ts       # reads/decodes the session
│   └── cookie.ts
├── prefetch.ts                    # server-side query prefetch, to hydrate TanStack Query on the client
└── services/
    └── vagas-service.ts           # calls the backend API via lib/ky/server-client.ts — no SQL here
```

Use this when the Next.js app is a frontend inside a monorepo that already has its own API (see `node-backend.md`). There's no `models/`/`infra/database` — the database belongs to that separate API. `server/services/` here only orchestrates calls to it (auth, error mapping, response shaping), never raw persistence.

## Rules that apply to both variants

- **`route.ts` is the controller.** Next.js gives you no separate `handler.ts` — the exported `GET`/`POST`/etc. functions in `route.ts` already are the HTTP adapter. Keep them thin: parse → call the matching `service` → return.
- **`(auth)` is a route group**, not a URL segment — `/login`, `/register`, etc. stay at the root, not `/auth/login`. It exists to share one `layout.tsx` (e.g. a centered card, no navbar) across the auth pages without leaking that layout to the rest of the app.
- **Components: shared vs. page-local vs. domain.** A component used by exactly one page is colocated under that page's `_components/` (underscore opts the folder out of routing). A component reused across a domain's several pages (e.g. `vagas/index`, `vagas/[id]`, `vagas/nova`) goes in `components/<domain>/`, not inside any one page. A component with no domain at all (site header, generic layout chrome) sits flat in `components/`.
- **`queries/<domain>/` is the client-side "service".** Data fetching/mutation hooks live here, one file per action (`use-vagas.ts`, `use-create-job.ts`), never inline in a component.
- **`schemas/<domain>/` mirrors `queries/`'s domain split** — one folder per domain, one file per form, named `<form>-form.ts`.
- **`app/api/` is one dedicated tree, not scattered per page.** API routes never nest inside a page's folder — they all live under `app/api/v1/<name>`, mirroring `server/v1/services/<name>` and `server/v1/models/<name>` in Variant A (see the mirror rule in `SKILL.md`).
- **Tests split by which side they're on.** `server/` (either variant) uses centralized `tests/{unit,integration,e2e}` at the root of `src/`, per `SKILL.md`. Everything under `components/`, `queries/`, `lib/` uses **colocated** `*.test.ts` instead — that's what both real frontends this standard is based on already do.
- **`server/infra/`, `server/env.ts`, `server/config.ts` (Variant A) are never versioned.** Only `models/` and `services/` move under `v1/`, `v2/`, etc., because only the API contract they serve is versioned — the DB client, AI client, and email client don't change per API version.
