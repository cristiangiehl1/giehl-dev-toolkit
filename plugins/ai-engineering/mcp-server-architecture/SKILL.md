---
name: mcp-server-architecture
description: Use ALWAYS when creating, scaffolding, or reviewing the structure of an MCP (Model Context Protocol) server in TypeScript/Node — starting a new one ("cria um servidor MCP", "estrutura esse projeto MCP", "monta a estrutura de pastas do MCP", "create an MCP server", "structure this MCP project", "scaffold an MCP server", "how should I organize this MCP project"), reviewing/refactoring an existing one ("essa pasta tools tá certa?", "onde eu registro esse tool", "separa isso em domains", "is this the right layer for this tool", "how do I avoid instantiating everything in server.ts", "tá parecendo prop drilling isso"), or publishing one privately ("publica esse mcp de forma privada", "sobe um npm registry privado", "publish this MCP to a private registry", "configura o Verdaccio", "set up Verdaccio", "npx não tá achando meu pacote privado"). Covers: single-domain (wrapping one external API) vs multi-domain (modular monolith) project layout, tool/resource/prompt registration patterns, SOLID applied to `registerTool`, factory + composition root to avoid prop-drilling dependencies across domains, Zod as the single source of truth for input/output schemas, the error-boundary pattern for tool responses, and publishing the server to a private npm registry (Verdaccio) so it installs via `npx` like any public package. Scope is MCP-specific structure, layering, and private distribution (stdio or Streamable HTTP transport, `registerTool`/`registerResource`/`registerPrompt`) — for a regular HTTP backend (Hono, Fastify, Express, NestJS) use `folder-structure-standard` instead; for lint/format use `biome-lint-setup`.
---

# MCP server architecture (Giehl standard)

Defines how to lay out the source of a TypeScript MCP server — from a single-integration "wrap one API" server to a server exposing several independent business domains as tools. Cross-checked against Anthropic's own `mcp-builder` skill (the official MCP SDK guidance) and against this toolkit's `folder-structure-standard` (the Clean-Architecture vocabulary already used here for HTTP backends), recast for MCP's shape: tools/resources/prompts instead of controllers/routes.

**Scope:** where files go, how layers depend on each other, how dependencies get constructed and wired, and how Zod schemas double as validation + types + MCP schema. It does **not** cover MCP transport security (auth, rate limiting — that is a separate concern per integration) or which SDK to pick (assume `@modelcontextprotocol/sdk` for TypeScript).

## Stay current: verify library specifics with Context7

This skill teaches architecture and layering — those patterns are stable. The exact API surface of the libraries involved is not: the MCP TypeScript SDK's `registerTool` signature, Zod's schema methods, Verdaccio's config format, npm's publish flags, `tsx`'s options — any of these can rename a method, deprecate an overload, or add a required field between when this was written and when it's read. Before writing code that depends on a specific library/SDK/tool's current API — not just the MCP SDK, any market technology the task touches — resolve it and pull its docs through Context7 (`resolve-library-id` then `query-docs`) rather than trusting training-data memory or copying a code sample from this skill verbatim. Treat every snippet here as the *shape* to aim for; confirm the *exact* signature against Context7 when it matters.

## Pick the shape first

| Situation | Shape | Reference |
|---|---|---|
| One external API/service being wrapped (Stripe, Slack, GitHub, a single internal REST API), a handful of tools that all share one client | **Flat** — Anthropic's own `mcp-builder` structure | `references/single-domain.md` |
| Several independent business domains in one server (e.g. customers, orders, follow, favorites), or a single domain complex enough to need its own use-case layer separate from its HTTP client | **Modular, DDD-lite** — one `domain/`+`application/`+`infrastructure/` module per bounded context | `references/modular-monolith.md` |

The heuristic that resolves the borderline case: if adding a second capability means a second client + a second set of business rules that share **nothing** with the first, it is a second domain — don't force it into the first domain's `services/` folder just because the project only has two tools so far. Structure for what the domain boundaries actually are, not for today's tool count.

Both shapes are the same architecture at different scale — the flat shape is what the modular shape collapses into when there is exactly one module. Migrating from one to the other later is mechanical: lift `types.ts`/`services/` into `domain/`+`infrastructure/`, keep the tool files as they are.

## The four concerns every MCP server has, regardless of shape

| Concern | Lives in (flat) | Lives in (modular) | Knows about | Never contains |
|---|---|---|---|---|
| **Domain** | `types.ts` | `<module>/domain/` | The business vocabulary: entities, Zod schemas, domain-specific errors | HTTP calls, the `McpServer` instance, tool registration |
| **Application** | folded into `services/` | `<module>/application/` | Business rules; orchestrates one or more infra clients | Raw `fetch`/HTTP details, `server.registerTool` |
| **Infrastructure** | `services/` (the one API client) | `<module>/infrastructure/` | How to talk to one external system: base URL, auth headers, status-code mapping | Business rules, other modules' names |
| **MCP surface** | `tools/` | `<module>/tools/`, `<module>/resources/`, `<module>/prompts/` | `registerTool`/`registerResource`/`registerPrompt`, Zod input/output schemas | Business rules, raw HTTP |

Anthropic's official guide names the infra layer `services/` in the flat shape — don't let that collide in your head with "application service". In a flat, single-domain server there is no ambiguity because there is only one client. The moment you split a domain into its own module, separate that folder explicitly into `application/` (the use case, e.g. `CustomerService.findCustomer()`) and `infrastructure/` (the concrete client, e.g. `CustomerHttpClient`) — otherwise "what changes when the external API changes" and "what changes when the business rule changes" become the same file, which is exactly the coupling layering exists to prevent.

The heuristic from `folder-structure-standard` applies unchanged: **if it changes because the business rule changed, it's application. If it changes because the external API/library changed, it's infrastructure. If it only exists because MCP exists, it's the tools/resources/prompts layer.**

## Naming

- **Server name:** `{service}-mcp-server`, kebab-case, no version number — `customers-mcp-server`, `github-mcp-server`. General enough to survive adding more tools later.
- **Tool name:** `snake_case`, action-oriented, prefixed with the domain — `customers_get`, `orders_list` — not just `get` or `list`. This matters more than it looks: once a server has two domains, unprefixed names collide or become ambiguous to the LLM choosing between tools. Single-domain servers can drop the prefix if the domain is already the server's whole identity (`search_users` inside `slack-mcp-server` is unambiguous).
- **File name inside a module:** generic — `service.ts`, `client.ts`, `factory.ts` — never prefixed with the module's own name (`customer-service.ts` inside `customers/` is redundant once the folder already says "customers"; the one exception in this repo's existing code, `customer-service.ts`/`customer-http-client.ts`, predates this convention — prefer the generic name in new modules).

## SOLID applied to tool registration

- **SRP** — one `register<X>Tool` function per tool; for anything beyond a trivial CRUD set, one file per tool. A tool file never does HTTP directly and never contains business rules — it calls the application layer and shapes the result for MCP.
- **OCP** — adding a tool means adding a file plus one registration call in the composition root; existing `register*` functions are never edited to special-case a new capability.
- **ISP** — a `register<X>Tool(server, service)` function receives only the service(s) it actually calls, never a single object carrying every domain's dependencies. The same applies to Zod schemas: derive a narrow `XQuerySchema`/`XUpdateSchema` per operation instead of reusing the full entity schema with everything optional.
- **DIP** — the composition root instantiates infrastructure clients and application services and *injects* them into tool registration; an application service receives its client via constructor parameter, it never does `new ConcreteClient(...)` internally. That internal `new` is the single most common violation in MCP servers this size — it quietly makes the service impossible to test with a fake client and impossible to reuse against a second transport (e.g. gRPC instead of REST) without touching its code.

## Factory + composition root (avoiding prop-drilling across domains)

With one domain, the composition root (`index.ts`/`server.ts`) building one service and injecting it into five tool-register calls is fine — it's a single, shallow level of manual dependency injection. The moment there is more than one domain, do **not** let the composition root also learn every domain's internal wiring (which client, which base URL, which cross-domain dependency) — that turns it into a god file, and passing every instance down through every tool-register call is structurally the same problem as prop-drilling in a UI tree: layers that don't use a dependency, only forward it.

The fix is a factory per module: each domain owns a `factory.ts` that knows how to build itself, and declares any dependency on another domain as an explicit parameter (never pulled from a shared container). The composition root shrinks to calling factories and registering modules — it stops knowing what's inside any of them.

```ts
// modules/customers/factory.ts
export function createCustomerModule(env: Env) {
  const client = new CustomerHttpClient(env.CUSTOMERS_BASE_URL, env.SERVICE_TOKEN)
  return new CustomerService(client) // injected, never `new`'d inside CustomerService
}

// modules/orders/factory.ts — cross-domain dependency made explicit, not hidden
export function createOrderModule(env: Env, deps: { customerService: CustomerService }) {
  const client = new OrderHttpClient(env.ORDERS_BASE_URL, env.SERVICE_TOKEN)
  return new OrderService(client, deps.customerService)
}

// mcp/server.ts — composition root, now ~10 lines regardless of domain count
const customerService = createCustomerModule(env)
const orderService = createOrderModule(env, { customerService })

registerCustomerModule(server, customerService) // wraps all of that domain's register*Tool calls
registerOrderModule(server, orderService)
```

Full multi-domain tree, the cross-domain-dependency case worked out, and when this is *not* worth it yet (a container/service-locator is the next step up, and it trades explicitness for less wiring — only reach for it once the manual wiring itself becomes the pain, not before) live in `references/modular-monolith.md`.

## Zod as the single source of truth

One Zod schema per entity; derive the TypeScript type with `z.infer`; reuse the exact same schema for runtime validation, `inputSchema`, and `outputSchema` instead of hand-writing three parallel definitions that drift apart. Compose operation-specific variants with `.extend()`/`.pick()`/`.omit()` rather than redeclaring fields. Full pattern, plus a verified SDK trap about `inputSchema` (`z.object({...})` vs the deprecated raw-shape `.shape` form), in `references/zod-schemas.md`.

## Error boundary at the tool layer

A tool handler never lets an exception cross `registerTool`'s callback — it catches and returns a structured error instead:

```ts
async (input) => {
  try {
    const result = await service.doThing(input)
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result }
  } catch (err) {
    const message = `Failed to do thing. Error: ${err instanceof Error ? err.message : String(err)}`
    return { content: [{ type: "text", text: message }], structuredContent: { isError: true, message } }
  }
}
```

Why: an uncaught exception either kills the transport or surfaces to the LLM as an opaque protocol-level failure it can't reason about. A structured `{ isError: true, message }` is something the agent driving the MCP client can read and react to — retry, ask the user, try a different tool.

## Tools vs resources vs prompts

Quick decision, detailed in `references/tool-design.md`:
- **Tool** — the agent *does* something (call an API, mutate state, run a search). Almost everything is a tool.
- **Resource** — static or semi-static reference data the agent can read without "calling" anything conceptually — API docs, a schema description, a config dump.
- **Prompt** — a pre-built message template that kicks off a multi-step task using existing tools (e.g. "find this customer" wired to `get_customer`/`list_customers`). Don't reach for a prompt to do what a tool already does; it exists to pre-package a *sequence* of tool usage for a common request.

## Testing

Hit the server through a real `Client` + `StdioClientTransport` (or the Streamable HTTP transport, for remote servers) end to end — not a mock of the application layer. This mirrors `folder-structure-standard`'s integration-test rule: tests exercise the real path (tool registration → application → infrastructure, against a real or sandboxed external API) rather than asserting on internals. Centralize a `createTestClient()` helper once per project; every test file reuses it.

## Publishing privately (Verdaccio)

To distribute the server the same way a public MCP server is distributed — `npx @scope/pkg@latest` in any client's config — without putting it on the public npm registry, run a self-hosted registry (Verdaccio) and publish to it instead. This is orthogonal to which shape was picked above: publishing only cares about `package.json`'s `files`/`bin` and whether the entry point is runnable post-install, not about how many modules sit inside `src/`.

The two traps that actually break this in practice: the `bin` entry is executed via its **shebang** at install time, so whatever makes it run TypeScript directly (`tsx`, most portably) must be a `dependency`, not a `devDependency` — and the entry file needs to be `chmod +x` *before* `npm pack`/`npm publish`, or npm ships a non-executable shebang. Full recipe, the dual private/public release-script pattern, and a real secrets-in-config trap to avoid, in `references/private-publishing.md`.

## References

Read on demand, not upfront:

- **`references/single-domain.md`** — the flat layout for a server wrapping a single external API: full tree, when it's still the right shape, and the signal that says it's time to graduate to the modular one.
- **`references/modular-monolith.md`** — domain/application/infrastructure per module, the factory + composition-root pattern worked out with a cross-domain dependency, and when a DI container is (and isn't) worth introducing instead of manual wiring.
- **`references/tool-design.md`** — tool naming and collision avoidance, writing tool descriptions agents can actually act on, `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), pagination/response-size limits, and the tool vs resource vs prompt decision in full.
- **`references/zod-schemas.md`** — schema composition patterns (`.extend()`/`.pick()`/`.omit()`), deriving `inputSchema`/`outputSchema` from one schema, and the `z.object(...)` vs `.shape` SDK trap.
- **`references/private-publishing.md`** — running Verdaccio (with persistent storage, unlike a bare `docker-compose up`), the four `package.json` requirements for a working `npx`-installable bin, the dual private/public release scripts, and the `.npmrc` vs explicit `--registry` consumption trade-off.
