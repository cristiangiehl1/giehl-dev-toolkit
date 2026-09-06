# Migrando um projeto que já usa ESLint + Prettier

O script faz a parte mecânica (instalar, escrever configs, remover deps e arquivos legados, reescrever scripts). Este documento cobre o que sobra: husky/lint-staged, editor, CI, e como conduzir a reformatação em massa sem estragar o histórico.

## Ordem recomendada

Migre com a árvore limpa (`git status` vazio) e em branch própria. A ordem importa porque o passo 3 gera um diff enorme que precisa ficar isolado.

1. **Config** — rode o script, revise o `biome.json` gerado, commite só as configs.
2. **Verificação** — `npx biome check .` e leia os erros *antes* de aplicar nada.
3. **Reformatação** — `npx biome check --write .`, commit separado com mensagem clara.
4. **Correções de lint** — os erros que sobraram, em commits temáticos.

Separar 1 de 3 é o que permite revisar a migração: no commit de config dá para discutir as escolhas, e o de reformatação pode ser revisado com `--ignore-all-space` ou simplesmente confiado.

## O que o script remove

Arquivos: `.eslintrc*`, `eslint.config.*`, `.eslintignore`, `.prettierrc*`, `prettier.config.*`, `.prettierignore`.

Dependências: `eslint`, `eslint-config-next`, `eslint-config-prettier`, `eslint-plugin-prettier`, `eslint-plugin-simple-import-sort`, `eslint-plugin-import`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-unused-imports`, `@typescript-eslint/*`, `typescript-eslint`, `prettier`, `prettier-plugin-tailwindcss`.

Ele reescreve o `package.json` mas **não roda o install** da remoção — rode `<pm> install` depois para o lockfile acompanhar.

Se o projeto tiver plugin ESLint sem equivalente no Biome (ex.: regras internas da empresa, `eslint-plugin-boundaries`), o script não sabe disso: ou você mantém ESLint só para essas regras (rodando junto do Biome, o que é suportado mas dobra o tempo de CI), ou aceita perdê-las. Decida explicitamente em vez de descobrir depois.

## Scripts do `package.json`

O script troca os `lint:prettier:*` / `lint:eslint:*` por:

```jsonc
{
  "lint": "biome check .",           // lint + format + imports, só reporta
  "lint:fix": "biome check --write .", // aplica tudo que é seguro
  "format": "biome format --write .",  // só formatação
  "lint:ci": "biome ci ."              // modo CI: não escreve, falha no primeiro problema
}
```

`biome ci` existe para pipeline: além de não escrever, ele emite anotações no formato do GitHub Actions, então os erros aparecem inline no diff da PR.

## lint-staged

Está no escopo, mas só quando o projeto **já usa** lint-staged — o script não adiciona a dependência, apenas reaponta a config. Como um único comando do Biome cobre formatação, imports e lint, a configuração encolhe para:

```jsonc
// .lintstagedrc.json
{
  "*": ["biome check --write --no-errors-on-unmatched"]
}
```

Por que `*` em vez de `*.{js,ts,tsx}`: o Biome também trata JSON e CSS, e decide sozinho o que sabe processar. `--no-errors-on-unmatched` impede o hook de falhar quando o commit só tem arquivos que o Biome ignora (um `.md`, um `.png`).

## husky e CI: fora do escopo

O script **não** instala nem edita husky, GitHub Actions ou qualquer pipeline — essas peças têm dono próprio e mudam por motivos diferentes dos de estilo de código. Um `.husky/pre-commit` que chama `lint-staged` continua funcionando sem alteração, porque quem mudou foi a config do lint-staged, não o hook.

O que o script faz é **avisar**: ao remover ESLint e Prettier, ele varre `.husky/*` e `.github/workflows/*` e lista o que ficou apontando para binário que não existe mais. Nada é alterado nesses arquivos.

Se você decidir atualizar o CI, `biome ci` é a variante para pipeline — não escreve e emite anotações no formato do GitHub Actions, então os erros aparecem inline no diff da PR. Mas a decisão e a edição são suas.

## VSCode

O script escreve `.vscode/settings.json` e `.vscode/extensions.json`. Dois cuidados:

- **Desinstale ou desabilite as extensões `esbenp.prettier-vscode` e `dbaeumer.vscode-eslint` no workspace.** Se ficarem ativas junto do Biome, dois formatadores brigam no save e o arquivo oscila entre estilos a cada gravação. É o problema nº 1 depois de migrar.
- A extensão do Biome (`biomejs.biome`) usa o binário do `node_modules` do projeto. Se o editor reclamar que não encontra, é porque o install ainda não rodou.

## Preservando o `git blame`

A reformatação em massa polui o `git blame` de todo arquivo tocado. O Git tem solução:

```bash
# depois do commit de reformatação
git rev-parse HEAD >> .git-blame-ignore-revs
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

Commite o `.git-blame-ignore-revs`. O GitHub respeita esse arquivo automaticamente na view de blame, e quem clonar precisa rodar o `git config` uma vez (vale colocar no README).

## Conferindo que a tradução ficou fiel

O teste honesto de que o estilo não mudou: no commit **anterior** à migração, rode o Prettier antigo e o Biome novo sobre a mesma árvore e compare.

```bash
git stash                       # guarde a config nova
npx prettier --write .          # estado de referência
git diff --stat                 # deve ser vazio se o projeto estava formatado
```

Depois aplique o Biome e veja o tamanho do diff. Um punhado de linhas (quebras de linha em casos-limite) é esperado — Biome e Prettier divergem em situações raras de quebra. Centenas de linhas significa opção traduzida errado: confira a tabela de equivalência no SKILL.md, especialmente `semicolons`, `quoteStyle`, `trailingCommas` e `bracketSameLine`, que são os que mais mudam volume de diff.
