---
name: biome-lint-setup
description: Use SEMPRE que for configurar lint/formatação num projeto JS/TS — seja num projeto novo ("configura o lint", "setup inicial do projeto", "padroniza a formatação") ou migrando um existente ("migra de ESLint pra Biome", "troca o Prettier por Biome", "cria um biome.json"). Dispare também quando o pedido citar apenas peças do conjunto — `.editorconfig`, `.nvmrc`, ordenação de imports (simple-import-sort), ordenação de classes do Tailwind, `lint-staged`, ou formatação no save do VSCode — porque no padrão Giehl essas peças são configuradas juntas. Cobre Next.js full-stack, Next.js + API Node separada, Vite/SPA frontend-only, e backend Node (Hono, Fastify, Express, NestJS), inclusive monorepos. Use mesmo que o usuário não diga "Biome": Biome é o padrão para lint/format nestes projetos. Escopo é lint/format — não instala nem configura husky, CI ou deploy.
---

# Setup de lint/format com Biome (padrão Giehl)

Substitui a stack `ESLint + Prettier + eslint-plugin-simple-import-sort + prettier-plugin-tailwindcss` por **Biome**, mantendo exatamente o mesmo estilo de código que o Prettier já produzia — mais `.editorconfig`, `.nvmrc` e integração com editor/CI.

O objetivo é que rodar isso num projeto existente gere **diff de formatação zero ou quase zero**. Se o diff vier gigante, algo foi traduzido errado — investigue antes de commitar.

**Escopo:** `biome.json`, `.editorconfig`, `.nvmrc`, `.vscode/`, scripts do `package.json` e — só quando o projeto já usa — `lint-staged`. Husky, CI e deploy ficam de fora: o script não instala nem edita esses arquivos, apenas avisa quando algum deles ficou apontando para o ESLint/Prettier removido. Se o usuário pedir CI junto, trate como tarefa separada em vez de ampliar este setup.

## O que fazer

Use o script. Ele é determinístico, idempotente e já embute as traduções e os workarounds validados abaixo — escrever o `biome.json` à mão erra detalhes silenciosos (o campo `recommended` deprecado, o parser do Nest, o `fix: "safe"` do Tailwind).

```bash
node <skill>/scripts/setup-biome.mjs --dir . --dry-run   # veja o plano primeiro
node <skill>/scripts/setup-biome.mjs --dir .             # aplica
```

O script detecta stack, framework, gerenciador de pacotes e Tailwind lendo o `package.json`. Sobrescreva quando a detecção não servir:

| Flag | Para quê |
|---|---|
| `--stack next\|vite\|react\|node` | força o stack |
| `--framework nest\|express\|fastify\|hono\|none` | força o framework de backend |
| `--nested` | pacote **dentro** de monorepo: gera `"root": false` e não duplica `.editorconfig`/`.nvmrc`/`.vscode` |
| `--line-width 100` | default é 80 (o padrão Giehl) |
| `--node-version v22.14.0` | default: versão do Node em uso, ou preserva o `.nvmrc` existente |
| `--no-install` / `--no-remove-legacy` / `--dry-run` | escapes para casos parciais |

Ele instala **sempre** `@biomejs/biome@latest` e usa a versão resultante no `$schema` — nunca fixe versão do Biome na mão.

### Depois de rodar

```bash
<pm> install
npx biome check --write .   # formata + organiza imports em todo o projeto
npx biome check .           # precisa sair limpo
```

A primeira passada num projeto legado quase sempre acusa erros novos: o preset `recommended` do Biome inclui regras de a11y e correção que o `eslint-config-next` não ligava (`useButtonType`, `noUnusedFunctionParameters`, `useExhaustiveDependencies`). **Isso é sinal, não ruído** — triar caso a caso é mais valioso do que desligar em massa. Só desligue uma regra depois de olhar o que ela apontou; se desligar, deixe o motivo num comentário no `biome.json`.

Faça o commit da reformatação em massa **separado** das mudanças de config, senão qualquer review futuro fica ilegível.

## A tradução (o coração do padrão)

Esta é a equivalência exata entre o `prettier.config.mjs` do padrão Giehl e o `biome.json`. Se precisar ajustar algo à mão, é esta tabela que manda:

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

Duas notas sobre os que **não** têm equivalente direto:

- **`endOfLine: "auto"` não existe no Biome.** Use `"lf"` e deixe o `.editorconfig` (`end_of_line = lf`) alinhado. Em time com Windows, garanta `core.autocrlf=input` no Git; `auto` só existia para não brigar com CRLF no disco.
- **`proseWrap` não se aplica** — o formatador de Markdown do Biome ainda é limitado. Markdown fica fora do Biome por enquanto.

E os plugins ESLint viram configuração nativa:

| Antes | Agora |
|---|---|
| `eslint-plugin-simple-import-sort` | `assist.actions.source.organizeImports` com `groups` |
| `prettier-plugin-tailwindcss` | `linter.rules.nursery.useSortedClasses` |
| `eslint-config-next` (core-web-vitals + TS) | `linter.domains: { next, react }` |
| `eslint-plugin-prettier` + `eslint-config-prettier` | nada — o Biome formata e linta sem conflito |

O `organizeImports` é configurado com grupos explícitos para reproduzir o layout do `simple-import-sort` (builtins → externos → alias `@/` → relativos → estilos, separados por linha em branco). Sem os `groups`, o default do Biome agrupa diferente e o primeiro `check --write` reordena os imports do projeto inteiro.

## Armadilhas (todas verificadas na prática, não deduzidas)

Estas são as que fazem o setup falhar de forma confusa:

1. **`vcs.useIgnoreFile: true` aborta se não houver `.gitignore`.** Não é warning — o Biome sai com erro de configuração e não checa nada. Em repo recém-criado, crie o `.gitignore` antes (ou remova o bloco `vcs`).

2. **`linter.rules.recommended: true` está deprecado.** O campo atual é `"preset": "recommended"`. Configs antigas e exemplos espalhados pela internet ainda usam `recommended` e emitem aviso de depreciação a cada execução.

3. **NestJS não *parseia* sem `javascript.parser.unsafeParameterDecoratorsEnabled: true`.** Decorators de parâmetro (`@Inject()`, `@InjectRepository()`) são um proposal antigo e o Biome os rejeita por padrão — os arquivos falham no parser e sequer chegam a ser analisados. É a primeira coisa a checar se um projeto Nest "não linta nada".

4. **Config aninhada exige `"root": false`.** Dois `biome.json` sem isso resulta em `Found a nested root configuration` e nada roda. É o caso de monorepo (Next + API Node separada) — use `--nested` nos pacotes.

5. **`useSortedClasses` não ordena com `check --write` no default.** O fix dele é *unsafe*, então fica só como aviso. O script define `fix: "safe"` na regra, que é o que reproduz o comportamento do `prettier-plugin-tailwindcss`. Sem isso, as classes do Tailwind param de ser ordenadas e ninguém percebe por semanas.

## Referências

Leia sob demanda, não antecipadamente:

- **`references/stacks.md`** — o delta de cada stack: Next full-stack, Next + API separada (monorepo), Vite/SPA, e backend Node com as particularidades de Hono, Fastify, Express e NestJS. Consulte ao configurar um stack específico ou quando uma regra estiver brigando com o framework.
- **`references/migration.md`** — migrar um projeto que já roda ESLint/Prettier: o que desinstalar, como converter o `lint-staged`, configurar o VSCode, preservar o `git blame` e conduzir a primeira passada de reformatação.
