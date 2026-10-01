#!/usr/bin/env node
/**
 * setup-biome.mjs — applies the Biome lint/format standard (Giehl) to a project.
 *
 * Usage:
 *   node setup-biome.mjs [--dir .] [--stack auto] [--framework auto] [--pm auto]
 *                        [--line-width 80] [--node-pin auto] [--node-version lts]
 *                        [--nested] [--no-install] [--no-remove-legacy] [--dry-run]
 *
 * --stack         auto | next | vite | node | react   (auto = detected from the deps)
 * --framework     auto | nest | express | fastify | hono | none  (only matters for stack=node)
 * --nested        package inside a monorepo: Biome is NOT installed here (it lives at the
 *                 root) and biome.json is a thin `extends` of the root config
 * --node-pin      auto | mise | nvm | none — how the Node version is pinned at the repo
 *                 root (auto = mise when a mise.toml exists, nvm/.nvmrc otherwise)
 * --node-version  lts | X.Y.Z — default: the version already pinned, else the latest LTS
 * --dry-run       shows what it would do, without writing anything
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

function findUp(startDir, test) {
  let dir = startDir
  for (;;) {
    if (test(dir)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function readPkg(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

// The monorepo root: the nearest directory (DIR included) that declares a workspace.
// A package inside it has no lockfile of its own, so everything about the package
// manager has to be read from here — looking only at DIR falls back to `npm`.
const WORKSPACE_ROOT = findUp(
  DIR,
  (d) => fs.existsSync(path.join(d, 'pnpm-workspace.yaml')) || Boolean(readPkg(d)?.workspaces)
)

function detectPm() {
  const fromFlag = flag('pm', 'auto')
  if (fromFlag !== 'auto' && fromFlag !== true) return fromFlag
  const dirs = [DIR, WORKSPACE_ROOT].filter((d, i, all) => d && all.indexOf(d) === i)
  const exists = (d, f) => fs.existsSync(path.join(d, f))
  for (const d of dirs) {
    if (exists(d, 'pnpm-lock.yaml')) return 'pnpm'
    if (exists(d, 'bun.lockb') || exists(d, 'bun.lock')) return 'bun'
    if (exists(d, 'yarn.lock')) return 'yarn'
  }
  for (const d of dirs) {
    const declared = readPkg(d)?.packageManager
    if (declared) return String(declared).split('@')[0]
  }
  if (WORKSPACE_ROOT && fs.existsSync(path.join(WORKSPACE_ROOT, 'pnpm-workspace.yaml'))) return 'pnpm'
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
  if (NESTED) {
    // Biome is installed once, at the monorepo root, and every package resolves that
    // binary. Installing it again inside a package adds a second copy to its
    // package.json that nobody asked for.
    log('\n▸ skipping the Biome install (--nested: it lives at the monorepo root)')
    const version = currentBiomeVersion()
    if (!version) log('  ⚠ no @biomejs/biome found above this package — run the setup at the root first')
    return version ?? 'latest'
  }
  if (has('no-install')) return currentBiomeVersion() ?? 'latest'
  // At a pnpm workspace root, `pnpm add` refuses to run without -w
  // (ERR_PNPM_ADDING_TO_ROOT) and the whole setup aborts before writing anything.
  const pnpmAdd = WORKSPACE_ROOT === DIR ? 'pnpm add -D -w' : 'pnpm add -D'
  const cmd = {
    pnpm: `${pnpmAdd} @biomejs/biome@latest`,
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
    // Walk up: in a monorepo package the binary is hoisted to the root node_modules.
    const installedAt = findUp(DIR, (d) =>
      fs.existsSync(path.join(d, 'node_modules/@biomejs/biome/package.json'))
    )
    if (installedAt) {
      return JSON.parse(
        fs.readFileSync(path.join(installedAt, 'node_modules/@biomejs/biome/package.json'), 'utf8')
      ).version
    }
    return execSync('npm view @biomejs/biome version', { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- biome.json

// A folder is ignored by its bare name (`!**/dist`), not by `!**/dist/**` —
// Biome's own useBiomeIgnoreFolder rule rejects the second form, and the config
// we generate has to pass the `biome check` this script tells you to run.
//
// Generated files (`*.generated.ts`, TanStack Router's `routeTree.gen.ts`) are in the
// base list on purpose, whatever the stack: the ignores live in the ROOT config, and
// a nested config cannot add one — its `files.includes` REPLACES the root's instead
// of merging with it (verified), which would silently re-check dist/build/etc.
const BASE_IGNORES = [
  '!**/node_modules',
  '!**/dist',
  '!**/build',
  '!**/coverage',
  '!**/*.min.js',
  '!**/*.generated.ts',
  '!**/routeTree.gen.ts',
]

const stackIgnores = (stack) =>
  stack === 'next' ? ['!**/.next', '!**/out', '!**/next-env.d.ts'] : []

const ignoresFor = (stack) => [...BASE_IGNORES, ...stackIgnores(stack)]

function stackDomains() {
  const domains = {}
  if (STACK === 'next') domains.next = 'recommended'
  if (HAS_REACT) domains.react = 'recommended'
  if (HAS_TAILWIND) domains.tailwind = 'recommended'
  if (dep('vitest') || dep('jest')) domains.test = 'recommended'
  if (dep('drizzle-orm')) domains.drizzle = 'recommended'
  return domains
}

// The linter rules that depend on the stack, on top of `preset: recommended`.
function stackRules() {
  const rules = {}

  if (HAS_TAILWIND) {
    rules.nursery = {
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
    rules.style = { useImportType: 'off' }
    // Parameter properties (`private readonly repo: Repo`) are read as unused
    // parameters. Here disabling is the right way out: the name becomes `this.repo`,
    // so the `_param` convention (which solves Express/Fastify) does not apply.
    rules.correctness = { noUnusedFunctionParameters: 'off' }
  }
  // Express and Fastify do NOT need noUnusedFunctionParameters off: the arity-4
  // error middleware and the plugin `opts` pass clean by prefixing with `_`
  // (`_req`, `_next`, `_opts`). See references/stacks.md.

  return rules
}

// Package inside a monorepo: a thin config that extends the root one and declares only
// what differs. The full config used to be copied here, which let two copies of the
// formatting rules drift apart — and a nested config replaces every section it
// declares, it does not inherit it.
function buildNestedConfig(version, extendsPath) {
  const cfg = {
    $schema: `https://biomejs.dev/schemas/${version}/schema.json`,
    root: false,
    extends: [extendsPath],
  }

  // Only stacks that ignore something extra need `files` here, and since it replaces
  // the root's list, the base ignores have to be repeated.
  const extras = stackIgnores(STACK)
  if (extras.length) cfg.files = { includes: ['**', ...BASE_IGNORES, ...extras] }

  if (FRAMEWORK === 'nest') cfg.javascript = { parser: { unsafeParameterDecoratorsEnabled: true } }
  if (IS_FRONT) cfg.css = { formatter: { enabled: true }, linter: { enabled: true } }

  const domains = stackDomains()
  const rules = stackRules()
  if (Object.keys(domains).length || Object.keys(rules).length) {
    cfg.linter = {}
    if (Object.keys(rules).length) cfg.linter.rules = rules
    if (Object.keys(domains).length) cfg.linter.domains = domains
  }

  return cfg
}

const hasPackageDelta = (cfg) =>
  Object.keys(cfg).some((k) => !['$schema', 'root', 'extends'].includes(k))

// The nearest biome.json above DIR: the config a nested package extends.
function findRootBiomeConfig() {
  const dir = findUp(path.dirname(DIR), (d) => fs.existsSync(path.join(d, 'biome.json')))
  return dir ? path.join(dir, 'biome.json') : null
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

  const domains = stackDomains()
  cfg.linter = { enabled: true, rules: { preset: 'recommended', ...stackRules() } }
  if (Object.keys(domains).length) cfg.linter.domains = domains

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

// ---- Node version pin
//
// mise and nvm are two ways to pin the same thing, and a repo must have ONE source of
// truth. `auto` follows what the repo already uses: a mise.toml means mise, otherwise
// the original behavior (.nvmrc) stays.

const MISE_FILES = ['mise.toml', '.mise.toml']

function detectNodePin() {
  const fromFlag = flag('node-pin', 'auto')
  if (fromFlag !== 'auto' && fromFlag !== true) {
    if (!['mise', 'nvm', 'none'].includes(fromFlag)) {
      console.error(`✗ --node-pin must be auto, mise, nvm or none (got "${fromFlag}")`)
      process.exit(1)
    }
    return fromFlag
  }
  return MISE_FILES.some((f) => fs.existsSync(path.join(DIR, f))) ? 'mise' : 'nvm'
}

const stripV = (v) => String(v).trim().replace(/^v/, '')

function readPinnedNodeVersion() {
  const nvmrc = path.join(DIR, '.nvmrc')
  if (fs.existsSync(nvmrc)) return stripV(fs.readFileSync(nvmrc, 'utf8'))
  for (const f of MISE_FILES) {
    const p = path.join(DIR, f)
    if (!fs.existsSync(p)) continue
    const m = fs.readFileSync(p, 'utf8').match(/^\s*node\s*=\s*["']([^"']+)["']/m)
    if (m) return stripV(m[1])
  }
  return null
}

// The latest LTS, not the Node that happens to be running this script: that one is
// whatever the machine has installed, and it was not the LTS the first time around.
async function latestNodeLts() {
  try {
    const res = await fetch('https://nodejs.org/dist/index.json', {
      signal: AbortSignal.timeout(8000),
    })
    const releases = await res.json()
    const lts = releases.find((r) => r.lts)
    return lts ? stripV(lts.version) : null
  } catch {
    return null
  }
}

// Precedence: explicit --node-version X.Y.Z > what the repo already pins > latest LTS
// (also what `--node-version lts` forces) > the running Node, as a last resort.
async function resolveNodeVersion() {
  const fromFlag = flag('node-version', null)
  if (fromFlag && fromFlag !== true && fromFlag !== 'lts') return stripV(fromFlag)
  if (!fromFlag) {
    const pinned = readPinnedNodeVersion()
    if (pinned) return pinned
  }
  return (await latestNodeLts()) ?? stripV(process.version)
}

const NODE_PIN = NESTED ? 'none' : detectNodePin()
const NODE_VERSION = NODE_PIN === 'none' ? null : await resolveNodeVersion()

function writeNodePin() {
  if (NODE_PIN === 'nvm') {
    const nvmrc = path.join(DIR, '.nvmrc')
    // Keep an existing file byte for byte (a `v` prefix and all) unless the version
    // was forced: rewriting it on every run would break the idempotence.
    const keep = fs.existsSync(nvmrc) && !flag('node-version', null)
    write('.nvmrc', keep ? fs.readFileSync(nvmrc, 'utf8') : `${NODE_VERSION}\n`)
    return
  }

  // mise
  const existing = MISE_FILES.find((f) => fs.existsSync(path.join(DIR, f)))
  if (!existing) {
    write('mise.toml', `[tools]\nnode = "${NODE_VERSION}"\n`)
  } else if (/^\s*node\s*=/m.test(fs.readFileSync(path.join(DIR, existing), 'utf8'))) {
    log(`  = ${existing} (already pins node)`)
  } else {
    log(`  ⚠ ${existing} exists without a node pin — add under [tools]: node = "${NODE_VERSION}"`)
  }

  // mise replaces nvm only when asked to; with `auto`, a leftover .nvmrc is a second
  // source of truth the user should resolve, not something to delete behind their back.
  if (fs.existsSync(path.join(DIR, '.nvmrc'))) {
    if (flag('node-pin', 'auto') === 'mise') remove('.nvmrc')
    else log('  ⚠ .nvmrc and mise both pin Node — keep one (or rerun with --node-pin mise)')
  }
}

// ---- .vscode
//
// Workspace settings beat the user's own settings, and that is the whole point of
// writing them here: someone with ESLint/Prettier installed (or a per-language
// `[typescript]: { defaultFormatter: prettier }` in their user settings) would
// otherwise format with the wrong tool and fight the Biome config on every save.
// That is why Biome is set per language and not only as the global default — a
// language-specific user setting beats a global workspace one — and why the other two
// tools are switched off for the workspace.
//
// ESLint/Prettier are only disabled when the setup is replacing them. With
// --no-remove-legacy the project still uses them, and switching them off in the
// editor would break the workflow that is still in place.

const VSCODE_LANGUAGES = [
  'typescript',
  'typescriptreact',
  'javascript',
  'javascriptreact',
  'json',
  'jsonc',
  'css',
]

const REPLACING_LEGACY = !has('no-remove-legacy')
const UNWANTED_EXTENSIONS = ['dbaeumer.vscode-eslint', 'esbenp.prettier-vscode']

function vscodeSettings() {
  const settings = {
    'editor.defaultFormatter': 'biomejs.biome',
    'editor.formatOnSave': true,
    'editor.codeActionsOnSave': {
      'source.fixAll.biome': 'explicit',
      'source.organizeImports.biome': 'explicit',
      ...(REPLACING_LEGACY && { 'source.fixAll.eslint': 'never' }),
    },
  }
  if (REPLACING_LEGACY) {
    settings['eslint.enable'] = false
    settings['prettier.enable'] = false
  }
  for (const lang of VSCODE_LANGUAGES) {
    settings[`[${lang}]`] = { 'editor.defaultFormatter': 'biomejs.biome' }
  }
  return settings
}

function vscodeExtensions() {
  return {
    recommendations: ['biomejs.biome'],
    ...(REPLACING_LEGACY && { unwantedRecommendations: UNWANTED_EXTENSIONS }),
  }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// Our keys win, everything else the user already had is kept.
function deepMerge(base, patch) {
  const out = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(base?.[k]) ? deepMerge(base[k], v) : v
  }
  return out
}

function mergeExtensions(current, patch) {
  const unwanted = [...new Set([...(current.unwantedRecommendations ?? []), ...(patch.unwantedRecommendations ?? [])])]
  // An extension cannot be recommended and unwanted at once: the unwanted list wins.
  const recommendations = [...new Set([...(current.recommendations ?? []), ...patch.recommendations])].filter(
    (e) => !unwanted.includes(e)
  )
  const merged = { ...current, recommendations }
  if (unwanted.length) merged.unwantedRecommendations = unwanted
  return merged
}

// The workspace file usually holds settings the project already depends on, so it is
// merged, never overwritten. VS Code reads these files as JSONC (comments allowed) but
// JSON.parse does not: rather than destroy the comments, leave the file alone and say
// exactly what to add.
function writeMergedJson(rel, patch, merge = deepMerge) {
  const abs = path.join(DIR, rel)
  if (!fs.existsSync(abs)) return write(rel, json(patch))

  let current
  try {
    current = JSON.parse(fs.readFileSync(abs, 'utf8'))
  } catch {
    log(`  ⚠ ${rel} has comments or trailing commas — left untouched. Add these by hand:`)
    for (const line of json(patch).trimEnd().split('\n')) log(`      ${line}`)
    return
  }
  write(rel, json(merge(current, patch)))
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
if (NESTED) {
  const rootConfig = findRootBiomeConfig()
  if (rootConfig) {
    const rel = path.relative(DIR, rootConfig).split(path.sep).join('/')
    const nested = buildNestedConfig(version, rel)
    if (hasPackageDelta(nested)) {
      write('biome.json', json(nested))
    } else {
      // Nothing differs from the root: no file at all is the cleanest config. Biome
      // run from inside the package still finds and applies the root one (verified).
      log('  · biome.json skipped (this package inherits the root config as is)')
    }
  } else {
    log('  ⚠ no biome.json found above this package — writing a self-contained one.')
    log('    Run the setup at the monorepo root first, so the packages can extend it.')
    write('biome.json', json(buildConfig(version)))
  }
} else {
  write('biome.json', json(buildConfig(version)))
}
// .editorconfig/Node pin/.vscode describe the whole repository. In a monorepo
// package they belong at the root — duplicating them here creates competing
// sources of truth (a nested `root = true` cuts off the .editorconfig above).
if (!NESTED) {
  write('.editorconfig', EDITORCONFIG)
  if (NODE_PIN !== 'none') writeNodePin()
  writeMergedJson('.vscode/settings.json', vscodeSettings())
  writeMergedJson('.vscode/extensions.json', vscodeExtensions(), mergeExtensions)
} else {
  log('  · .editorconfig/Node pin/.vscode skipped (--nested: run it at the monorepo root)')
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

// engines.node declares the same version the pin file does, so the package manager
// warns when someone runs the project on another Node. Only at the repo root, and
// never over a range the project already chose.
if (NODE_VERSION && !nextPkg.engines?.node) {
  nextPkg.engines = { ...nextPkg.engines, node: `^${NODE_VERSION}` }
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
  // Walk up: inside a monorepo package the binary lives in the root node_modules.
  const binDir = findUp(DIR, (d) => fs.existsSync(path.join(d, 'node_modules/.bin/biome')))
  const bin = binDir ? path.join(binDir, 'node_modules/.bin/biome') : path.join(DIR, 'node_modules/.bin/biome')
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
