# Tool, resource, and prompt design

## Tool vs resource vs prompt

- **Tool** — the agent performs an action: call an API, mutate state, run a search, compute something. This is nearly everything an MCP server exposes.
- **Resource** — reference data the agent reads without framing it as "calling" something: API documentation, a schema description, a static config dump, a file. Register with `server.registerResource(uri, uri, metadata, handler)`. If the content changes per-call based on arguments the agent supplies, it's probably a tool, not a resource.
- **Prompt** — a pre-built message template that kicks off a multi-step task using tools that already exist (e.g. a `find_customer_prompt` that tells the agent to call `get_customer` or `list_customers` with a given query). A prompt never implements logic itself — it only pre-packages *how to ask* for something the tools already do. Don't build a prompt to replace a missing tool.

## Naming and avoiding collisions

`snake_case`, prefixed by domain in any server with more than one domain: `customers_get`, `orders_list`. In a single-domain server where the domain is the server's whole identity, the prefix is optional (`search_users` inside `slack-mcp-server`).

Never let two tools across different domains resolve to the same generic verb (`get`, `list`, `delete`) without a prefix — the agent choosing between tools has only the name and description to go on, and a collision either picks the wrong one silently or forces the agent to guess.

## Writing descriptions the agent can act on

A tool's `description` is the only thing standing between the agent and misusing it — JSDoc comments are **not** auto-extracted, the string has to be explicit. A good description states, in this order:

1. **What it does**, one line.
2. **What it does NOT do** — the adjacent tool it's not, so the agent doesn't reach for it by mistake ("does NOT create or modify users, only searches existing ones").
3. **Args**, each with type and constraint.
4. **Returns**, the actual shape — especially useful when `structuredContent` carries a schema the agent should expect.
5. **Examples** of when to use it vs. the alternative tool, phrased as the kind of request a user would actually make.
6. **Error cases** it can surface and what they mean.

```ts
description: `Search for customers by name, phone, or _id. Does NOT create or update customers — use create_customer / update_customer for that.

Args:
  - name (string, optional): full or partial name to match
  - phone (string, optional): full or partial phone number to match
  - _id (string, optional): exact MongoDB ObjectId — when present, other filters are ignored

Returns: the first matching customer, or null if none matched.

Examples:
  - "find the customer named Maria" -> { name: "Maria" }
  - "is there a customer with _id 65f..." -> { _id: "65f..." }

Errors:
  - Returns { isError: true } with a message if the upstream API is unreachable or returns a non-2xx status.`
```

## Annotations

Set these on every tool — they're metadata the client can use to decide things like "ask for confirmation before running this" without parsing the description:

- `readOnlyHint` — `true` if the tool never mutates anything.
- `destructiveHint` — `true` if it can irreversibly remove/overwrite data (deletes, overwrites).
- `idempotentHint` — `true` if calling it twice with the same input has the same effect as calling it once.
- `openWorldHint` — `true` if it interacts with an open-ended external system (the public internet, a search engine) rather than a fixed, closed dataset.

## Response size and pagination

Tools that can return a large collection need a `limit`/`offset` (or cursor) pair with a sane default (`20` is a reasonable one absent other guidance) and a hard cap (`100`), plus a `has_more`/`next_offset` in the response so the agent can decide whether to page further. Returning an unbounded list is the single most common way a tool silently blows the agent's context — cap it even if the upstream API doesn't force you to.

## Structured content

Always return both `content` (human/LLM-readable text, usually `JSON.stringify(result, null, 2)`) and `structuredContent` (the typed object matching `outputSchema`) — the modern SDK pattern. `structuredContent` is what a client with structured-output support parses directly instead of re-parsing the text block.
