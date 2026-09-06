# Deltas por stack

Tudo aqui é **delta** sobre a config base descrita no SKILL.md. O script já aplica automaticamente o que está marcado como automático; o resto é decisão de caso.

- [Next.js full-stack](#nextjs-full-stack)
- [Next.js + API Node separada (monorepo)](#nextjs--api-node-separada-monorepo)
- [Vite / SPA frontend-only](#vite--spa-frontend-only)
- [Backend Node](#backend-node) — [Hono](#hono) · [Fastify](#fastify) · [Express](#express) · [NestJS](#nestjs)

---

## Next.js full-stack

Aplicado automaticamente pelo script quando existe `next` nas dependências.

```jsonc
{
  "linter": {
    "domains": { "next": "recommended", "react": "recommended", "tailwind": "recommended" }
  },
  "files": {
    "includes": ["**", "!**/.next/**", "!**/out/**", "!**/next-env.d.ts"]
  }
}
```

O domain `next` substitui `eslint-config-next` (core-web-vitals + typescript): ele liga `useExhaustiveDependencies`, as regras de `next/image`/`next/head`, e o conjunto de hooks do React. Não é preciso listar regra por regra.

**Ignorar `next-env.d.ts` não é opcional** — o arquivo é regerado pelo Next a cada build e formatá-lo cria diff sujo em todo commit.

**Server Actions e `'use server'`/`'use client'`:** o Biome preserva as diretivas normalmente; não há configuração especial. Se o `organizeImports` mover algo acima da diretiva, é bug — reporte, mas na prática ele respeita a posição.

---

## Next.js + API Node separada (monorepo)

Dois pacotes com estilos parcialmente diferentes. A estrutura que funciona:

```
repo/
├── biome.json           # raiz: formatação compartilhada, "root": true (default)
├── .editorconfig        # só aqui
├── .nvmrc               # só aqui
├── apps/web/biome.json  # "root": false + domains next/react/tailwind
└── apps/api/biome.json  # "root": false + delta do framework
```

Rode o script uma vez por pacote:

```bash
node scripts/setup-biome.mjs --dir apps/web
node scripts/setup-biome.mjs --dir apps/api --nested --framework hono
```

Note que `apps/web` roda **sem** `--nested` apenas se for a raiz efetiva do repo. Numa estrutura de monorepo de verdade, ambos levam `--nested` e a raiz recebe um `biome.json` com o que é comum.

Pontos que costumam morder:

- **`"root": false` é obrigatório** nos pacotes. Sem isso: `Found a nested root configuration, but there's already a root configuration` e nada roda.
- **Herança não é automática.** Um `biome.json` aninhado *substitui* as seções que declara; para herdar de verdade use `"extends": ["../../biome.json"]` e declare apenas o delta.
- **`.editorconfig` com `root = true` só na raiz.** Um `root = true` aninhado corta a herança do de cima — foi por isso que o script pula esses arquivos em `--nested`.
- **`vcs.useIgnoreFile`** lê o `.gitignore` do diretório da config. Num pacote sem `.gitignore` próprio, deixe o bloco `vcs` só na raiz.

---

## Vite / SPA frontend-only

```jsonc
{
  "linter": {
    "domains": { "react": "recommended", "tailwind": "recommended", "test": "recommended" }
  },
  "files": { "includes": ["**", "!**/dist/**"] }
}
```

Sem o domain `next` (não há Next). O domain `test` entra quando há `vitest`/`jest` — ele relaxa regras que só fazem sentido em código de produção e liga as específicas de teste.

Como não há camada de servidor, o preset `recommended` já cobre bem. A diferença prática em relação ao Next é que as regras de a11y aparecem com mais força num SPA — `useButtonType`, `useKeyWithClickEvents`, `useAltText`. Vale corrigir em vez de desligar: são erros reais de acessibilidade que o `eslint-config-next` deixava passar.

---

## Backend Node

Base comum a todos os frameworks — sem React, sem Tailwind, sem CSS:

```jsonc
{
  "linter": { "rules": { "preset": "recommended" } },
  "files": { "includes": ["**", "!**/dist/**"] }
}
```

Um ajuste que vale para qualquer backend: se o projeto usa `process.env` espalhado, `noProcessEnv` (quando ligado) vai reclamar. Não é do preset recommended, então por padrão está quieto — só ligue se o projeto tiver um módulo central de env (ex.: validação com Zod), senão vira ruído.

### Hono

**Nada a ajustar.** Testado com middlewares, context tipado (`Hono<Env>`), `onError` e handlers async: passa limpo no preset `recommended`.

Se usar `hono/jsx` em vez de React, configure o runtime no `tsconfig.json` (`jsxImportSource: "hono/jsx"`) — o Biome segue o tsconfig e não precisa de config própria. Não ligue o domain `react` num projeto Hono JSX: as regras de hooks não se aplicam e geram falso positivo.

### Fastify

Sem ajuste de config. O único atrito é o `opts` de plugin que você não usa:

```ts
// dispara noUnusedFunctionParameters
async function dbPlugin(fastify: FastifyInstance, opts: FastifyPluginOptions) {}

// limpo — a assinatura continua com aridade 2
async function dbPlugin(fastify: FastifyInstance, _opts: FastifyPluginOptions) {}
```

Prefixar com `_` é preferível a desligar a regra: a assinatura que o Fastify espera é preservada e você mantém a checagem no resto do código.

Declaration merging (`declare module 'fastify' { interface FastifyInstance { ... } }`) funciona sem configuração.

### Express

Sem ajuste de config. O atrito clássico é o error middleware, que o Express **só reconhece se tiver aridade 4** — mesmo quando `next` não é usado:

```ts
// dispara noUnusedFunctionParameters em _req e next
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  res.status(500).json({ message: err.message })
}

// limpo, e o Express continua reconhecendo como error handler
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  res.status(500).json({ message: err.message })
}
```

Resista à tentação de desligar `noUnusedFunctionParameters` globalmente por causa de um punhado de handlers — a regra pega bugs reais em controllers.

### NestJS

O único framework que precisa de configuração de verdade. O script aplica:

```jsonc
{
  "javascript": {
    "parser": { "unsafeParameterDecoratorsEnabled": true }
  },
  "linter": {
    "rules": {
      "style": { "useImportType": "off" },
      "correctness": { "noUnusedFunctionParameters": "off" }
    }
  }
}
```

Por que cada um:

1. **`unsafeParameterDecoratorsEnabled`** — sem isso o Biome **falha no parser**, não no lint: `Decorators are not valid here` em todo `@Inject()`/`@InjectRepository()` de constructor. O arquivo inteiro é descartado. Se um projeto Nest parece "não estar sendo lintado", é aqui.

2. **`useImportType: "off"`** — a regra converteria `import { Repository } from 'typeorm'` em `import type { ... }`. Com `emitDecoratorMetadata`, o TypeScript usa esses imports em runtime para montar `design:paramtypes`; virando type-only import, o metadado some e **a injeção de dependência quebra em runtime**, sem erro de compilação. É o tipo de quebra que só aparece em produção.

3. **`noUnusedFunctionParameters: "off"`** — parameter properties (`constructor(private readonly repo: Repository<User>)`) são lidas como parâmetros não usados. Aqui a convenção `_` não serve, porque o nome do parâmetro *é* o nome da propriedade (`this.repo`). Desligar é a saída correta.

O `tsconfig.json` do Nest precisa manter `experimentalDecorators` e `emitDecoratorMetadata` — o Biome não altera isso, mas confirme que continuam ligados após a migração.
