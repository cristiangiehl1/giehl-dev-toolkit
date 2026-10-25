# Vite/React SPA (frontend-only)

No `server/` tree here — there's no direct database access from a pure frontend, so `model`/`infra` as described in `SKILL.md` don't apply. The backend those calls hit lives in its own project, following `node-backend.md`.

```
src/
├── routes/                          # file-based routing (TanStack Router)
│   ├── __root.tsx
│   └── <route>.tsx                  # or a directory, when the route needs its own layout/params
│
├── components/
│   ├── ui/                          # design-system primitives (e.g. shadcn) — never business-specific
│   ├── login-form.tsx               # flat: layout-level pieces shared across every domain
│   └── <domain>/                    # reusable across the domain's several routes (e.g. jobs/, candidates/)
│
├── queries/
│   └── <domain>/
│       └── use-<action>.ts          # TanStack Query hooks — this is the "service" layer here
│
├── schemas/
│   └── <domain>/
│       └── <form>-form.ts           # Zod validation, one file per form
│
├── hooks/                            # generic UI-behavior hooks — no data fetching (that's queries/)
│
├── lib/
│   ├── ky/
│   │   └── client.ts                 # the one HTTP client, consumed by queries/
│   ├── utils.ts
│   └── <domain>/                      # pure domain logic (calculation, formatting) — colocated *.test.ts
│
└── main.tsx
```

## Rules specific to this stack

- **No components colocated inside `routes/`.** TanStack Router already reserves the `_` prefix for pathless layout routes (`routes/_authenticated.tsx`) — reusing it for "exclude from routing" like Next.js's `_components` would collide with that meaning. Instead of colocation, components live in `components/<domain>/`, grouped by the feature they belong to rather than by which single route first used them — a domain's create/edit/list routes usually reuse the same components (a shared `job-form.tsx` for both create and edit), which colocation under one route folder would only get in the way of.
- **`queries/<domain>/` is the "service" layer.** There's no `models/`/`infra/` split on the frontend — `queries/<domain>/use-<action>.ts` (TanStack Query) is where every call to the backend lives, one file per action. Don't inline a fetch/mutation call inside a component.
- **`schemas/<domain>/` mirrors `queries/`'s domain split** — one folder per domain, one file per form, named `<form>-form.ts` (e.g. `schemas/auth/login-form.ts`).
- **`components/ui/` stays business-agnostic.** Only generic primitives (button, dialog, input) go there. Anything that renders domain data belongs in `components/<domain>/`, never nested under `ui/`.
- **Tests are colocated**, not centralized — `<file>.test.ts` next to the file it tests, inside `queries/`, `lib/`, or `components/`. This is the one place this standard diverges from the backend's centralized `tests/` folder (see `SKILL.md`) — both real frontends this is based on already test this way.
