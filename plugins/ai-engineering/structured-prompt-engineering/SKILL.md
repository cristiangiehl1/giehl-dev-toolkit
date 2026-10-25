---
name: structured-prompt-engineering
description: Use ALWAYS when writing, reviewing, or refactoring a system prompt and/or user prompt for an LLM call — no matter the framework (LangChain, Vercel AI SDK, a direct call to OpenAI/OpenRouter/Anthropic). Fire it on requests like "cria o prompt para...", "como estruturar esse system prompt", "meu prompt não está extraindo direito", "separa o system do user prompt", "monta um few-shot pra esse caso", "write the prompt for...", "how do I structure this system prompt", "my prompt isn't extracting correctly", "split the system from the user prompt", or whenever you are writing a `getSystemPrompt`/`getUserPromptTemplate` function. Teaches the pattern of a prompt as a structured object serialized via `JSON.stringify` (role, rules, extraction_instructions, examples), how to parameterize those functions with whatever must be injected, and strongly reinforces good usage vs. common mistakes (do's and don'ts) — derived from real production prompts.
---

# Structured prompt: `getSystemPrompt` + `getUserPromptTemplate`

This is the pattern for writing LLM prompts as **functions that return a serialized object**, instead of free-flowing text strings. It works with any stack that accepts a `system` and a `user`/`human` message — the technique itself is framework-independent.

## Why a serialized object instead of prose

A prompt written as a paragraph of text is hard to review in parts, hard to diff between versions, and tends to grow into a giant, brittle block. By serializing an object (`JSON.stringify({...})`) you get:

- **Named sections, reviewable independently** (`role`, `rules`, `examples` are separate blocks, not one tangled paragraph).
- **Easy dynamic generation** — you just build a normal JS/TS object, with no string concatenation.
- **A format the model is already good at parsing** — LLMs have been trained heavily on JSON, so the structure helps the model "find" the right rule instead of losing information in a long stretch of prose.

## Anatomy of `getSystemPrompt`

`getSystemPrompt` is a function that receives **only what changes per session/config** — never the current turn's user message (that is always `getUserPromptTemplate`'s job). The parameters are whatever must be **injected**: reference data (list of professionals, product catalog), context already known about the user (saved preferences), and so on.

```ts
export const getSystemPrompt = (userContext?: string) => {
  return JSON.stringify({
    role: 'Enthusiastic, friendly music assistant - warm, upbeat, conversational (2-4 sentences)',

    tasks: [
      'Chat about music preferences and make personalized recommendations',
      'Extract information about the user (name, age, genres, bands, mood, context)',
      'ALWAYS recommend specific songs (title and artist) based on what you know about the user',
    ],

    // Injected data, never hardcoded inside the object.
    previously_stored_preferences: userContext || 'None',

    extraction_rules: {
      shouldSavePreferences: 'Set to true ONLY when the USER shares NEW personal information',
      never_extract: 'Songs, bands, or artists that YOU (the AI) recommended - only what the USER said they like',
    },

    examples: [
      /* see the "Examples" section below */
    ],
  });
};
```

Recurring sections that work well:

| Section | What it is for |
|---|---|
| `role` | Defines the persona and the tone — 1 sentence, direct. |
| `tasks` | List of what the model must do in this call, not what it is. |
| `rules` | How to decide between cases (e.g. which intent to pick, when to extract something). |
| `extraction_instructions` | One instruction per field of the output schema — never leave it implicit. |
| `examples` | Few-shot — see the dedicated section below. |
| *(dynamic data)* | Any injected context (summarized history, reference list) goes in as its own key, never buried inside `role` or `rules`. |

Keep the key names consistent across the project. If the assistant must answer in a language other than English, that is an **instruction inside the prompt** (`'Reply in Brazilian Portuguese'`), not a reason to rename the sections.

## Anatomy of `getUserPromptTemplate`

It receives the **current turn's input** as a parameter (never hardcoded) and, if needed, additional context specific to that call (conversation history, data already collected). It always includes an explicit `instructions` array — even when that looks redundant with the system prompt, repeating the instruction in the user prompt (focused on what to do *with this specific input*) reduces drift in long conversations.

```ts
export const getUserPromptTemplate = (
  userMessage: string,
  conversationHistory?: string
) => {
  return JSON.stringify({
    conversation_context: conversationHistory || 'First message',
    current_user_message: userMessage,
    instructions: [
      'Generate a warm, engaging reply',
      'ALWAYS include specific song recommendations when relevant',
      'Extract any preferences the user shared',
      'Set the shouldSavePreferences flag appropriately',
    ],
  });
};
```

## Parameterization: what to inject vs. what to hardcode

Rule of thumb: if the value can change between calls (per environment, per user, per turn), it is a **function parameter**, never a literal inside the returned object.

- List of professionals/products/catalog → parameter of `getSystemPrompt`.
- Context/preferences already known about the user → parameter of `getSystemPrompt`.
- The user's message in the current turn → parameter of `getUserPromptTemplate`, never of `getSystemPrompt`.
- Current date/time, when the prompt needs it to interpret "tomorrow", "today" → generate it inside the function (`new Date().toISOString()`) so it does not depend on the caller remembering to pass it.
- Fixed tone/format instructions that never change → can stay hardcoded in the object, no need for a parameter.

## The output schema travels with the prompt, in the same file

Each prompt module exports, alongside the two functions, the schema (Zod or equivalent) describing the expected output — with a `.describe()` on each field acting as that field's extraction instruction:

```ts
export const ChatResponseSchema = z.object({
  message: z.string().describe('The conversational reply to the user'),
  preferences: UserPreferencesSchema.optional().describe('Preferences extracted from this message'),
  shouldSavePreferences: z.boolean().describe('Whether the extracted preferences should be saved'),
});
```

## Examples (few-shot) inside the prompt

The `examples` array is the part that most affects extraction quality. A good set of examples covers: the happy path, the ambiguous/empty case, and at least one annotated counter-example. See `references/examples.md` for 4 complete, commented examples taken from real prompts (intent classification, message generation, preference extraction, summarization).

Minimum structure of a good example:

```ts
{
  user: 'I especially like Tame Impala and Daft Punk',
  response: {
    message: 'Great taste! Try "Let It Happen" and "Digital Love"!',
    preferences: { favoriteBands: ['Tame Impala', 'Daft Punk'] },
    shouldSavePreferences: true,
  },
  important_note: 'EXTRACT — the user explicitly stated they LIKE these bands (they were not AI recommendations)',
}
```

The `important_note` (or `note`) field is not decoration — it is what conveys the *why* behind that extraction decision, which helps the model generalize to similar cases that are not in the examples.

## Do's and Don'ts

### ✅ Do

- **Define the output schema before writing the prompt text.** The prompt exists to fill the schema — start from the contract.
- **Describe every schema field with `.describe()`**, even the obvious ones. The description is read as an extraction instruction.
- **Rigorously separate what is `system` (config/session) from what is `user` (current turn).** The user's message never goes into `getSystemPrompt`.
- **Include at least one annotated counter-example** whenever there is a risk of the model confusing "what the user said" with "what the AI generated/recommended" — that is the most common and most silent extraction error.
- **Return deterministic flags** (`shouldSavePreferences`, `intent`, `actionSuccess`) instead of forcing the consumer of the response to reinterpret free text.
- **Inject every value that varies** (reference lists, user context, current date) as a function parameter — never hardcode.
- **One prompt file = one responsibility.** `identifyIntent.ts`, `messageGenerator.ts`, `summarization.ts` are separate files, not one mega-prompt doing everything.
- **Repeat the relevant instruction in the `user prompt`**, even when it is already in the system — in long conversations that reduces model forgetting/drift.

### ❌ Don't

- **Don't write the system prompt as a free-text paragraph.** If it is hard to review "which sentence does what", it should already be an object with sections.
- **Don't put the current turn's message inside `getSystemPrompt`.** That breaks prompt caching (where the provider supports it) and mixes what is stable with what changes on every call.
- **Don't leave an `optional()` schema field without `.describe()`.** An optional field with no description is extracted inconsistently between calls.
- **Don't assume the model will "figure out" an obvious ambiguity on its own** (e.g. not confusing an AI recommendation with a user preference). Without an annotated counter-example, that error repeats.
- **Don't hardcode reference data** (lists, catalogs, IDs) directly in the object's text — that ties the prompt to one environment/test. Always a parameter.
- **Don't mix two responsibilities in the same prompt** (e.g. classifying intent AND generating the final message in the same `getSystemPrompt`). Each concern gets its own prompt module.
- **Don't edit a production prompt destructively.** When changing the structure, create a new version (`v2`) instead of overwriting — it lets you compare and roll back.

## References

- `references/examples.md` — 4 complete, commented examples of `getSystemPrompt`/`getUserPromptTemplate` + schema, covering: preference extraction, intent classification, reply message generation, and conversation summarization.
