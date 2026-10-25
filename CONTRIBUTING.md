# Contribuindo

🌐 **Idiomas:** [Português (BR)](./CONTRIBUTING.md) · [English (US)](./CONTRIBUTING.en-US.md)

Obrigado pelo interesse em melhorar o `giehl-dev-toolkit`. Este repositório é um **marketplace de plugins do Claude Code**, não uma aplicação: não há build nem suíte de testes automatizados. O "produto" são arquivos Markdown com frontmatter (skills e subagents) e alguns scripts auxiliares.

O `AGENTS.md` é o guia operacional detalhado (também lido por agentes de código). Este arquivo é a versão curta para pessoas.

## Idioma

Tudo é escrito em **inglês**, inclusive as mensagens de commit, exceto o `README.md` e o `CONTRIBUTING.md`, que ficam em português do Brasil. Cada um tem um espelho em inglês (`README.en-US.md` e `CONTRIBUTING.en-US.md`), e os dois lados mudam juntos.

A única exceção dentro dos plugins: as frases de gatilho literais citadas em uma `description` ficam bilíngues (PT-BR + inglês), porque os usuários digitam em português e uma descrição sem essas frases deixa de disparar.

## Estrutura do repositório

```
.claude-plugin/marketplace.json     # catálogo: o que o Claude Code enxerga e instala
plugins/<dominio>/<nome-do-plugin>/ # um diretório por plugin
├── SKILL.md                        # skill: frontmatter + corpo
├── agents/<nome>.md                # subagent (no lugar do SKILL.md)
├── references/                     # documentação lida sob demanda
├── scripts/                        # executáveis auxiliares
└── assets/                         # templates usados na saída
```

Os plugins são agrupados por **domínio**, não por tipo. Domínios atuais: `code-standards`, `ai-engineering`, `ux-product`. Reaproveite um existente e crie um novo só quando nenhum couber.

## Adicionando um plugin

1. Crie `plugins/<dominio>/<nome-do-plugin>/` (em `kebab-case`) com um `SKILL.md` ou um `agents/<nome>.md`.
2. Registre-o no `.claude-plugin/marketplace.json`. **Copie uma entrada existente** e troque os valores (`author` precisa ser um objeto). Um plugin fora do catálogo fica invisível: nada falha, ele só nunca aparece.
3. Mantenha o `name` idêntico no `marketplace.json` e no frontmatter.
4. Adicione uma linha na tabela de plugins do `README.md`, do `README.en-US.md` e do `AGENTS.md`, e uma entrada no `CATALOG.md`.
5. Escreva uma `description` com as frases literais que o usuário digitaria e que diga o que está fora do escopo. Descrições curtas fazem o plugin nunca disparar.

## Testando sua mudança

Valide o catálogo e instale localmente (a CLI exige caminho absoluto):

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8'))"
claude plugin validate .
claude plugin marketplace add /caminho/absoluto/para/giehl-dev-toolkit
claude plugin marketplace update giehl-dev-toolkit
claude plugin install <nome-do-plugin>@giehl-dev-toolkit
```

Passar no `JSON.parse` não basta: as entradas são validadas por schema na instalação. Depois, dispare o plugin numa sessão real. Para scripts, rode também `node --check plugins/<dominio>/<nome>/scripts/<arquivo>.mjs`.

Quando uma skill afirma como uma ferramenta externa se comporta, verifique rodando a ferramenta em vez de deduzir.

## Commits e pull requests

- [Conventional Commits](https://www.conventionalcommits.org/) em inglês, com o plugin como escopo: `feat(system-message-writer): add ...`, `fix(biome-lint-setup): ...`.
- Use `refactor:` ou `docs:` sem escopo para mudanças que afetam o repositório inteiro.
- As versões seguem [SemVer](https://semver.org/). Aumente a `version` no `marketplace.json` quando um plugin mudar de comportamento; releases são tags (`git tag vX.Y.Z && git push origin vX.Y.Z`).
- Mantenha uma mudança lógica por pull request e descreva como você testou.
