# Single-domain (flat) layout

For an MCP server wrapping exactly one external API or service — this is the structure Anthropic's own `mcp-builder` skill recommends, and it is the right default until a second, unrelated capability shows up.

```
{service}-mcp-server/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts          # entry point: picks the transport (stdio or Streamable HTTP), builds McpServer
    ├── types.ts           # Zod schemas for the domain's entities + z.infer'd types
    ├── constants.ts       # API_URL, CHARACTER_LIMIT, default page size, etc.
    ├── services/          # the ONE api client + shared utilities (auth headers, pagination, response formatting)
    │   └── api-client.ts
    └── tools/             # one file per tool, or per closely related group of tools
        ├── search-users.ts
        └── create-user.ts
```

## Why `services/` and not `infrastructure/`

With a single external dependency there is no ambiguity to resolve: "the API client" and "the layer that talks to the API" are the same thing, so one folder is enough. Splitting `application/` out from `infrastructure/` here would separate two files that always change together for no benefit — that split earns its keep only once there's a business rule independent of the HTTP call it happens to use today (see `modular-monolith.md`).

## `index.ts` responsibilities

Keep it to: read config/env, build the transport, construct the `McpServer`, call every `register*Tool` (and `register*Resource`/`register*Prompt` if any), connect the transport. No business logic, no HTTP calls of its own.

```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { ApiClient } from "./services/api-client.ts"
import { registerSearchUsersTool } from "./tools/search-users.ts"
import { registerCreateUserTool } from "./tools/create-user.ts"

const client = new ApiClient(process.env.API_TOKEN!)
const server = new McpServer({ name: "example-mcp-server", version: "1.0.0" })

registerSearchUsersTool(server, client)
registerCreateUserTool(server, client)

await server.connect(new StdioServerTransport())
```

Note `client` is built once here and injected into every `register*Tool` call — not instantiated inside any of them. That's the same Dependency Inversion rule the modular shape follows, just with one dependency instead of several.

## The signal that says "graduate to modular"

Any one of these means the flat shape is fighting you rather than helping:

- A second `services/` client shows up that shares no business rule with the first one (a second unrelated API, or a datastore alongside the API).
- A use case needs to orchestrate *two* clients to answer one tool call (e.g. "find the customer, then look up their orders") — that orchestration is application logic that no longer belongs folded into a single client file.
- `tools/` grows past the point where a flat list of files still reads as one coherent surface — usually once you're naming files by the *domain* they belong to rather than by the single verb-object action (`search-users.ts`, `create-user.ts`) the flat shape assumes.

When any of those hit, don't reorganize by adding more flat folders — move to `modular-monolith.md`: lift `types.ts` into `<module>/domain/`, split `services/api-client.ts` into `<module>/application/` (the orchestration) and `<module>/infrastructure/` (the client), and give each domain its own `tools/` under its module.
