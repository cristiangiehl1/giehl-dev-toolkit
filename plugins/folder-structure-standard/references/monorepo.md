# pnpm monorepo

Combines any number of apps (each following `nextjs.md`, `vite-spa.md`, or `node-backend.md` internally) with packages shared between them.

```
repo-root/
├── apps/
│   ├── api/              # Node backend — node-backend.md
│   ├── <next-app>/       # Next.js full-stack — nextjs.md
│   └── <spa-app>/        # Vite SPA — vite-spa.md
│
├── packages/              # only created when 2+ apps actually duplicate something — never speculative
│   ├── api-client/        # typed HTTP client consumed by every frontend app
│   ├── api-types/         # types generated from the API's OpenAPI schema
│   ├── ui/                 # design-system components shared across frontend apps
│   ├── validators/          # validation rules (e.g. Zod) shared between frontend AND backend
│   ├── eslint-config/
│   └── tsconfig/
│
├── docker/
├── package.json            # workspace root: orchestrates via `pnpm --filter <name>` + `concurrently`
└── pnpm-workspace.yaml      # packages: [apps/*, packages/*]
```

## Rules specific to this layout

- **`packages/` is earned, not assumed.** Don't scaffold `packages/ui` or `packages/validators` for a monorepo that only has one frontend — create a package only once a second app would otherwise duplicate that code. The four packages above came from two real frontends sharing one API contract (types + client), one validation ruleset, and one design system.
- **Package names are scoped**, e.g. `@<org>/api`, `@<org>/ui` — this is what makes `pnpm --filter @<org>/api run dev` and root-level scripts like `pnpm -r --if-present run lint` work without ambiguity.
- **Pin shared dependencies that are sensitive to module identity via `catalog:` in `pnpm-workspace.yaml`.** A library that does `instanceof` checks or holds a module-level singleton (an HTTP client with a custom error class, a toast library with a module-level event bus) silently breaks if an app and a package it depends on resolve two different copies — `instanceof` returns `false`, or a singleton observer nobody is actually subscribed to eats every event. This doesn't fail lint, typecheck, or build; it fails silently at runtime. Pin any dependency like that once, in `catalog:`, instead of letting each package/app declare its own range.
- **`allowBuilds` in `pnpm-workspace.yaml`**: pnpm 11 fails the whole install (`ERR_PNPM_IGNORED_BUILDS`) on any *undeclared* ignored postinstall script. Declare each one explicitly as `true` (needed, e.g. a native binding your driver actually loads) or `false` (a no-op or a prebuilt binary already shipped in the tarball) — don't leave any postinstall script undeclared.
