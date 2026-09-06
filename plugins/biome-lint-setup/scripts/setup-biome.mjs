#!/usr/bin/env node
/**
 * setup-biome.mjs — aplica o padrão de lint/format Biome (Giehl) num projeto.
 *
 * Uso:
 *   node setup-biome.mjs [--dir .] [--stack auto] [--framework auto] [--pm auto]
 *                        [--line-width 80] [--node-version vX.Y.Z]
 *                        [--nested] [--no-install] [--no-remove-legacy] [--dry-run]
 *
 * --stack      auto | next | vite | node | react   (auto = detecta pelas deps)
 * --framework  auto | nest | express | fastify | hono | none  (só importa p/ stack=node)
 * --nested     gera "root": false — use em pacotes de dentro de um monorepo
 * --dry-run    mostra o que faria, sem escrever nada
 *
 * Nunca fixa versão do Biome: instala sempre @biomejs/biome@latest e usa a
 * versão resultante no $schema.
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

function write(rel, content) {
  const abs = path.join(DIR, rel)
  const exists = fs.existsSync(abs)
  const prev = exists ? fs.readFileSync(abs, 'utf8') : null
  if (prev === content) {
    log(`  = ${rel} (já correto)`)
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

// ---------------------------------------------------------------- contexto

const pkgPath = path.join(DIR, 'package.json')
if (!fs.existsSync(pkgPath)) {
  console.error(`✗ package.json não encontrado em ${DIR}`)
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
  log(`\n▸ instalando Biome (${PM})`)
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
  const base = [
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/build/**',
    '!**/coverage/**',
    '!**/*.min.js',
  ]
  if (stack === 'next') base.push('!**/.next/**', '!**/out/**', '!**/next-env.d.ts')
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

  // Tradução 1:1 do prettier.config.mjs do padrão Giehl.
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
    // Sem isto o parser do Biome REJEITA @Inject()/@InjectRepository() em
    // parâmetros de constructor — os arquivos nem chegam a ser analisados.
    cfg.javascript.parser = { unsafeParameterDecoratorsEnabled: true }
  }

  cfg.json = { formatter: { enabled: true, indentWidth: 2 } }
  if (IS_FRONT) cfg.css = { formatter: { enabled: true }, linter: { enabled: true } }

  // organizeImports substituindo eslint-plugin-simple-import-sort:
  // builtins → externos → alias (@/) → relativos → estilos, separados por linha em branco.
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
        // fix "safe" faz `biome check --write` ordenar as classes sozinho,
        // reproduzindo o prettier-plugin-tailwindcss (default é unsafe = não aplica).
        fix: 'safe',
        options: { functions: ['cn', 'clsx', 'cva', 'tw', 'twMerge', 'twJoin'] },
      },
    }
  }

  if (FRAMEWORK === 'nest') {
    // useImportType converteria imports usados em DI para `import type`, apagando
    // os metadados que o reflect-metadata precisa em runtime → DI quebra.
    cfg.linter.rules.style = { useImportType: 'off' }
    // Parameter properties (`private readonly repo: Repo`) são lidas como parâmetros
    // não usados. Aqui desligar é a saída certa: o nome vira `this.repo`, então a
    // convenção `_param` (que resolve Express/Fastify) não é aplicável.
    cfg.linter.rules.correctness = { noUnusedFunctionParameters: 'off' }
  }
  // Express e Fastify NÃO precisam desligar noUnusedFunctionParameters: o error
  // middleware de aridade 4 e o `opts` de plugin passam limpo prefixando com `_`
  // (`_req`, `_next`, `_opts`). Ver references/stacks.md.

  cfg.overrides = [
    {
      includes: ['**/*.config.{js,ts,mjs,cjs}', '**/*.d.ts'],
      linter: { rules: { correctness: { noUndeclaredDependencies: 'off' } } },
    },
  ]

  return cfg
}

// ---------------------------------------------------------------- outros arquivos

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
  'eslint', 'eslint-config-next', 'eslint-config-prettier', 'eslint-plugin-prettier',
  'eslint-plugin-simple-import-sort', 'eslint-plugin-import', 'eslint-plugin-react',
  'eslint-plugin-react-hooks', 'eslint-plugin-jsx-a11y', 'eslint-plugin-unused-imports',
  '@typescript-eslint/eslint-plugin', '@typescript-eslint/parser', 'typescript-eslint',
  'prettier', 'prettier-plugin-tailwindcss',
]

// ---------------------------------------------------------------- run

log(`▸ projeto  : ${DIR}`)
log(`▸ stack    : ${STACK}${FRAMEWORK !== 'none' ? ` (${FRAMEWORK})` : ''}`)
log(`▸ gerenciador: ${PM}${HAS_TAILWIND ? ' · tailwind' : ''}${NESTED ? ' · nested' : ''}`)
if (DRY) log('▸ modo     : DRY RUN (nada será escrito)\n')

const version = installBiome()

log('\n▸ escrevendo arquivos')
write('biome.json', json(buildConfig(version)))
// .editorconfig/.nvmrc/.vscode descrevem o repositório inteiro. Num pacote de
// monorepo eles pertencem à raiz — duplicá-los aqui cria fontes concorrentes
// de verdade (um `root = true` aninhado corta a herança do .editorconfig de cima).
if (!NESTED) {
  write('.editorconfig', EDITORCONFIG)
  write('.nvmrc', nvmrcContent())
  write('.vscode/settings.json', json(VSCODE_SETTINGS))
  write('.vscode/extensions.json', json({ recommendations: ['biomejs.biome'] }))
} else {
  log('  · .editorconfig/.nvmrc/.vscode pulados (--nested: rode na raiz do monorepo)')
}

// scripts
const nextPkg = JSON.parse(JSON.stringify(pkg))
nextPkg.scripts = nextPkg.scripts ?? {}
for (const k of Object.keys(nextPkg.scripts)) {
  if (/^lint:(prettier|eslint)/.test(k)) delete nextPkg.scripts[k]
}
Object.assign(nextPkg.scripts, {
  lint: 'biome check .',
  'lint:fix': 'biome check --write .',
  format: 'biome format --write .',
  'lint:ci': 'biome ci .',
})

if (!has('no-remove-legacy')) {
  for (const d of LEGACY_DEPS) {
    delete nextPkg.dependencies?.[d]
    delete nextPkg.devDependencies?.[d]
  }
}
write('package.json', json(nextPkg))

if (!has('no-remove-legacy')) {
  log('\n▸ removendo configs legadas')
  for (const f of LEGACY_FILES) remove(f)
}

// lint-staged faz parte do setup, mas só quando o projeto já o usa — este script
// não adiciona a dependência, apenas reaponta a config para o Biome.
if (fs.existsSync(path.join(DIR, '.lintstagedrc.json')) || pkg['lint-staged']) {
  log('\n▸ lint-staged')
  // `*` (e não `*.{ts,tsx}`) porque o Biome também cuida de JSON/CSS e decide
  // sozinho o que sabe processar; --no-errors-on-unmatched evita que o hook
  // falhe num commit que só tem arquivo ignorado (.md, .png).
  write('.lintstagedrc.json', json({ '*': ['biome check --write --no-errors-on-unmatched'] }))
}

// husky e CI ficam FORA do escopo: não instalamos nem editamos. Mas se algum
// deles chama o eslint/prettier que acabamos de remover, quebra no próximo
// commit — avisar é obrigação, configurar não é.
const stale = []
const huskyDir = path.join(DIR, '.husky')
if (fs.existsSync(huskyDir)) {
  for (const hook of fs.readdirSync(huskyDir)) {
    const hookPath = path.join(huskyDir, hook)
    if (!fs.statSync(hookPath).isFile()) continue
    if (/eslint|prettier/.test(fs.readFileSync(hookPath, 'utf8'))) stale.push(`.husky/${hook}`)
  }
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

log(`\n✓ ${changes.length} alteração(ões). Biome ${version}.`)

if (stale.length) {
  log('\n⚠ Fora do escopo deste setup, mas passaram a apontar para ferramenta removida:')
  for (const s of stale) log(`    ${s}`)
  log('  Trocar por `biome check` (ou `biome ci`) é decisão sua — nada foi alterado aí.')
}

log('\nPróximos passos:')
log(`  ${PM} install`)
log('  npx biome check --write .    # aplica formatação + imports em todo o projeto')
log('  npx biome check .            # deve sair limpo')
if (!DRY && changes.length) {
  log('\nRevise o diff antes de commitar: git diff --stat')
}
