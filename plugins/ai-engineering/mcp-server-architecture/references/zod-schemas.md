# Zod as the single source of truth

## One schema, three uses

Define the entity once; everything else derives from it — never hand-write a parallel TypeScript `interface` next to the Zod schema, they will drift.

```ts
export const CustomerSchema = z.object({
  _id: z.string().optional().describe("MongoDB ObjectId of the customer"),
  name: z.string(),
  phone: z.string(),
})
export type Customer = z.infer<typeof CustomerSchema>
```

This one schema becomes: the runtime validator, the static TypeScript type (`z.infer`), and — passed as `inputSchema`/`outputSchema` — the JSON Schema the MCP client and the LLM see describing the tool's shape.

## Compose variants instead of redeclaring fields

Each operation usually needs a slightly different shape of the same entity. Build it with `.extend()`, not a fresh `z.object({...})`:

```ts
export const CustomerQuerySchema = CustomerSchema.extend({
  name: z.string().optional().describe("Full name of the customer"),
  phone: z.string().optional().describe("phone number of the customer"),
})
export type CustomerQuery = z.infer<typeof CustomerQuerySchema>

export const CustomerUpdateSchema = CustomerQuerySchema.extend({
  _id: z.string().describe("MongoDB ObjectId of the customer"), // now required, unlike the base schema
})
export type CustomerUpdate = z.infer<typeof CustomerUpdateSchema>
```

`.pick()`/`.omit()` cover the opposite need — a narrower schema than the base, e.g. a create-input that must never accept `_id` from the caller:

```ts
const CustomerCreateSchema = CustomerSchema.omit({ _id: true })
```

This also gives you Interface Segregation for free: `create_customer`'s tool only sees the two fields it actually needs, not the full entity with irrelevant fields marked optional.

## The `inputSchema`/`outputSchema` trap: object schema vs raw shape

The MCP TypeScript SDK's `registerTool` accepts `inputSchema`/`outputSchema` in two forms, and only one of them is current:

- **Preferred:** the full Zod object schema — `inputSchema: CustomerQuerySchema`. The SDK auto-detects it's a standard-schema-compatible object and uses it directly.
- **Deprecated (legacy raw-shape form):** a plain record of field schemas — `inputSchema: CustomerUpdateSchema.shape`, or an inline object literal `{ name: z.string(), phone: z.string() }`. The SDK's own type definitions mark this overload `@deprecated` with the note *"Wrap with `z.object({...})` instead."* It still works today (the SDK auto-wraps it), but it's the form on the way out, and a codebase that mixes both — passing a full schema in one tool file and `.shape` in the next — sends a "this API is unstable" signal that isn't actually true; it's just inconsistent usage.

**Rule:** always pass the schema object itself (`CustomerQuerySchema`, not `CustomerQuerySchema.shape`) for both `inputSchema` and `outputSchema`, in every tool file. If an inline schema is genuinely one-off and not reused anywhere else, write it as `z.object({...})` directly rather than a bare `{...}` shape literal — same reasoning, same fix.

## `describe()` is not optional documentation

Every field the agent fills in should carry a `.describe(...)` — it is the only per-field explanation the LLM gets when the tool's JSON Schema is shown to it. A schema with types but no descriptions still validates correctly and still produces a noticeably worse agent — it will guess at what `phone` should look like instead of being told.
