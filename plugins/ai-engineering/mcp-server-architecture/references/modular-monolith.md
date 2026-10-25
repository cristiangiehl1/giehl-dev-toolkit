# Modular monolith (DDD-lite) layout

For an MCP server exposing more than one independent business domain — or a single domain complex enough that its business rules need to be tested independently of its HTTP client.

```
src/
  modules/
    customers/
      domain/            # Customer entity (Zod schema + z.infer), domain errors
      application/        # CustomerService — use cases, orchestrates the infra client
      infrastructure/      # CustomerHttpClient — the concrete REST client
      factory.ts           # createCustomerModule(env): builds and returns CustomerService
      tools/                # register*Tool functions for this domain
      register.ts           # registerCustomerModule(server, service): calls every tool register fn
    orders/
      domain/  application/  infrastructure/  factory.ts  tools/  register.ts
    follow/...
    favorites/...
  mcp/
    server.ts             # composition root: calls each module's factory + register fn, nothing else
  index.ts                # picks the transport, connects it to mcp/server.ts
```

Each module is a **bounded context** in DDD terms: its own vocabulary, its own entity shape, no other module's name appears inside it. `customers/domain/customer.ts` has no idea `orders/` exists.

## The composition root stays thin no matter how many modules exist

```ts
// modules/customers/factory.ts
export function createCustomerModule(env: Env) {
  const client = new CustomerHttpClient(env.CUSTOMERS_BASE_URL, env.SERVICE_TOKEN)
  return new CustomerService(client) // client injected — CustomerService never does `new CustomerHttpClient()` itself
}

// modules/orders/factory.ts — depends on Customers, made explicit as a parameter
export function createOrderModule(env: Env, deps: { customerService: CustomerService }) {
  const client = new OrderHttpClient(env.ORDERS_BASE_URL, env.SERVICE_TOKEN)
  return new OrderService(client, deps.customerService)
}

// modules/customers/register.ts
export function registerCustomerModule(server: McpServer, service: CustomerService) {
  registerListCustomersTool(server, service)
  registerGetCustomerTool(server, service)
  registerCreateCustomerTool(server, service)
  registerUpdateCustomerTool(server, service)
  registerDeleteCustomerTool(server, service)
}

// mcp/server.ts — the ONLY file that knows every module exists; knows nothing about their internals
const customerService = createCustomerModule(env)
const orderService = createOrderModule(env, { customerService })
const followService = createFollowModule(env)
const favoritesService = createFavoritesModule(env, { customerService })

export const server = new McpServer({ name: "shop-mcp-server", version: "1.0.0" })
registerCustomerModule(server, customerService)
registerOrderModule(server, orderService)
registerFollowModule(server, followService)
registerFavoritesModule(server, favoritesService)
```

Two things this buys you that a flat "instantiate everything in `server.ts`" version doesn't:

1. **`server.ts` doesn't grow with domain complexity**, only with domain *count* — adding a 5th domain is two lines here, regardless of how many infra clients or config values that domain needs internally.
2. **Cross-domain dependencies are explicit and visible in one signature** (`createOrderModule(env, { customerService })`) instead of buried inside `OrderService`'s constructor or pulled from a shared global — reading the factory tells you the entire dependency graph without opening `OrderService` itself.

## On prop-drilling: when manual wiring like this is fine, and when it isn't

Passing `service` from the composition root into a `register*Tool` call, which forwards it to nothing but a closure that uses it, is the same shape as prop-drilling in a UI tree — layers forwarding a dependency they don't use themselves. It's tolerable here because it's **shallow** (composition root → module register fn → tool callback, one hop) and because every hop in the chain is a place that either *constructs* something or *uses* something — nothing is purely a pass-through spanning unrelated concerns.

It stops being tolerable once you have enough modules that the composition root's own wiring (the `create*Module(env, {...})` calls) becomes hard to read as a dependency graph — typically somewhere past 8-10 modules with real cross-dependencies between them. At that point the usual next steps, each with a real trade-off, not a free upgrade:

| Option | Gains | Costs |
|---|---|---|
| **Stay manual** (what's shown above) | Every dependency is explicit in a function signature; `grep` for a type finds every consumer | Composition root grows linearly with module count |
| **DI container / service locator** (`container.get('customerService')`) | Composition root stops growing; any layer can pull what it needs | Hides the dependency graph — you can no longer tell what a function needs just by reading its signature; many consider this an anti-pattern for exactly that reason |
| **Context/bag object** (`{ customerService, orderService, config }` threaded through) | Adding a new dependency doesn't change every intermediate function's signature | Becomes a grab-bag — a module can reach into a dependency it was never meant to touch, quietly violating ISP |

Default to staying manual. Reach for a container only when the wiring itself — not the number of files, the actual pain of maintaining the composition root — has become the bottleneck. Introducing one earlier trades away the property that made the manual version valuable: you can see the whole dependency graph by reading one file.

## Migrating from the flat shape

Mechanical, not a rewrite:

1. `types.ts` → `<module>/domain/<entity>.ts` (one file per entity if there's more than one).
2. `services/api-client.ts` → split into `<module>/infrastructure/<entity>-http-client.ts` (the HTTP calls, status-code mapping) and `<module>/application/<entity>-service.ts` (the use cases that were previously just methods on the client, if any existed beyond thin CRUD passthroughs).
3. `tools/*.ts` → move under `<module>/tools/`, update imports, add `<module>/register.ts` to group them.
4. Add `<module>/factory.ts`, move the `new ApiClient(...)` call out of `index.ts` into it.
5. `index.ts` shrinks to transport setup + calling `mcp/server.ts`'s exported `server`.
