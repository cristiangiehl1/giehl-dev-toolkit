# Giehl Dev Toolkit

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
| [`structured-prompt-engineering`](./plugins/structured-prompt-engineering) | Padrão para escrever `getSystemPrompt`/`getUserPromptTemplate` como objetos serializados via `JSON.stringify`, com parametrização, schema de saída e few-shot. |
| [`biome-lint-setup`](./plugins/biome-lint-setup) | Setup de lint/formatação com Biome traduzido do padrão ESLint + Prettier + simple-import-sort + Tailwind, incluindo `.editorconfig` e `.nvmrc`. Cobre Next.js, Vite/SPA e backend Node (Hono, Fastify, Express, NestJS). |

## Estrutura do repositório

```
giehl-dev-toolkit/
├── .claude-plugin/
│   └── marketplace.json      # Catálogo com todos os plugins registrados
├── plugins/
│   └── <nome-do-plugin>/     # Um diretório por plugin
│       ├── SKILL.md          # Metadados (frontmatter) + implementação da skill
│       ├── references/       # Documentação carregada sob demanda
│       ├── scripts/          # Executáveis auxiliares
│       └── assets/           # Templates e arquivos usados na saída
├── CLAUDE.md                 # Guia para o Claude Code trabalhar neste repo
├── README.md                 # Este arquivo (PT-BR)
└── README.en-US.md           # Versão em inglês
```

Cada plugin listado em `marketplace.json` aponta para um diretório dentro de `plugins/`, contendo seu manifesto e sua implementação (skill, command, hook ou configuração de MCP).

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

1. Criar um diretório em `plugins/<nome-do-plugin>/`.
2. Adicionar o manifesto (`SKILL.md` com frontmatter, ou `plugin.json`) descrevendo nome, descrição e uso.
3. Registrar o plugin em `.claude-plugin/marketplace.json`, incluindo `name`, `version` e `source`.
4. Testar localmente com `claude plugin marketplace add` antes de publicar.

O passo 3 não é opcional: um plugin que existe em `plugins/` mas não está no `marketplace.json` simplesmente não aparece para instalação — nada falha, ele só não existe. O campo `name` precisa ser idêntico no `marketplace.json` e no frontmatter do `SKILL.md`.

## Convenções

- Nomes de plugins em `kebab-case`.
- Versionamento seguindo [Semantic Versioning](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`).
- Cada plugin deve ter uma descrição objetiva do que resolve e um exemplo de uso.
- A `description` do frontmatter é o que faz a skill **disparar** — ela é lida a cada sessão e deve conter os gatilhos literais que o usuário digita, além do que está fora do escopo. Descrições curtas demais fazem a skill nunca ser acionada.
- Skills e documentação em PT-BR; `README.md` e `README.en-US.md` são espelhos e mudam juntos.

## Versionamento e releases

Alterações relevantes devem ser marcadas com tags Git seguindo SemVer:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Licença

Distribuído sob a licença [MIT](./LICENSE), salvo indicação em contrário dentro de um plugin específico.

## Autor

**Cristian Giehl**
📧 cristian.giehl@grupokochsa.com.br
