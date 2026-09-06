# Giehl Dev Toolkit

> Personal plugin marketplace for [Claude Code](https://code.claude.com), gathering skills, MCP servers, and other plugins with the patterns, best practices, and code structures used in day-to-day development work.

🌐 **Languages:** [Português (BR)](./README.md) · [English (US)](./README.en-US.md)

---

## About

This repository is a **Claude Code plugin marketplace**. It centralizes, versions, and distributes:

- **Skills** — reusable patterns and workflows (e.g., code review, documentation generation, commit conventions).
- **MCP Servers** — integrations with external tools and services.
- **Miscellaneous plugins** — commands, subagents, and hooks that automate recurring tasks.

The goal is to have a single installation point for everything I use frequently as a developer, instead of manually copying files between machines and projects.

## Available plugins

| Plugin | What it does |
|---|---|
| [`structured-prompt-engineering`](./plugins/structured-prompt-engineering) | Pattern for writing `getSystemPrompt`/`getUserPromptTemplate` as objects serialized via `JSON.stringify`, covering parameterization, output schema, and few-shot examples. |
| [`biome-lint-setup`](./plugins/biome-lint-setup) | Lint/formatting setup with Biome translated from the ESLint + Prettier + simple-import-sort + Tailwind stack, including `.editorconfig` and `.nvmrc`. Covers Next.js, Vite/SPA, and Node backends (Hono, Fastify, Express, NestJS). |

> Everything is written in English. `README.md` is the only Brazilian Portuguese file in the repository.

## Repository structure

```
giehl-dev-toolkit/
├── .claude-plugin/
│   └── marketplace.json      # Catalog listing all registered plugins
├── plugins/
│   └── <plugin-name>/        # One directory per plugin
│       ├── SKILL.md          # Metadata (frontmatter) + skill implementation
│       ├── references/       # Documentation loaded on demand
│       ├── scripts/          # Helper executables
│       └── assets/           # Templates and files used in the output
├── CLAUDE.md                 # Guidance for Claude Code working in this repo
├── README.md                 # Portuguese (BR) version
└── README.en-US.md           # This file (English)
```

Each plugin listed in `marketplace.json` points to a directory under `plugins/`, containing its manifest and implementation (skill, command, hook, or MCP configuration).

Only `SKILL.md` is required. `references/`, `scripts/`, and `assets/` exist for progressive disclosure: the `SKILL.md` body enters context when the skill triggers, while the rest is read only when actually needed.

## Prerequisites

- [Claude Code](https://code.claude.com) installed and configured.
- Git (to clone/publish the repository).

## Installation

### Locally (development/testing)

```bash
claude plugin marketplace add /path/to/giehl-dev-toolkit
```

### Via GitHub (once published)

```bash
claude plugin marketplace add <your-username>/giehl-dev-toolkit
```

## Usage

List added marketplaces:

```bash
claude plugin marketplace list
```

Install a specific plugin inside Claude Code:

```
/plugin install <plugin-name>@giehl-dev-toolkit
```

## Adding a new plugin

1. Create a directory under `plugins/<plugin-name>/`.
2. Add a manifest (`SKILL.md` with frontmatter, or `plugin.json`) describing name, description, and usage.
3. Register the plugin in `.claude-plugin/marketplace.json`, including `name`, `version`, and `source`.
4. Test locally with `claude plugin marketplace add` before publishing.

Step 3 is not optional: a plugin that exists under `plugins/` but is missing from `marketplace.json` simply never shows up for installation — nothing fails, it just doesn't exist. The `name` field must match exactly between `marketplace.json` and the `SKILL.md` frontmatter.

## Conventions

- Plugin names in `kebab-case`.
- Versioning follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).
- Each plugin should have a clear description of what it solves and a usage example.
- The frontmatter `description` is what makes a skill **trigger** — it stays in context every session and should carry the literal phrases a user types, plus what is out of scope. Descriptions that are too short mean the skill never fires.
- **Everything is written in English** — skills, `references/`, `scripts/`, `CLAUDE.md`, and commit messages. The only exception is `README.md`, the Brazilian Portuguese half of the mirror; `README.en-US.md` is the English half, and the two change together.
- The literal triggers quoted inside a `description` stay **bilingual** (PT-BR + English): the description is written in English, but the phrases the user types in Portuguese must be there, otherwise the skill stops firing.

## Versioning and releases

Relevant changes should be tagged in Git following SemVer:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## License

Distributed under the [MIT](./LICENSE) license, unless stated otherwise within a specific plugin.

## Author

**Cristian Giehl**
📧 cristian.giehl@grupokochsa.com.br
