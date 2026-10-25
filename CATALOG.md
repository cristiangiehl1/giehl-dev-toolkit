# Catalog

Every plugin in the `giehl-dev-toolkit` marketplace, grouped by domain. Install any of them inside Claude Code with `/plugin install <skill>@giehl-dev-toolkit`.

- **Risk** — `safe`: guidance only, writes no files. `moderate`: runs Bash and/or writes files in the project it is used in (`biome-lint-setup` edits config and `package.json`; `requirements-ux-analyst` writes under `docs/requirements-analyses/`).
- **Source** — `self` means authored in this repository.
- **Tags** — the `keywords` from `marketplace.json`.
- **Triggers** — the tags plus significant words from the description.

> Keep this file in sync with `.claude-plugin/marketplace.json`, `README.md`, `README.en-US.md` and `AGENTS.md` whenever a plugin is added, renamed or removed.

## ai-engineering (2)

| Skill | Description | Risk | Source | Version | Tags | Triggers |
|---|---|---|---|---|---|---|
| [`structured-prompt-engineering`](plugins/ai-engineering/structured-prompt-engineering) | Pattern for writing getSystemPrompt/getUserPromptTemplate as JSON.stringify objects — structure, parameterization, and do's/don'ts | safe | self | 1.0.0 | llm, prompt-engineering, system-prompt, few-shot | llm, prompt-engineering, system-prompt, few-shot, structured, prompt, engineering, pattern, writing, getsystemprompt, getuserprompttemplate, json.stringify |
| [`mcp-server-architecture`](plugins/ai-engineering/mcp-server-architecture) | Folder layout and layering for TypeScript MCP servers — single-domain (flat, Anthropic mcp-builder style) vs multi-domain modular monolith... | safe | self | 1.1.1 | mcp, model-context-protocol, architecture, ddd, solid, zod, typescript, verdaccio, private-registry, npm-publish | mcp, model-context-protocol, architecture, ddd, solid, zod, typescript, verdaccio, private-registry, npm-publish, server, folder |

## code-standards (2)

| Skill | Description | Risk | Source | Version | Tags | Triggers |
|---|---|---|---|---|---|---|
| [`biome-lint-setup`](plugins/code-standards/biome-lint-setup) | Lint/format setup with Biome translated from the ESLint + Prettier + simple-import-sort + tailwindcss standard, with .editorconfig and a Node version... | moderate | self | 1.1.0 | biome, lint, prettier, eslint, formatter, editorconfig | biome, lint, prettier, eslint, formatter, editorconfig, setup, format, translated, simple-import-sort, tailwindcss, standard |
| [`folder-structure-standard`](plugins/code-standards/folder-structure-standard) | Folder layout and layering (model/service/controller/infra) for Next.js full-stack, Vite/React SPA, Node backends (Hono, Fastify, Express), and pnpm... | safe | self | 1.0.0 | folder-structure, architecture, nextjs, node, monorepo, clean-architecture | folder-structure, architecture, nextjs, node, monorepo, clean-architecture, folder, structure, standard, layout, layering, model |

## ux-product (2)

| Skill | Description | Risk | Source | Version | Tags | Triggers |
|---|---|---|---|---|---|---|
| [`requirements-ux-analyst`](plugins/ux-product/requirements-ux-analyst) | Subagent that analyzes raw business requirements and extracts hidden scenarios, unhappy paths, edge cases, required UI states (loading/empty/error)... | moderate | self | 1.1.0 | subagent, requirements, ux, edge-cases, ui-states, frontend, product-owner, mermaid, flowchart | subagent, requirements, edge-cases, ui-states, frontend, product-owner, mermaid, flowchart, analyst, analyzes, raw, business |
| [`system-message-writer`](plugins/ux-product/system-message-writer) | Subagent that writes and standardizes user-facing system messages (errors, validation, empty states, limits) following a blameless... | safe | self | 1.0.0 | subagent, ux-writing, microcopy, error-messages, i18n, json, style-guide | subagent, ux-writing, microcopy, error-messages, i18n, json, style-guide, system, message, writer, writes, standardizes |
