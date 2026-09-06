---
name: biome-lint-setup
description: Use ALWAYS when setting up lint/formatting in a JS/TS project — either a new project ("configura o lint", "setup inicial do projeto", "padroniza a formatação", "set up linting", "standardize formatting") or migrating an existing one ("migra de ESLint pra Biome", "troca o Prettier por Biome", "cria um biome.json", "migrate from ESLint to Biome", "replace Prettier with Biome"). Fire it also when the request mentions only one piece of the set — `.editorconfig`, `.nvmrc`, import sorting (simple-import-sort), Tailwind class sorting, `lint-staged`, or format-on-save in VSCode — because in the Giehl standard these pieces are configured together. Covers Next.js full-stack, Next.js + separate Node API, Vite/SPA frontend-only, and Node backends (Hono, Fastify, Express, NestJS), monorepos included. Use it even if the user never says "Biome": Biome is the default for lint/format in these projects. Scope is lint/format — it does not install or configure husky, CI, or deploy.
---

# Lint/format setup with Biome (Giehl standard)

Replaces the `ESLint + Prettier + eslint-plugin-simple-import-sort + prettier-plugin-tailwindcss` stack with **Biome**, keeping exactly the same code style Prettier already produced — plus `.editorconfig`, `.nvmrc`, and editor/CI integration.

The goal is that running this on an existing project produces **zero or near-zero formatting diff**. If the diff comes out huge, something was translated wrong — investigate before committing.

**Scope:** `biome.json`, `.editorconfig`, `.nvmrc`, `.vscode/`, `package.json` scripts and — only when the project already uses it — `lint-staged`. Husky, CI, and deploy stay out: the script neither installs nor edits those files, it only warns when one of them is left pointing at the removed ESLint/Prettier. If the user asks for CI too, treat it as a separate task instead of widening this setup.

## What to do

Use the script. It is deterministic, idempotent, and already bakes in the translations and validated workarounds below — writing `biome.json` by hand gets details silently wrong (the deprecated `recommended` field, the Nest parser, the Tailwind `fix: "safe"`).

```bash
node <skill>/scripts/setup-biome.mjs --dir . --dry-run   # see the plan first
node <skill>/scripts/setup-biome.mjs --dir .             # apply
```

The script detects stack, framework, package manager, and Tailwind by reading `package.json`. Override when detection does not fit:

| Flag | What for |
|---|---|
| `--stack next\|vite\|react\|node` | force the stack |
| `--framework nest\|express\|fastify\|hono\|none` | force the backend framework |
| `--nested` | package **inside** a monorepo: emits `"root": false` and does not duplicate `.editorconfig`/`.nvmrc`/`.vscode` |
| `--line-width 100` | default is 80 (the Giehl standard) |
| `--node-version v22.14.0` | default: the Node version in use, or preserves the existing `.nvmrc` |
| `--no-install` / `--no-remove-legacy` / `--dry-run` | escape hatches for partial cases |

It **always** installs `@biomejs/biome@latest` and uses the resulting version in `$schema` — never pin the Biome version by hand.

### After running it

```bash
<pm> install
npx biome check --write .   # formats + organizes imports across the project
npx biome check .           # must come out clean
```

The first pass on a legacy project almost always reports new errors: Biome's `recommended` preset includes a11y and correctness rules that `eslint-config-next` never turned on (`useButtonType`, `noUnusedFunctionParameters`, `useExhaustiveDependencies`). **That is signal, not noise** — triaging case by case is more valuable than mass-disabling. Only disable a rule after looking at what it flagged; if you do disable it, record the reason — but read trap 6 before writing a comment in `biome.json`.

Commit the mass reformatting **separately** from the config changes, otherwise any future review becomes unreadable.

## The translation (the heart of the standard)

This is the exact equivalence between the Giehl standard's `prettier.config.mjs` and `biome.json`. If you need to adjust something by hand, this table is the authority:

| Prettier | Biome (`javascript.formatter`) |
|---|---|
| `printWidth: 80` | `formatter.lineWidth: 80` |
| `tabWidth: 2` + `useTabs: false` | `formatter.indentStyle: "space"`, `indentWidth: 2` |
| `semi: false` | `semicolons: "asNeeded"` |
| `singleQuote: true` | `quoteStyle: "single"` |
| `jsxSingleQuote: true` | `jsxQuoteStyle: "single"` |
| `quoteProps: "as-needed"` | `quoteProperties: "asNeeded"` |
| `trailingComma: "es5"` | `trailingCommas: "es5"` |
| `arrowParens: "always"` | `arrowParentheses: "always"` |
| `bracketSpacing: true` | `bracketSpacing: true` |
| `bracketSameLine: true` | `bracketSameLine: true` |
| `endOfLine: "auto"` | `formatter.lineEnding: "lf"` |

Two notes on the ones with **no** direct equivalent:

- **`endOfLine: "auto"` does not exist in Biome.** Use `"lf"` and keep `.editorconfig` (`end_of_line = lf`) aligned. On a team with Windows, make sure Git has `core.autocrlf=input`; `auto` only ever existed to avoid fighting CRLF on disk.
- **`proseWrap` does not apply** — Biome's Markdown formatter is still limited. Markdown stays out of Biome for now.

And the ESLint plugins become native configuration:

| Before | Now |
|---|---|
| `eslint-plugin-simple-import-sort` | `assist.actions.source.organizeImports` with `groups` |
| `prettier-plugin-tailwindcss` | `linter.rules.nursery.useSortedClasses` |
| `eslint-config-next` (core-web-vitals + TS) | `linter.domains: { next, react }` |
| `eslint-plugin-prettier` + `eslint-config-prettier` | nothing — Biome formats and lints without conflict |

`organizeImports` is configured with explicit groups to reproduce the `simple-import-sort` layout (builtins → externals → `@/` alias → relative → styles, separated by a blank line). Without the `groups`, Biome's default groups differently and the first `check --write` reorders the imports of the entire project.

## Traps (all verified in practice, not deduced)

These are the ones that make the setup fail in confusing ways:

1. **`vcs.useIgnoreFile: true` aborts when there is no `.gitignore`.** It is not a warning — Biome exits with a configuration error and checks nothing. In a freshly created repo, create `.gitignore` first (or drop the `vcs` block).

2. **`linter.rules.recommended: true` is deprecated.** The current field is `"preset": "recommended"`. Old configs and examples scattered around the internet still use `recommended` and emit a deprecation warning on every run.

3. **NestJS does not *parse* without `javascript.parser.unsafeParameterDecoratorsEnabled: true`.** Parameter decorators (`@Inject()`, `@InjectRepository()`) are an old proposal and Biome rejects them by default — the files fail at the parser and are never even analyzed. This is the first thing to check when a Nest project "isn't linting anything".

4. **A nested config requires `"root": false`.** Two `biome.json` files without it produce `Found a nested root configuration` and nothing runs. This is the monorepo case (Next + separate Node API) — use `--nested` in the packages.

5. **`useSortedClasses` does not sort with `check --write` by default.** Its fix is *unsafe*, so it stays a warning only. The script sets `fix: "safe"` on the rule, which is what reproduces `prettier-plugin-tailwindcss` behavior. Without it, Tailwind classes stop being sorted and nobody notices for weeks.

6. **A comment in `biome.json` makes Biome discard the entire file — silently.** There is no parse error and no warning: it simply falls back to the default (which formats with **tabs**), and `biome check` starts flagging the whole project. A `//` pasted in to justify a disabled rule cost 50 errors before the cause surfaced. Comments only in `biome.jsonc`; in `biome.json`, record the reason outside the file.

7. **`biome check` rejects `!**/dist/**` as a folder ignore.** The `useBiomeIgnoreFolder` rule wants the bare name (`!**/dist`). This applies to any `files.includes` you write by hand — the script already emits the correct form.

## References

Read on demand, not upfront:

- **`references/stacks.md`** — the delta for each stack: Next full-stack, Next + separate API (monorepo), Vite/SPA, and Node backends with the particulars of Hono, Fastify, Express, and NestJS. Consult it when configuring a specific stack or when a rule is fighting the framework.
- **`references/migration.md`** — migrating a project that already runs ESLint/Prettier: what to uninstall, how to convert `lint-staged`, configuring VSCode, preserving `git blame`, and running the first reformatting pass.
