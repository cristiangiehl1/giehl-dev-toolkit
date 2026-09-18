# Design: `code-standards` plugin

Date: 2026-09-18

## Motivation

The user asked for development/code standards distilled from five real
projects: `agent-ai`, `sistema-recrutamento-selecao`, `email-frota`,
`email-service`, and the `modulo02-integracao-apis-llms` folder of the
`engenharia-de-software-com-ia-aplicada` course repo. The deliverable is new
skills in this marketplace, in the same spirit as `folder-structure-standard`
(extracted from real codebases, not invented).

The toolkit already covers three adjacent concerns — prompt text structure
(`structured-prompt-engineering`), lint/format setup (`biome-lint-setup`), and
folder layout/layering (`folder-structure-standard`) — so this work must stay
out of their lane and cover what's left: error handling, env/secrets
validation, git & quality workflow, and monorepo/infra config.

This is phase 1 of 2. A second plugin, `llm-integration-patterns` (LLM client
wiring, agent architecture, RAG, guardrails), was scoped in the same
brainstorming session and is deliberately deferred to its own spec → plan →
implementation cycle, built on this one's `error-handling.md` (an LLM SDK
call gets wrapped in the same typed-error convention as any other service
call).

## Research sources

- `agent-ai` — Next.js 16 + React 19, Oracle + Supabase, LangChain/OpenAI,
  BullMQ polling worker, multi-agent orchestrator. Typed `BasicError`
  hierarchy is this project's clearest deliberate convention.
- `sistema-recrutamento-selecao` — pnpm monorepo, Bun API (Hono +
  zod-openapi), Next.js BFF + Vite SPA, extremely well-documented `AGENTS.md`
  (the richest single source — error envelope, Zod env validation, `catalog:`
  pinning rationale, generated-types pipeline all explicit there).
- `email-frota` — pnpm monorepo, Hono BFF, Oracle, Telegram bot integration,
  health-checked `predev` Docker wait loop, no-staging (dev → prod) deploy
  philosophy.
- `email-service` — standalone Fastify + BullMQ microservice; the *legacy*
  reference point (envalid defaults, no husky, dual/redundant secret-loading
  mechanisms) — useful as the anti-pattern to contrast against, not to copy.
- `modulo02-integracao-apis-llms` — course examples; not used for this
  plugin (LLM-specific, reserved for `llm-integration-patterns`).

## Scope decision

Confirmed with the user: split into two plugins so each skill's `description`
trigger stays precise (this repo's own rule — vague/broad descriptions stop
skills from firing correctly). This spec covers only:

**`code-standards`** — TS error handling, env/secrets validation, git &
quality workflow, monorepo/infra config. Broad audience: any TS backend or
monorepo work in this style, independent of whether it touches an LLM.

## Plugin structure

```
plugins/code-standards/
├── SKILL.md
└── references/
    ├── error-handling.md
    ├── validation-and-env.md
    ├── git-and-quality-workflow.md
    └── monorepo-and-project-config.md
```

Follows the existing shape used by `folder-structure-standard` and
`biome-lint-setup`: thin `SKILL.md` (trigger + one-paragraph-per-reference
decision table), depth pushed into `references/*.md`, no `scripts/` for v1
(see Open Items — a scaffolder script is a candidate follow-up, not blocking).

### `SKILL.md`

Frontmatter `description` triggers on error-handling questions ("como trato
erro nessa API", "throw new Error ou uma classe própria?"), env/secrets setup
("como valido env vars", "docker secrets", "swarm secrets"), git workflow
("convenção de commit", "husky", "lint-staged", "checklist de PR"), and
monorepo/infra config ("pnpm workspace", "catalog:", "docker compose por
ambiente"). Explicitly out of scope, stated in the description itself so the
model doesn't fire it by mistake: folder placement (→
`folder-structure-standard`), lint/format tooling (→ `biome-lint-setup`),
prompt text structure (→ `structured-prompt-engineering`), LLM/agent
integration code (→ future `llm-integration-patterns`).

Body: one short paragraph per reference file explaining when to read it, plus
the single highest-value rule from each (skimmable without opening the
reference) — mirrors `folder-structure-standard`'s "read the stack-specific
reference first" table pattern. English body per `AGENTS.md`'s language rule,
with PT-BR trigger phrases embedded in the description alongside the English
ones.

### `references/error-handling.md`

- Base class (`ApiError`/`BasicError`) carrying `statusCode`, `code`
  (`SCREAMING_SNAKE_CASE`), `description`, `action` (a user-facing recovery
  hint, separate from the internal `message`), optional `cause`/`context`.
- One subclass per HTTP status (400/401/403/404/409/422/500/503) with
  sensible default `description`/`action`/`code`, all overridable via
  constructor args.
- Central `onError`/error-handler formats only `ApiError` (`.toJSON()`) and
  `ZodError` (→ 422 via `z.treeifyError`); everything else becomes a generic
  500 — never leak internals to the client.
- Rule, stated as a rule: never `throw new Error(...)` or return an ad-hoc
  status code in a handler — always a typed subclass.
- Where the translation boundary sits: a service wraps a dependency's own
  error (e.g. `HTTPError` from `ky`, a DB driver error) into an `ApiError` —
  that translation happens in the service layer, not the handler.

### `references/validation-and-env.md`

- `env.ts`: one Zod object schema over `process.env`, `safeParse`, and
  `process.exit(1)` with a logged `z.treeifyError` on failure — validated and
  aborted at import time / boot, not lazily at first use.
- Contrast this with the legacy pattern (`email-service`'s `envalid` with
  silent defaults for missing secrets, plus leftover `console.log` debug
  lines that print secret *presence* to stdout) as the explicit anti-pattern,
  with a short note on why fail-fast Zod is preferred for new services.
- Docker Swarm secrets → env: two variants observed, both documented since
  which one applies depends on the base image —
  (a) `entrypoint.sh` shell script exporting `/run/secrets/*` before
  exec'ing the app (needs a shell in the image), and
  (b) a `.cjs` preload module (`node -r ./load-secrets.cjs`) that copies each
  secret file into `process.env` without overwriting an existing key, needed
  for distroless images with no shell. Note the `.cjs` extension requirement
  when `package.json` has `"type": "module"`.
- Request validation: Zod schemas on the route; a validation failure
  auto-converts to the `ValidationError`/422 from `error-handling.md` instead
  of being handled ad hoc per route.

### `references/git-and-quality-workflow.md`

- Conventional Commits with an area/app scope: `feat(backend): ...`,
  `fix(frontend): ...`, `chore: ...`, `docs: ...`, `ci: ...` — scope names the
  app/package touched, not a generic category.
- Merge-commit PR flow (`git log` across every mature repo studied shows
  `Merge pull request #N from ...` — squash/rebase is not the observed
  convention here).
- Pre-commit pipeline: husky `pre-commit` → `lint-staged`, staged-file-only
  `prettier --write` then `eslint --fix`/`eslint` for `*.{js,jsx,ts,tsx}`,
  `prettier --write` alone for `*.{json,md,yml}`. Note the documented trap
  from `sistema-recrutamento-selecao`: a missing glob entry (e.g. no `.tsx`)
  lets a file silently skip formatting.
- The "recipe + PR checklist" documentation pattern from
  `sistema-recrutamento-selecao/AGENTS.md`: a 30-second orientation table, a
  decision tree ("where do I start"), numbered step-by-step recipes with real
  code skeletons, an architecture reference section, and a PR checklist per
  recipe type — offered as a reusable template for writing a project's own
  `AGENTS.md`, not duplicated verbatim (that file itself stays where it is).

### `references/monorepo-and-project-config.md`

- pnpm workspace package boundaries observed: `ui` (design system/tokens),
  `api-client` (typed HTTP client + error/toast plumbing), `api-types`
  (generated from OpenAPI), `eslint-config`, `tsconfig`, `validators` (shared
  Zod primitives) — each publishes raw TS, no build step.
- `catalog:` pinning in `pnpm-workspace.yaml` for any module where two
  independently-resolved copies silently break `instanceof` or a
  module-level singleton (observed failure modes: `error instanceof
  HTTPError` from `ky`, a toast library's global observer) — state this as
  the *test* for when a dependency needs `catalog:`, not an arbitrary list.
- Generated-types pipeline: Zod route schemas → `generate:openapi` →
  `openapi.json` → `openapi-typescript` → a generated types package → **one**
  `api-contract.ts` per consuming app that is the only file importing the
  generated package directly.
- Docker Compose per environment: a health-checked `predev` wait loop
  (`until [ "$(docker inspect -f '{{.State.Health.Status}}' <c>)" =
  'healthy' ]; do sleep 2; done`) before starting dev servers; production
  compose sets `deploy.replicas`, `restart_policy`, `update_config`/
  `rollback_config` with `failure_action: rollback`, resource
  `limits`/`reservations`, `stop_grace_period`, and log rotation
  (`json-file`, `max-size`, `max-file`); only the service with a public,
  browser-facing host gets Traefik router labels — internal-only services
  (workers, BFF-only APIs) get none.

## Non-goals

- Not re-documenting folder placement, lint/format tooling, or prompt-text
  structuring — those stay in their existing skills, referenced not repeated.
- Not prescribing Koch-internal specifics (Oracle table names, Swarm IPs, ERP
  integration details) — patterns are generalized with clean example names,
  the way `folder-structure-standard` already does.
- Not covering LLM/agent integration code — reserved for the
  `llm-integration-patterns` follow-up plugin.
- Not treating the leaked credentials found in `agent-ai/.env.example`
  (real OpenAI/Oracle/AD/Telegram secrets committed to git) as a pattern to
  document — that was reported to the user directly as a security finding,
  out of band from this spec.

## Marketplace registration

Add an entry to `.claude-plugin/marketplace.json` (copying an existing
entry's shape wholesale, especially `author` as an object, never a string —
the documented trap in `AGENTS.md`), and update the plugin table in
`AGENTS.md`, `README.md`, and `README.en-US.md`.

## Validation plan

- `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8'))"`
  after editing.
- `claude plugin marketplace update giehl-dev-toolkit` (or a fresh
  `marketplace add` if needed) then `/plugin install code-standards@giehl-dev-toolkit`,
  and manually trigger the skill with a question from its own trigger list
  (one per reference file) to confirm it fires and reads back sensibly — this
  repo has no automated test suite, so installing and triggering is the
  actual verification step.

## Open items for the implementation plan

- Exact wording/length tuning of `SKILL.md`'s description (needs the literal
  PT-BR + EN trigger phrases per `AGENTS.md`'s language rule).
- Whether a `scripts/` scaffolder (error hierarchy + `env.ts` skeleton) gets
  added in this same pass or a follow-up — leaning follow-up, since v1's
  primary value is the reference docs; flag for a plan-time decision rather
  than deciding here.
