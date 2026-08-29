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

## Repository structure

```
giehl-dev-toolkit/
├── .claude-plugin/
│   └── marketplace.json      # Catalog listing all registered plugins
├── plugins/
│   └── <plugin-name>/        # One directory per plugin
│       └── SKILL.md          # Metadata + skill implementation
├── README.md                 # Portuguese (BR) version
└── README.en-US.md           # This file (English)
```

Each plugin listed in `marketplace.json` points to a directory under `plugins/`, containing its manifest and implementation (skill, command, hook, or MCP configuration).

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

## Conventions

- Plugin names in `kebab-case`.
- Versioning follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).
- Each plugin should have a clear description of what it solves and a usage example.

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
