#!/usr/bin/env node
/**
 * setup-biome.mjs — applies the Biome lint/format standard (Giehl) to a project.
 *
 * Usage:
 *   node setup-biome.mjs [--dir .] [--stack auto] [--framework auto] [--pm auto]
 *                        [--line-width 80] [--node-version vX.Y.Z]
 *                        [--nested] [--no-install] [--no-remove-legacy] [--dry-run]
 *
 * --stack      auto | next | vite | node | react   (auto = detected from the deps)
 * --framework  auto | nest | express | fastify | hono | none  (only matters for stack=node)
 * --nested     emits "root": false — use it in packages inside a monorepo
 * --dry-run    shows what it would do, without writing anything
 *
 * Never pins the Biome version: always installs @biomejs/biome@latest and uses
 * the resulting version in $schema.
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = argv[i + 1]
  return !next || next.startsWith('--') ? true : next
}
const has = (name) => argv.includes(`--${name}`)

const DIR = path.resolve(String(flag('dir', '.')))
const DRY = has('dry-run')
const NESTED = has('nested')
const LINE_WIDTH = Number(flag('line-width', 80))

const log = (...a) => console.log(...a)
const changes = []

// In JSON what counts is the structure, not the text: the files we generate come
// out of JSON.stringify and right afterwards go through Biome's formatter, which
// collapses a short array onto one line. Comparing string to string would make
// every rerun of the script "rewrite" an identical file — goodbye idempotence.
function sameJson(rel, prev, content) {
  if (prev === null || !rel.endsWith('.json')) return false
  try {
    return JSON.stringify(JSON.parse(prev)) === JSON.stringify(JSON.parse(content))
  } catch {
    return false
  }
}

function write(rel, content) {
  const abs = path.join(DIR, rel)
  const exists = fs.existsSync(abs)
  const prev = exists ? fs.readFileSync(abs, 'utf8') : null
  if (prev === content || sameJson(rel, prev, content)) {
    log(`  = ${rel} (already correct)`)
    return
  }
  changes.push(rel)
  log(`  ${exists ? '~' : '+'} ${rel}`)
  if (DRY) return
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}

function remove(rel) {
  const abs = path.join(DIR, rel)
  if (!fs.existsSync(abs)) return
  changes.push(`- ${rel}`)
  log(`  - ${rel}`)
  if (DRY) return
  fs.rmSync(abs, { recursive: true, force: true })
}

const json = (obj) => `${JSON.stringify(obj, null, 2)}\n`

// ---------------------------------------------------------------- context

const pkgPath = path.join(DIR, 'package.json')
if (!fs.existsSync(pkgPath)) {
  console.error(`✗ package.json not found in ${DIR}`)
  process.exit(1)
}
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const deps = { ...pkg.dependencies, ...pkg.devDependencies }
const dep = (n) => Boolean(deps[n])

function detectPm() {
  const fromFlag = flag('pm', 'auto')
  if (fromFlag !== 'auto' && fromFlag !== true) return fromFlag
  if (fs.existsSync(path.join(DIR, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(DIR, 'bun.lockb')) || fs.existsSync(path.join(DIR, 'bun.lock'))) return 'bun'
  if (fs.existsSync(path.join(DIR, 'yarn.lock'))) return 'yarn'
  if (pkg.packageManager) return String(pkg.packageManager).split('@')[0]
  return 'npm'
}

function detectStack() {
  const fromFlag = flag('stack', 'auto')
  if (fromFlag !== 'auto' && fromFlag !== true) return fromFlag
  if (dep('next')) return 'next'
  if (dep('vite')) return 'vite'
  if (dep('react')) return 'react'
  return 'node'
}

function detectFramework() {
  const fromFlag = flag('framework', 'auto')
  if (fromFlag !== 'auto' && fromFlag !== true) return fromFlag
  if (dep('@nestjs/core')) return 'nest'
  if (dep('express')) return 'express'
  if (dep('fastify')) return 'fastify'
  if (dep('hono')) return 'hono'
  return 'none'
}

const PM = detectPm()
const STACK = detectStack()
const FRAMEWORK = STACK === 'node' ? detectFramework() : detectFramework()
const HAS_TAILWIND = dep('tailwindcss') || dep('@tailwindcss/postcss')
const HAS_REACT = dep('react')
const IS_FRONT = STACK === 'next' || STACK === 'vite' || STACK === 'react'

// ---------------------------------------------------------------- biome install

function installBiome() {
  if (has('no-install')) return currentBiomeVersion() ?? 'latest'
  const cmd = {
    pnpm: 'pnpm add -D @biomejs/biome@latest',
    yarn: 'yarn add -D @biomejs/biome@latest',
    bun: 'bun add -d @biomejs/biome@latest',
    npm: 'npm i -D @biomejs/biome@latest',
  }[PM]
  log(`\n▸ installing Biome (${PM})`)
  log(`  $ ${cmd}`)
  if (!DRY) execSync(cmd, { cwd: DIR, stdio: 'inherit' })
  return currentBiomeVersion() ?? 'latest'
}

function currentBiomeVersion() {
  try {
    const p = path.join(DIR, 'node_modules/@biomejs/biome/package.json')
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')).version
    return execSync('npm view @biomejs/biome version', { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- biome.json

function ignoresFor(stack) {
  // A folder is ignored by its bare name (`!**/dist`), not by `!**/dist/**` —
  // Biome's own useBiomeIgnoreFolder rule rejects the second form, and the config
  // we generate has to pass the `biome check` this script tells you to run.
  const base = [
    '!**/node_modules',
    '!**/dist',
    '!**/build',
    '!**/coverage',
    '!**/*.min.js',
  ]
  if (stack === 'next') base.push('!**/.next', '!**/out', '!**/next-env.d.ts')
  if (stack === 'node') base.push('!**/*.generated.ts')
  return base
}

function buildConfig(version) {
  const cfg = {
    $schema: `https://biomejs.dev/schemas/${version}/schema.json`,
  }
  if (NESTED) cfg.root = false

  cfg.vcs = { enabled: true, clientKind: 'git', useIgnoreFile: true }
  cfg.files = { includes: ['**', ...ignoresFor(STACK)] }

  cfg.formatter = {
    enabled: true,
    indentStyle: 'space',
    indentWidth: 2,
    lineWidth: LINE_WIDTH,
    lineEnding: 'lf',
  }

  // 1:1 translation of the Giehl standard's prettier.config.mjs.
  cfg.javascript = {
    formatter: {
      quoteStyle: 'single',        // singleQuote: true
      jsxQuoteStyle: 'single',     // jsxSingleQuote: true
      quoteProperties: 'asNeeded', // quoteProps: 'as-needed'
      semicolons: 'asNeeded',      // semi: false
      trailingCommas: 'es5',       // trailingComma: 'es5'
      arrowParentheses: 'always',  // arrowParens: 'always'
      bracketSpacing: true,        // bracketSpacing: true
      bracketSameLine: true,       // bracketSameLine: true
    },
  }
  if (FRAMEWORK === 'nest') {
    // Without this Biome's parser REJECTS @Inject()/@InjectRepository() on
    // constructor parameters — the files are never even analyzed.
    cfg.javascript.parser = { unsafeParameterDecoratorsEnabled: true }
  }

  cfg.json = { formatter: { enabled: true, indentWidth: 2 } }
  if (IS_FRONT) cfg.css = { formatter: { enabled: true }, linter: { enabled: true } }

  // organizeImports replacing eslint-plugin-simple-import-sort:
  // builtins → externals → alias (@/) → relative → styles, separated by a blank line.
  cfg.assist = {
    enabled: true,
    actions: {
      source: {
        organizeImports: {
          level: 'on',
          options: {
            groups: [
              [':BUN:', ':NODE:'],
              ':BLANK_LINE:',
              [':PACKAGE:', ':PACKAGE_WITH_PROTOCOL:', ':URL:'],
              ':BLANK_LINE:',
              ':ALIAS:',
              ':BLANK_LINE:',
              ':PATH:',
              ':BLANK_LINE:',
              ':STYLE:',
            ],
          },
        },
      },
    },
  }

  const domains = {}
  if (STACK === 'next') domains.next = 'recommended'
  if (HAS_REACT) domains.react = 'recommended'
  if (HAS_TAILWIND) domains.tailwind = 'recommended'
  if (dep('vitest') || dep('jest')) domains.test = 'recommended'
  if (dep('drizzle-orm')) domains.drizzle = 'recommended'

  cfg.linter = { enabled: true, rules: { preset: 'recommended' } }
  if (Object.keys(domains).length) cfg.linter.domains = domains

  if (HAS_TAILWIND) {
    cfg.linter.rules.nursery = {
      useSortedClasses: {
        level: 'warn',
        // fix "safe" makes `biome check --write` sort the classes on its own,
        // reproducing prettier-plugin-tailwindcss (the default is unsafe = not applied).
        fix: 'safe',
        options: { functions: ['cn', 'clsx', 'cva', 'tw', 'twMerge', 'twJoin'] },
      },
    }
  }

  if (FRAMEWORK === 'nest') {
    // useImportType would convert imports used by DI into `import type`, erasing
    // the metadata reflect-metadata needs at runtime → DI breaks.
    cfg.linter.rules.style = { useImportType: 'off' }
    // Parameter properties (`private readonly repo: Repo`) are read as unused
    // parameters. Here disabling is the right way out: the name becomes `this.repo`,
    // so the `_param` convention (which solves Express/Fastify) does not apply.
    cfg.linter.rules.correctness = { noUnusedFunctionParameters: 'off' }
  }
  // Express and Fastify do NOT need noUnusedFunctionParameters off: the arity-4
  // error middleware and the plugin `opts` pass clean by prefixing with `_`
  // (`_req`, `_next`, `_opts`). See references/stacks.md.

  cfg.overrides = [
    {
      includes: ['**/*.config.{js,ts,mjs,cjs}', '**/*.d.ts'],
      linter: { rules: { correctness: { noUndeclaredDependencies: 'off' } } },
    },
    // A third-party package's ambient declaration uses `any` on purpose: there is
    // no contract of ours to preserve there. It is the same override the Giehl
    // standard's eslint.config.mjs already carried for **/*.d.ts.
    {
      includes: ['**/*.d.ts'],
      linter: { rules: { suspicious: { noExplicitAny: 'off' } } },
    },
  ]

  return cfg
}

// ---------------------------------------------------------------- other files

const EDITORCONFIG = `root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[*.{yml,yaml}]
indent_size = 2

[Makefile]
indent_style = tab
`

function nvmrcContent() {
  const fromFlag = flag('node-version', null)
  if (fromFlag && fromFlag !== true) {
    return `${String(fromFlag).startsWith('v') ? fromFlag : `v${fromFlag}`}\n`
  }
  const existing = path.join(DIR, '.nvmrc')
  if (fs.existsSync(existing)) return fs.readFileSync(existing, 'utf8')
  return `${process.version}\n`
}

const VSCODE_SETTINGS = {
  'editor.defaultFormatter': 'biomejs.biome',
  'editor.formatOnSave': true,
  'editor.codeActionsOnSave': {
    'source.fixAll.biome': 'explicit',
    'source.organizeImports.biome': 'explicit',
  },
  '[typescript]': { 'editor.defaultFormatter': 'biomejs.biome' },
  '[typescriptreact]': { 'editor.defaultFormatter': 'biomejs.biome' },
  '[javascript]': { 'editor.defaultFormatter': 'biomejs.biome' },
  '[json]': { 'editor.defaultFormatter': 'biomejs.biome' },
  '[jsonc]': { 'editor.defaultFormatter': 'biomejs.biome' },
  '[css]': { 'editor.defaultFormatter': 'biomejs.biome' },
}

const LEGACY_FILES = [
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml',
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
  '.eslintignore',
  '.prettierrc', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.json', '.prettierrc.yml',
  'prettier.config.js', 'prettier.config.mjs', 'prettier.config.cjs', '.prettierignore',
]

const LEGACY_DEPS = [
  '@eslint/js', '@eslint/eslintrc',
  'eslint', 'eslint-config-next', 'eslint-config-prettier', 'eslint-plugin-prettier',
  'eslint-plugin-simple-import-sort', 'eslint-plugin-import', 'eslint-plugin-react',
  'eslint-plugin-react-hooks', 'eslint-plugin-jsx-a11y', 'eslint-plugin-unused-imports',
  '@typescript-eslint/eslint-plugin', '@typescript-eslint/parser', 'typescript-eslint',
  'prettier', 'prettier-plugin-tailwindcss',
]

// ---------------------------------------------------------------- run

log(`▸ project    : ${DIR}`)
log(`▸ stack      : ${STACK}${FRAMEWORK !== 'none' ? ` (${FRAMEWORK})` : ''}`)
log(`▸ pkg manager: ${PM}${HAS_TAILWIND ? ' · tailwind' : ''}${NESTED ? ' · nested' : ''}`)
if (DRY) log('▸ mode       : DRY RUN (nothing will be written)\n')

const version = installBiome()

log('\n▸ writing files')
write('biome.json', json(buildConfig(version)))
// .editorconfig/.nvmrc/.vscode describe the whole repository. In a monorepo
// package they belong at the root — duplicating them here creates competing
// sources of truth (a nested `root = true` cuts off the .editorconfig above).
if (!NESTED) {
  write('.editorconfig', EDITORCONFIG)
  write('.nvmrc', nvmrcContent())
  write('.vscode/settings.json', json(VSCODE_SETTINGS))
  write('.vscode/extensions.json', json({ recommendations: ['biomejs.biome'] }))
} else {
  log('  · .editorconfig/.nvmrc/.vscode skipped (--nested: run it at the monorepo root)')
}

// scripts
// Reread from disk, do NOT reuse the `pkg` read at the start: installBiome()
// above has just written @biomejs/biome into devDependencies. Starting from the
// stale copy erases that entry — the setup finishes "successfully" without Biome.
const nextPkg = DRY ? JSON.parse(JSON.stringify(pkg)) : JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
nextPkg.scripts = nextPkg.scripts ?? {}
for (const k of Object.keys(nextPkg.scripts)) {
  if (/^lint:(prettier|eslint)/.test(k)) delete nextPkg.scripts[k]
}
Object.assign(nextPkg.scripts, {
  lint: 'biome check .',
  'lint:fix': 'biome check --write .',
  format: 'biome format --write .',
  'format:check': 'biome format .',
  'lint:ci': 'biome ci .',
})

if (!has('no-remove-legacy')) {
  for (const d of LEGACY_DEPS) {
    delete nextPkg.dependencies?.[d]
    delete nextPkg.devDependencies?.[d]
  }
}
write('package.json', json(nextPkg))

// An ESLint config is code, not data: there is no safe way to translate the
// project's overrides. What is doable — and avoids silently losing a rule — is
// listing the ones explicitly turned off before deleting the file.
const disabledBefore = []
if (!has('no-remove-legacy')) {
  for (const f of LEGACY_FILES.filter((n) => n.includes('eslint'))) {
    const abs = path.join(DIR, f)
    if (!fs.existsSync(abs)) continue
    const src = fs.readFileSync(abs, 'utf8')
    for (const [, rule] of src.matchAll(/['"]([\w@/-]+)['"]\s*:\s*['"]off['"]/g)) {
      if (!disabledBefore.includes(rule)) disabledBefore.push(rule)
    }
  }

  log('\n▸ removing legacy configs')
  for (const f of LEGACY_FILES) remove(f)
}

// lint-staged is part of the setup, but only when the project already uses it —
// this script does not add the dependency, it only repoints the config to Biome.
if (fs.existsSync(path.join(DIR, '.lintstagedrc.json')) || pkg['lint-staged']) {
  log('\n▸ lint-staged')
  // `*` (not `*.{ts,tsx}`) because Biome also handles JSON/CSS and decides on its
  // own what it knows how to process; --no-errors-on-unmatched keeps the hook from
  // failing on a commit that only has ignored files (.md, .png).
  write('.lintstagedrc.json', json({ '*': ['biome check --write --no-errors-on-unmatched'] }))
}

// The JSON above comes out of JSON.stringify, which breaks every array across
// several lines; Biome's formatter collapses a short array onto a single line.
// Without this pass, the `biome check` this very script tells you to run next
// flags the files it just generated. Letting Biome format is more reliable than
// imitating its rules here — and follows version changes for free.
if (!DRY) {
  const bin = path.join(DIR, 'node_modules/.bin/biome')
  const generated = [
    'biome.json',
    '.vscode/settings.json',
    '.vscode/extensions.json',
    '.lintstagedrc.json',
    'package.json',
  ].filter((f) => changes.includes(f) && fs.existsSync(path.join(DIR, f)))

  if (generated.length && fs.existsSync(bin)) {
    try {
      execSync(`${JSON.stringify(bin)} format --write ${generated.join(' ')}`, {
        cwd: DIR,
        stdio: 'ignore',
      })
    } catch {
      // Formatting what we generated is polish, not a prerequisite: if it fails,
      // the setup is still valid and the user's `biome check --write` fixes it.
      log('  · could not format the generated files (run `biome check --write .`)')
    }
  }
}

// husky and CI are OUT of scope: we neither install nor edit them. But if one of
// them calls the eslint/prettier we just removed, it breaks on the next commit —
// warning is mandatory, configuring is not.
const stale = []
const huskyDir = path.join(DIR, '.husky')
if (fs.existsSync(huskyDir)) {
  for (const hook of fs.readdirSync(huskyDir)) {
    const hookPath = path.join(huskyDir, hook)
    if (!fs.statSync(hookPath).isFile()) continue
    if (/eslint|prettier/.test(fs.readFileSync(hookPath, 'utf8'))) stale.push(`.husky/${hook}`)
  }
}

// README/CLAUDE.md usually list the package.json scripts in a table. They break
// nothing, but they start lying about how lint is run — and it is the kind of
// documentation nobody revisits until it misleads someone.
for (const doc of ['README.md', 'README.en-US.md', 'CLAUDE.md', 'AGENTS.md', 'CONTRIBUTING.md']) {
  const p = path.join(DIR, doc)
  if (!fs.existsSync(p)) continue
  if (/eslint|prettier/i.test(fs.readFileSync(p, 'utf8'))) stale.push(doc)
}

const ciDir = path.join(DIR, '.github/workflows')
if (fs.existsSync(ciDir)) {
  for (const wf of fs.readdirSync(ciDir)) {
    const p = path.join(ciDir, wf)
    if (!fs.statSync(p).isFile()) continue
    if (/eslint|prettier|lint:(eslint|prettier)/.test(fs.readFileSync(p, 'utf8'))) {
      stale.push(`.github/workflows/${wf}`)
    }
  }
}

log(`\n✓ ${changes.length} change(s). Biome ${version}.`)

if (stale.length) {
  log('\n⚠ Out of scope for this setup, but now pointing at a removed tool:')
  for (const s of stale) log(`    ${s}`)
  log('  Switching to `biome check` (or `biome ci`) is your call — nothing was changed there.')
}

if (disabledBefore.length) {
  log('\n⚠ The removed ESLint had these rules turned off — check whether the Biome')
  log('  equivalent needs the same treatment (the script only translates the Giehl ones):')
  for (const r of disabledBefore) log(`    ${r}`)
}

log('\nNext steps:')
log(`  ${PM} install`)
log('  npx biome check --write .    # applies formatting + imports across the project')
log('  npx biome check .            # must come out clean')
if (!DRY && changes.length) {
  log('\nReview the diff before committing: git diff --stat')
}
