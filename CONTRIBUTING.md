# Contributing

Thanks for your interest in improving `giehl-dev-toolkit`. This repository is a **Claude Code plugin marketplace**, not an application: there is no build or automated test suite. The "product" is Markdown files with frontmatter (skills and subagents) plus a few helper scripts.

`AGENTS.md` is the detailed operational guide (also read by coding agents). This file is the short version for people.

## Language

Everything is written in **English**, including commit messages, except `README.md`, which stays in Brazilian Portuguese (it mirrors `README.en-US.md`; the two change together).

The one exception inside plugins: literal trigger phrases quoted in a `description` stay bilingual (PT-BR + English), because users type in Portuguese and a description without those phrases stops triggering.

## Repository layout

```
.claude-plugin/marketplace.json     # catalog: what Claude Code sees and installs
plugins/<domain>/<plugin-name>/     # one directory per plugin
├── SKILL.md                        # skill: frontmatter + body
├── agents/<name>.md                # subagent (instead of SKILL.md)
├── references/                     # docs read on demand
├── scripts/                        # helper executables
└── assets/                         # templates used in the output
```

Plugins are grouped by **domain**, not by type. Current domains: `code-standards`, `ai-engineering`, `ux-product`. Reuse one; create a new domain only when none fits.

## Adding a plugin

1. Create `plugins/<domain>/<plugin-name>/` (`kebab-case`) with a `SKILL.md` or an `agents/<name>.md`.
2. Register it in `.claude-plugin/marketplace.json`. **Copy an existing entry** and swap the values (`author` must be an object). A plugin missing from the catalog is invisible: nothing fails, it just never shows up.
3. Keep `name` identical in `marketplace.json` and in the frontmatter.
4. Add a row to the plugin table in `README.md`, `README.en-US.md` and `AGENTS.md`.
5. Write a `description` that carries the literal phrases a user would type and says what is out of scope. Short descriptions mean the plugin never fires.

## Testing your change

Validate the catalog and install it locally (the CLI needs an absolute path):

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8'))"
claude plugin validate .
claude plugin marketplace add /absolute/path/to/giehl-dev-toolkit
claude plugin marketplace update giehl-dev-toolkit
claude plugin install <plugin-name>@giehl-dev-toolkit
```

`JSON.parse` passing is not enough: entries are schema-validated at install time. Then trigger the plugin in a real session. For scripts, also run `node --check plugins/<domain>/<name>/scripts/<file>.mjs`.

When a skill claims how an external tool behaves, verify it by running the tool instead of deducing it.

## Commits and pull requests

- [Conventional Commits](https://www.conventionalcommits.org/) in English, with the plugin as scope: `feat(system-message-writer): add ...`, `fix(biome-lint-setup): ...`.
- Use `refactor:` or `docs:` without a scope for repository-wide changes.
- Versions follow [SemVer](https://semver.org/). Bump `version` in `marketplace.json` when a plugin changes behavior; releases are tags (`git tag vX.Y.Z && git push origin vX.Y.Z`).
- Keep one logical change per pull request and describe how you tested it.
