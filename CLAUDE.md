# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este repositório

Um **marketplace de plugins do Claude Code** — não é uma aplicação. Não há build, bundler, testes automatizados nem `package.json` na raiz. O "produto" são arquivos Markdown com frontmatter (skills) e scripts auxiliares, consumidos pelo próprio Claude Code.

Consequência prática: mudanças são validadas **instalando o marketplace localmente e disparando a skill**, não rodando uma suíte. Não invente comandos de teste.

## Comandos

```bash
# validar o catálogo antes de commitar (erro de JSON quebra o marketplace inteiro)
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8'))"

# validar scripts de skill
node --check plugins/<nome>/scripts/<arquivo>.mjs

# instalar/testar localmente
claude plugin marketplace add .
claude plugin marketplace list
```

Dentro do Claude Code: `/plugin install <nome>@giehl-dev-toolkit`.

Para publicar uma versão: `git tag vX.Y.Z && git push origin vX.Y.Z` (SemVer).

## Arquitetura

Há **duas fontes de verdade que precisam ficar em sincronia**, e é o erro mais comum ao mexer aqui:

| Arquivo | Papel |
|---|---|
| `.claude-plugin/marketplace.json` | catálogo — o que o Claude Code enxerga e instala |
| `plugins/<nome>/SKILL.md` | frontmatter (`name`, `description`) + implementação |

Uma skill criada em `plugins/` mas **não registrada no `marketplace.json` é invisível** — nada falha, ela simplesmente não existe para o instalador. O campo `name` precisa ser idêntico nos dois lugares, e `source` aponta para `./plugins/<nome>`.

### Anatomia de uma skill

```
plugins/<nome>/
├── SKILL.md       # obrigatório: frontmatter + corpo
├── references/    # docs .md lidas sob demanda
├── scripts/       # executáveis (rodam sem carregar contexto)
└── assets/        # templates/arquivos usados na saída
```

O carregamento é em três níveis (*progressive disclosure*), e escrever a skill sem respeitar isso desperdiça contexto:

1. `name` + `description` — sempre em contexto, em toda sessão;
2. corpo do `SKILL.md` — carregado quando a skill dispara (mantenha abaixo de ~500 linhas);
3. `references/`, `scripts/`, `assets/` — só quando necessários.

Conteúdo extenso ou específico de variante vai para `references/`, apontado a partir do `SKILL.md` com a indicação de *quando* ler. Trabalho mecânico e repetitivo (gerar config, editar `package.json`) vai para `scripts/` — código determinístico erra menos que instruir o modelo a reescrever JSON à mão. Veja `plugins/biome-lint-setup/` como referência dessa divisão.

### A `description` é o mecanismo de disparo

Skills não são invocadas pelo nome, e sim porque o modelo leu a `description` e decidiu que ela se aplica. Por isso as descriptions aqui são longas, deliberadamente insistentes ("Use SEMPRE que...") e cheias de **gatilhos literais** — as frases que o usuário realmente digita. Elas também delimitam o que está fora do escopo, para evitar disparo indevido.

Ao editar uma description, preserve essas características: encurtá-la para ficar "mais limpa" costuma fazer a skill parar de disparar.

## Convenções

- **Idioma:** skills, descriptions e documentação em **PT-BR**. A exceção é `README.en-US.md`.
- **`README.md` e `README.en-US.md` são espelhos** — ao alterar um, atualize o outro na mesma mudança.
- Nomes de plugin em `kebab-case`; versão em SemVer no `marketplace.json`.
- Mensagens de commit seguem Conventional Commits em PT-BR, com o nome do plugin como escopo: `feat(biome-lint-setup): adiciona ...`.
- Ao afirmar comportamento de ferramenta externa numa skill, **verifique executando** em vez de deduzir. As armadilhas documentadas em `plugins/biome-lint-setup/` vieram de rodar o Biome de verdade num sandbox; várias contrariam o que a documentação sugere.
