# Node backend (Hono, Fastify, Express)

NestJS is the exception: it already has a strong, opinionated module convention (`@Controller`/`@Injectable`/`@Module` per feature module) — follow NestJS's own structure instead of this one, same exception `biome-lint-setup` already makes for it.

```
src/
├── env.ts                    # zod: parses process.env once
├── config.ts                 # CONFIG.database / CONFIG.openai / CONFIG.email — frozen, namespaced
├── app.ts                    # builds the framework instance, registers global middleware
├── controller.ts             # the GLOBAL error handler (onError/notFound) — not a per-domain controller
├── errors.ts                 # shared custom error classes (ApiError, ValidationError, ...)
├── index.ts                  # entrypoint
│
├── scripts/                  # one-off maintenance: migrate.ts, seed.ts, wait-for-oracle.ts, generate-openapi.ts
├── workers/                  # background/queue job entrypoints — call the SAME services as the HTTP layer
│
├── shared/
│   ├── http/                 # reusable generic HTTP clients (not tied to one external provider)
│   ├── middleware/           # require-auth.ts, require-owner.ts, ...
│   └── schemas/              # cross-domain schemas (pagination, error-response)
│
├── infra/                     # never versioned — external clients only
│   ├── database/
│   │   ├── oracle/
│   │   │   ├── client.ts      # getDb(): global-cached pool singleton
│   │   │   ├── database.ts    # the class: pool, query(), etc.
│   │   │   ├── migrations/
│   │   │   └── seeds/
│   │   └── redis/
│   │       ├── client.ts
│   │       └── index.ts
│   ├── openai/
│   │   ├── client.ts
│   │   └── service.ts
│   ├── email/
│   └── storage/
│
└── v1/
    └── <domain>/               # e.g. vehicles/
        ├── index.ts            # registers this domain's routes
        ├── model.ts
        ├── service.ts
        └── <action>/           # get/, list/, create/, update/, delete/ — or a sub-resource, for a large domain
            ├── handler.ts       # the controller: parse request → call service → return response
            ├── route.ts         # route registration only — method, path, references handler + schema
            └── schema.ts        # request/response validation for this one action
```

Tests: `tests/{unit,integration,e2e}` at the root of `src/`, same rules as `SKILL.md` — `tests/integration/v1/<domain>/get.test.ts` hits the real route end to end.

## Rules specific to this stack

- **`handler.ts` is the controller, `route.ts` is just registration.** Unlike Next.js (where `route.ts` does both), here the two are split: `route.ts` only wires method + path + schema to a handler, `handler.ts` holds the actual parse-call-respond logic. Neither contains business rules — that's `service.ts`.
- **Root `controller.ts` is not a domain controller.** It's the framework's global error handler (`onError`/`notFound`), converting thrown domain errors (`ValidationError`, `ApiError`) into the HTTP response shape. Don't confuse it with the per-action `handler.ts` files.
- **`workers/` and HTTP `handler.ts` call the same `service.ts`.** That's the entire reason business logic lives in `service`, not in `handler`: a background job and an HTTP request reach the same rule without duplicating it.
- **A large domain nests sub-resources**, not just actions: `v1/candidates/profile/`, `v1/candidates/jobs/` can each have their own `model.ts`/`service.ts`/`index.ts` and their own `<action>/` subfolders, when a domain (`candidates`) is big enough to have independent sub-resources with their own data shape.
- **`infra/<provider>/` always gets its own subfolder** with generic file names inside (`client.ts`, `service.ts`) — never a flat `<provider>-client.ts` sitting directly under `infra/database/`. Prefixing by provider name is redundant once the provider already has its own folder.
