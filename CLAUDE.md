# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language: write everything in English

**Every file in this repository is written in English — the only exception is `README.md`, which stays in Brazilian Portuguese** (it is the PT-BR half of the README mirror; `README.en-US.md` is the English half).

That means English for: `CLAUDE.md`, `SKILL.md` bodies and frontmatter, `references/`, `scripts/` (comments, CLI help and console output), `assets/`, `.claude-plugin/marketplace.json` descriptions, `docs/`, and commit messages.

If you are an agent working here: **do not write PT-BR prose**, even when the user talks to you in Portuguese, and even when the file you are editing already contains PT-BR — translate it as you go instead of matching it. A PT-BR paragraph added to a skill is a defect, not a style choice.

**The one thing that stays bilingual:** literal trigger phrases quoted inside a `description`. The user types in Portuguese, so a description whose triggers only exist in English stops firing. Write the description in English and quote the trigger phrases in both languages:

```yaml
description: Use ALWAYS when setting up lint/formatting in a JS/TS project — a new project
  ("configura o lint", "set up linting", "padroniza a formatação") or migrating an existing
  one ("migra de ESLint pra Biome", "switch Prettier for Biome")...
```

## What this repository is

A **Claude Code plugin marketplace** — not an application. There is no build, bundler, automated test suite, or root `package.json`. The "product" is Markdown files with frontmatter (skills) plus helper scripts, consumed by Claude Code itself.

Practical consequence: changes are validated by **installing the marketplace locally and triggering the skill**, not by running a suite. Do not invent test commands.

## Commands

```bash
# validate the catalog before committing (a JSON error breaks the whole marketplace)
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8'))"

# validate skill scripts
node --check plugins/<name>/scripts/<file>.mjs

# install/test locally (the CLI rejects `.` and relative paths — use the absolute one)
claude plugin marketplace add /absolute/path/to/giehl-dev-toolkit
claude plugin marketplace list

# reload the catalog after editing marketplace.json
claude plugin marketplace update giehl-dev-toolkit
```

Inside Claude Code: `/plugin install <name>@giehl-dev-toolkit`.

Installed by directory, edits to `SKILL.md` take effect immediately; changes to `marketplace.json` only after `marketplace update`.

To publish a version: `git tag vX.Y.Z && git push origin vX.Y.Z` (SemVer).

## Architecture

There are **two sources of truth that must stay in sync**, and this is the most common mistake when working here:

| File | Role |
|---|---|
| `.claude-plugin/marketplace.json` | catalog — what Claude Code sees and installs |
| `plugins/<name>/SKILL.md` | frontmatter (`name`, `description`) + implementation |

A skill created under `plugins/` but **not registered in `marketplace.json` is invisible** — nothing fails, it simply does not exist for the installer. The `name` field must be identical in both places, and `source` points to `./plugins/<name>`.

#### The entry schema, not just the JSON

`JSON.parse` passing guarantees nothing: Claude Code validates each entry against a schema **at install time**, and the failure surfaces only there, as `This plugin's marketplace entry is invalid: ...`. `marketplace add` and `marketplace list` keep working normally with a broken entry.

The trap already hit in practice: `author` **must be an object**, never a string.

```jsonc
"author": { "name": "Cristian Giehl", "email": "cristian.giehl@gmail.com" }  // ✅
"author": "Cristian Giehl"                                                   // ❌ expected object, received string
```

When adding a plugin, copy an existing entry wholesale and swap the values instead of writing the fields from memory — and validate by actually installing it, not just with `JSON.parse`.

### Anatomy of a skill

```
plugins/<name>/
├── SKILL.md       # required: frontmatter + body
├── references/    # .md docs read on demand
├── scripts/       # executables (run without loading context)
└── assets/        # templates/files used in the output
```

Loading happens on three levels (*progressive disclosure*), and writing a skill without respecting that wastes context:

1. `name` + `description` — always in context, in every session;
2. the `SKILL.md` body — loaded when the skill triggers (keep it under ~500 lines);
3. `references/`, `scripts/`, `assets/` — only when needed.

Long or variant-specific content goes into `references/`, pointed to from `SKILL.md` with an indication of *when* to read it. Mechanical, repetitive work (generating config, editing `package.json`) goes into `scripts/` — deterministic code makes fewer mistakes than instructing the model to rewrite JSON by hand. See `plugins/biome-lint-setup/` as the reference for this split.

### The `description` is the trigger mechanism

Skills are not invoked by name — they fire because the model read the `description` and decided it applies. That is why the descriptions here are long, deliberately insistent ("Use ALWAYS when...") and full of **literal triggers** — the phrases the user actually types. They also delimit what is out of scope, to avoid firing at the wrong time.

When editing a description, preserve those characteristics: shortening it to look "cleaner" usually makes the skill stop triggering. And keep the PT-BR trigger phrases alongside the English ones (see the language section above) — the user prompts in Portuguese.

## Conventions

- **Language:** everything in English, except `README.md`. See the language section at the top of this file — it is not negotiable.
- **`README.md` and `README.en-US.md` are mirrors** — when changing one, update the other in the same change. `README.md` is PT-BR, `README.en-US.md` is English.
- Plugin names in `kebab-case`; version in SemVer in `marketplace.json`.
- Commit messages follow Conventional Commits **in English**, with the plugin name as the scope: `feat(biome-lint-setup): add ...`.
- When asserting external tool behavior inside a skill, **verify by running it** instead of deducing. The traps documented in `plugins/biome-lint-setup/` came from actually running Biome in a sandbox; several contradict what the documentation suggests.
