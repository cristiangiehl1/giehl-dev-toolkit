# Giehl Dev Toolkit

![Giehl Dev Toolkit](./docs/banner.svg)

[![License: MIT](https://img.shields.io/github/license/cristiangiehl1/giehl-dev-toolkit)](./LICENSE)
[![Plugins](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fcristiangiehl1%2Fgiehl-dev-toolkit%2Fmain%2F.claude-plugin%2Fmarketplace.json&query=%24.plugins.length&label=plugins&color=blue)](./CATALOG.md)
[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin_marketplace-D97757)](https://code.claude.com)
[![Last commit](https://img.shields.io/github/last-commit/cristiangiehl1/giehl-dev-toolkit)](https://github.com/cristiangiehl1/giehl-dev-toolkit/commits/main)
[![Stars](https://img.shields.io/github/stars/cristiangiehl1/giehl-dev-toolkit?style=flat)](https://github.com/cristiangiehl1/giehl-dev-toolkit/stargazers)
[![Conventional Commits](https://img.shields.io/badge/Conventional_Commits-1.0.0-FE5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](./CONTRIBUTING.md)

> Marketplace pessoal de plugins para o [Claude Code](https://code.claude.com), reunindo skills, servidores MCP e outros plugins com padrões, boas práticas e estruturas de código usados no dia a dia de desenvolvimento.

🌐 **Idiomas:** [Português (BR)](./README.md) · [English (US)](./README.en-US.md)

---

## Sobre

Este repositório é um **marketplace de plugins do Claude Code**. Ele centraliza, versiona e distribui:

- **Skills** — padrões e fluxos de trabalho reutilizáveis (ex.: revisão de código, geração de documentação, convenções de commit).
- **MCP Servers** — integrações com ferramentas e serviços externos.
- **Plugins diversos** — commands, subagents e hooks que automatizam tarefas recorrentes.

O objetivo é ter um único ponto de instalação para tudo que uso com frequência como desenvolvedor, em vez de copiar arquivos manualmente entre máquinas e projetos.

## Plugins disponíveis

| Plugin | O que faz |
|---|---|
| [`structured-prompt-engineering`](./plugins/ai-engineering/structured-prompt-engineering) | Padrão para escrever `getSystemPrompt`/`getUserPromptTemplate` como objetos serializados via `JSON.stringify`, com parametrização, schema de saída e few-shot. |
| [`biome-lint-setup`](./plugins/code-standards/biome-lint-setup) | Setup de lint/formatação com Biome traduzido do padrão ESLint + Prettier + simple-import-sort + Tailwind, incluindo `.editorconfig` e a fixação da versão do Node (mise ou `.nvmrc`), com suporte a monorepo. Cobre Next.js, Vite/SPA e backend Node (Hono, Fastify, Express, NestJS). |
| [`folder-structure-standard`](./plugins/code-standards/folder-structure-standard) | Estrutura de pastas e camadas (model/service/controller/infra) para Next.js full-stack, Vite/React SPA, backend Node (Hono, Fastify, Express) e monorepos pnpm. |
| [`mcp-server-architecture`](./plugins/ai-engineering/mcp-server-architecture) | Estrutura de servidores MCP em TypeScript — layout single-domain vs modular monolith (domain/application/infrastructure), SOLID aplicado ao registro de tools, factory + composition root para evitar prop-drilling, Zod como fonte única de verdade, e publicação privada via Verdaccio. |
| [`requirements-ux-analyst`](./plugins/ux-product/requirements-ux-analyst) | Subagent que analisa requisitos de negócio brutos e extrai cenários ocultos, caminhos infelizes, edge cases, estados de UI (loading/empty/error), falhas de segurança e regras de negócio conflitantes, desenha o fluxo completo em Mermaid (`graph TD`) e grava cada análise como Markdown versionado em `docs/requirements-analyses/`, preservando o histórico da discussão com o PO. |
| [`system-message-writer`](./plugins/ux-product/system-message-writer) | Subagent que escreve e padroniza mensagens de sistema (erros, validações, estados vazios, limites) com tom sem culpa, orientado à solução e com glossário consistente (Transferência, Agendamento, Chave Pix), respondendo em JSON estrito por código de erro. |

> As skills são escritas em inglês. Este `README.md` é o único arquivo do repositório em PT-BR.

> Lista completa, por domínio, em [`CATALOG.md`](./CATALOG.md).

## Estrutura do repositório

```
giehl-dev-toolkit/
├── .claude-plugin/
│   └── marketplace.json      # Catálogo com todos os plugins registrados
├── plugins/
│   └── <dominio>/            # Agrupamento por domínio (code-standards, ai-engineering, ux-product)
│       └── <nome-do-plugin>/ # Um diretório por plugin
│           ├── SKILL.md      # Metadados (frontmatter) + implementação da skill
│           ├── agents/       # Subagents (<nome>.md), quando o plugin é um agente
│           ├── references/   # Documentação carregada sob demanda
│           ├── scripts/      # Executáveis auxiliares
│           └── assets/       # Templates e arquivos usados na saída
├── AGENTS.md                 # Guia operacional pra qualquer agente trabalhar neste repo
├── CLAUDE.md                 # Aponta pra @AGENTS.md (convenção do Claude Code)
├── README.md                 # Este arquivo (PT-BR)
└── README.en-US.md           # Versão em inglês
```

Cada plugin listado em `marketplace.json` aponta para um diretório em `plugins/<dominio>/<nome-do-plugin>`, contendo seu manifesto e sua implementação (skill, command, hook ou configuração de MCP).

Apenas o `SKILL.md` é obrigatório. `references/`, `scripts/` e `assets/` existem para o carregamento progressivo: o corpo do `SKILL.md` entra em contexto quando a skill dispara, enquanto os demais só são lidos quando realmente necessários.

## Pré-requisitos

- [Claude Code](https://code.claude.com) instalado e configurado.
- Git (para clonar/publicar o repositório).

## Instalação

### Localmente (desenvolvimento/testes)

```bash
claude plugin marketplace add /caminho/para/giehl-dev-toolkit
```

### Via GitHub (após publicado)

```bash
claude plugin marketplace add <seu-usuario>/giehl-dev-toolkit
```

## Uso

Listar marketplaces adicionados:

```bash
claude plugin marketplace list
```

Instalar um plugin específico dentro do Claude Code:

```
/plugin install <nome-do-plugin>@giehl-dev-toolkit
```

## Adicionando um novo plugin

1. Criar um diretório em `plugins/<dominio>/<nome-do-plugin>/` (reaproveite um domínio existente; crie um novo só quando nenhum couber).
2. Adicionar o manifesto (`SKILL.md` com frontmatter, ou `plugin.json`) descrevendo nome, descrição e uso.
3. Registrar o plugin em `.claude-plugin/marketplace.json`, incluindo `name`, `version` e `source`.
4. Testar localmente com `claude plugin marketplace add` antes de publicar.

O passo 3 não é opcional: um plugin que existe em `plugins/` mas não está no `marketplace.json` simplesmente não aparece para instalação — nada falha, ele só não existe. O campo `name` precisa ser idêntico no `marketplace.json` e no frontmatter do `SKILL.md`.

## Convenções

- Nomes de plugins em `kebab-case`.
- Versionamento seguindo [Semantic Versioning](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`).
- Cada plugin deve ter uma descrição objetiva do que resolve e um exemplo de uso.
- A `description` do frontmatter é o que faz a skill **disparar** — ela é lida a cada sessão e deve conter os gatilhos literais que o usuário digita, além do que está fora do escopo. Descrições curtas demais fazem a skill nunca ser acionada.
- **Tudo é escrito em inglês** — skills, `references/`, `scripts/`, `CLAUDE.md` e mensagens de commit. A única exceção é este `README.md`, a metade PT-BR do espelho; `README.en-US.md` é a metade em inglês, e os dois mudam juntos.
- Os gatilhos literais citados dentro de uma `description` continuam **bilíngues** (PT-BR + inglês): a descrição é escrita em inglês, mas as frases que o usuário digita em português precisam estar lá, senão a skill deixa de disparar.

## Versionamento e releases

Alterações relevantes devem ser marcadas com tags Git seguindo SemVer:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Contribuindo

O passo a passo completo (estrutura, registro no catálogo, testes locais e convenção de commits) está em [`CONTRIBUTING.md`](./CONTRIBUTING.md), escrito em inglês.

## Licença

Distribuído sob a licença [MIT](./LICENSE), salvo indicação em contrário dentro de um plugin específico.

## Autor

**Cristian Giehl**
📧 cristian.giehl@gmail.com
