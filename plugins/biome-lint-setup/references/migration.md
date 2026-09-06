# Migrating a project that already uses ESLint + Prettier

The script does the mechanical part (install, write configs, remove legacy deps and files, rewrite scripts). This document covers what is left: husky/lint-staged, editor, CI, and how to run the mass reformatting without wrecking the history.

## Recommended order

Migrate with a clean tree (empty `git status`) on a dedicated branch. The order matters because step 3 produces a huge diff that needs to stay isolated.

1. **Config** — run the script, review the generated `biome.json`, commit the configs only.
2. **Verification** — `npx biome check .` and read the errors *before* applying anything.
3. **Reformatting** — `npx biome check --write .`, separate commit with a clear message.
4. **Lint fixes** — the remaining errors, in thematic commits.

Separating 1 from 3 is what makes the migration reviewable: in the config commit you can discuss the choices, and the reformatting one can be reviewed with `--ignore-all-space` or simply trusted.

## What the script removes

Files: `.eslintrc*`, `eslint.config.*`, `.eslintignore`, `.prettierrc*`, `prettier.config.*`, `.prettierignore`.

Dependencies: `@eslint/js`, `@eslint/eslintrc`, `eslint`, `eslint-config-next`, `eslint-config-prettier`, `eslint-plugin-prettier`, `eslint-plugin-simple-import-sort`, `eslint-plugin-import`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-unused-imports`, `@typescript-eslint/*`, `typescript-eslint`, `prettier`, `prettier-plugin-tailwindcss`.

It rewrites `package.json` but **does not run the install** for the removal — run `<pm> install` afterwards so the lockfile catches up.

The **rules ESLint had turned off** are not translated: a flat config is code, not data. The script reads the `'off'` entries from the file before deleting it and lists them at the end — it is up to you to decide the Biome equivalent. The most common case, `no-explicit-any` in `**/*.d.ts`, already ships in the generated `biome.json`.

If the project has an ESLint plugin with no Biome equivalent (e.g. in-house company rules, `eslint-plugin-boundaries`), the script has no way to know: either you keep ESLint just for those rules (running alongside Biome, which is supported but doubles CI time), or you accept losing them. Decide explicitly instead of finding out later.

## `package.json` scripts

The script swaps the `lint:prettier:*` / `lint:eslint:*` entries for:

```jsonc
{
  "lint": "biome check .",             // lint + format + imports, report only
  "lint:fix": "biome check --write .", // applies everything that is safe
  "format": "biome format --write .",  // formatting only
  "format:check": "biome format .",    // checks formatting without writing
  "lint:ci": "biome ci ."              // CI mode: does not write, fails on the first problem
}
```

`biome ci` exists for pipelines: besides not writing, it emits GitHub Actions annotations, so errors show up inline in the PR diff.

## lint-staged

It is in scope, but only when the project **already uses** lint-staged — the script does not add the dependency, it just repoints the config. Since a single Biome command covers formatting, imports, and lint, the configuration shrinks to:

```jsonc
// .lintstagedrc.json
{
  "*": ["biome check --write --no-errors-on-unmatched"]
}
```

Why `*` instead of `*.{js,ts,tsx}`: Biome also handles JSON and CSS, and decides on its own what it knows how to process. `--no-errors-on-unmatched` keeps the hook from failing when a commit only contains files Biome ignores (a `.md`, a `.png`).

## husky and CI: out of scope

The script does **not** install or edit husky, GitHub Actions, or any pipeline — those pieces have their own owner and change for different reasons than code style. A `.husky/pre-commit` that calls `lint-staged` keeps working unchanged, because what changed was the lint-staged config, not the hook.

What the script does is **warn**: when removing ESLint and Prettier, it scans `.husky/*`, `.github/workflows/*`, and the root documentation (`README.md`, `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`) and lists whatever is left pointing at a tool that no longer exists. Nothing is changed in those files — the README's script table is usually what ends up stale.

If you decide to update CI, `biome ci` is the pipeline variant — it does not write and emits GitHub Actions annotations, so errors show up inline in the PR diff. But the decision and the edit are yours.

## VSCode

The script writes `.vscode/settings.json` and `.vscode/extensions.json`. Two cautions:

- **Uninstall or disable the `esbenp.prettier-vscode` and `dbaeumer.vscode-eslint` extensions in the workspace.** If they stay active alongside Biome, two formatters fight on save and the file oscillates between styles on every write. It is the #1 problem after migrating.
- The Biome extension (`biomejs.biome`) uses the binary from the project's `node_modules`. If the editor complains it cannot find it, that means the install has not run yet.

## Preserving `git blame`

Mass reformatting pollutes the `git blame` of every file touched. Git has a fix:

```bash
# after the reformatting commit
git rev-parse HEAD >> .git-blame-ignore-revs
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

Commit the `.git-blame-ignore-revs`. GitHub honors that file automatically in the blame view, and whoever clones needs to run the `git config` once (worth putting in the README).

## Confirming the translation is faithful

The honest test that the style did not change: on the commit **before** the migration, run the old Prettier and the new Biome over the same tree and compare.

```bash
git stash                       # stash the new config
npx prettier --write .          # reference state
git diff --stat                 # should be empty if the project was formatted
```

Then apply Biome and look at the size of the diff. A handful of lines (line breaks in edge cases) is expected — Biome and Prettier diverge in rare wrapping situations. Hundreds of lines means an option was translated wrong: check the equivalence table in SKILL.md, especially `semicolons`, `quoteStyle`, `trailingCommas`, and `bracketSameLine`, which move diff volume the most.
