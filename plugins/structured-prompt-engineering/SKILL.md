---
name: structured-prompt-engineering
description: Use SEMPRE que for escrever, revisar ou refatorar um system prompt e/ou user prompt para uma chamada de LLM — não importa o framework (LangChain, Vercel AI SDK, chamada direta a OpenAI/OpenRouter/Anthropic). Dispare em pedidos como "cria o prompt para...", "como estruturar esse system prompt", "meu prompt não está extraindo direito", "separa o system do user prompt", "monta um few-shot pra esse caso", ou sempre que estiver escrevendo uma função `getSystemPrompt`/`getUserPromptTemplate`. Ensina o padrão de prompt como objeto estruturado serializado via `JSON.stringify` (role, regras, extraction_instructions, examples), como parametrizar essas funções com o que precisa ser injetado, e reforça fortemente exemplos de bom uso vs. erros comuns (do's and don'ts) — derivado de prompts reais em produção.
---

# Prompt estruturado: `getSystemPrompt` + `getUserPromptTemplate`

Este é o padrão para escrever prompts de LLM como **funções que retornam um objeto serializado**, em vez de strings de texto corrido. Funciona com qualquer stack que aceite um `system` e um `user`/`human` message — a técnica em si não depende de framework.

## Por que objeto serializado em vez de texto corrido

Um prompt escrito como parágrafo de texto é difícil de revisar em partes, difícil de saber o que mudou entre versões, e tende a virar um bloco gigante e frágil. Serializando um objeto (`JSON.stringify({...})`) você ganha:

- **Seções nomeadas e revisáveis independentemente** (`role`, `regras`, `examples` são blocos separados, não um parágrafo emaranhado).
- **Facilidade de gerar o conteúdo dinamicamente** — é só montar um objeto JS/TS normal, sem concatenação de strings.
- **Um formato que o próprio modelo já é bom em parsear** — LLMs foram muito treinados em JSON, então a estrutura ajuda o modelo a "achar" a regra certa em vez de perder informação num texto corrido longo.

## Anatomia de `getSystemPrompt`

`getSystemPrompt` é uma função que recebe **apenas o que muda por sessão/config** — nunca a mensagem do turno atual do usuário (isso é sempre responsabilidade do `getUserPromptTemplate`). Os parâmetros são o que precisa ser **injetado**: dados de referência (lista de profissionais, catálogo de produtos), contexto já conhecido do usuário (preferências salvas), etc.

```ts
export const getSystemPrompt = (userContext?: string) => {
  return JSON.stringify({
    role: 'Assistente musical entusiasta e amigável - caloroso, animado, conversacional (2-4 frases)',

    tarefas: [
      'Conversar sobre preferências musicais e fazer recomendações personalizadas',
      'Extrair informações do usuário (nome, idade, gêneros, bandas, humor, contexto)',
      'SEMPRE recomendar músicas específicas (título e artista) baseado no que sabe do usuário',
    ],

    // Dado injetado, nunca hardcoded dentro do objeto.
    preferencias_previamente_armazenadas: userContext || 'Nenhuma',

    regras_de_extracao: {
      shouldSavePreferences: 'Defina como true APENAS quando o USUÁRIO compartilhar NOVAS informações pessoais',
      nunca_extrair: 'Músicas, bandas ou artistas que VOCÊ (IA) recomendou - apenas o que o USUÁRIO disse gostar',
    },

    exemplos: [
      /* ver seção "Exemplos" abaixo */
    ],
  });
};
```

Seções recorrentes que funcionam bem (nomeie em PT-BR ou EN, mas seja consistente no projeto):

| Seção | Para que serve |
|---|---|
| `role` | Define o papel/persona e o tom — 1 frase, direto. |
| `tarefas` / `task` | Lista do que o modelo precisa fazer nesta chamada, não o que ele é. |
| `regras` / `rules` | Como decidir entre casos (ex.: qual intenção escolher, quando extrair algo). |
| `extraction_instructions` | Uma instrução por campo do schema de saída — nunca deixe implícito. |
| `examples` / `exemplos` | Few-shot — ver seção dedicada abaixo. |
| *(dado dinâmico)* | Qualquer contexto injetado (histórico resumido, lista de referência) vai como uma chave própria, nunca embutido dentro de `role` ou `regras`. |

## Anatomia de `getUserPromptTemplate`

Recebe a **entrada do turno atual** como parâmetro (nunca hardcoded) e, se necessário, contexto adicional específico daquela chamada (histórico da conversa, dados já coletados). Sempre inclui um array de `instrucoes`/`instructions` explícito — mesmo que pareça redundante com o system prompt, repetir a instrução no user prompt (com foco no que fazer *com essa entrada específica*) reduz drift em conversas longas.

```ts
export const getUserPromptTemplate = (
  userMessage: string,
  conversationHistory?: string
) => {
  return JSON.stringify({
    contexto_da_conversa: conversationHistory || 'Primeira mensagem',
    mensagem_atual_do_usuario: userMessage,
    instrucoes: [
      'Gere uma resposta calorosa e envolvente em Português',
      'SEMPRE inclua recomendações de músicas específicas quando relevante',
      'Extraia quaisquer preferências compartilhadas',
      'Defina o flag shouldSavePreferences apropriadamente',
    ],
  });
};
```

## Parametrização: o que injetar vs. o que hardcodar

Regra prática: se o valor pode mudar entre chamadas (por ambiente, por usuário, por turno), ele é **parâmetro da função**, nunca um literal dentro do objeto retornado.

- Lista de profissionais/produtos/catálogo → parâmetro de `getSystemPrompt`.
- Contexto/preferências já conhecidas do usuário → parâmetro de `getSystemPrompt`.
- Mensagem do usuário no turno atual → parâmetro de `getUserPromptTemplate`, nunca de `getSystemPrompt`.
- Data/hora atual, se o prompt precisa dela para interpretar "amanhã", "hoje" → gere dentro da função (`new Date().toISOString()`) para não depender de quem chama lembrar de passar.
- Instruções fixas de tom/formato que nunca mudam → podem ficar hardcoded no objeto, não precisam ser parâmetro.

## O schema de saída acompanha o prompt, no mesmo arquivo

Cada módulo de prompt exporta, junto das duas funções, o schema (Zod ou equivalente) que descreve a saída esperada — com `.describe()` em cada campo funcionando como a instrução de extração daquele campo:

```ts
export const ChatResponseSchema = z.object({
  message: z.string().describe('A resposta conversacional para o usuário'),
  preferences: UserPreferencesSchema.optional().describe('Preferências extraídas desta mensagem'),
  shouldSavePreferences: z.boolean().describe('Se as preferências extraídas devem ser salvas'),
});
```

## Exemplos (few-shot) dentro do prompt

O array `examples`/`exemplos` é a parte que mais afeta a qualidade da extração. Um bom conjunto de exemplos cobre: o caso feliz, o caso ambíguo/vazio, e pelo menos um contra-exemplo anotado. Veja `references/examples.md` para 4 exemplos completos e comentados, extraídos de prompts reais (classificação de intenção, geração de mensagem, extração de preferências, sumarização).

Estrutura mínima de um bom exemplo:

```ts
{
  usuario: 'Gosto especialmente de Tame Impala e Daft Punk',
  resposta: {
    message: 'Excelente gosto! Tente "Let It Happen" e "Digital Love"!',
    preferences: { favoriteBands: ['Tame Impala', 'Daft Punk'] },
    shouldSavePreferences: true,
  },
  nota_importante: 'EXTRAIR — o usuário declarou explicitamente que GOSTA dessas bandas (não foram recomendações da IA)',
}
```

O campo `nota_importante` (ou `note`) não é decoração — é o que transmite o *porquê* daquela decisão de extração, o que ajuda o modelo a generalizar para casos parecidos que não estão nos exemplos.

## Do's and Don'ts

### ✅ Faça

- **Defina o schema de saída antes de escrever o texto do prompt.** O prompt existe para preencher o schema — comece pelo contrato.
- **Descreva todo campo do schema com `.describe()`**, mesmo os óbvios. A descrição é lida como instrução de extração.
- **Separe rigorosamente o que é `system` (config/sessão) do que é `user` (turno atual).** A mensagem do usuário nunca entra em `getSystemPrompt`.
- **Inclua pelo menos um contra-exemplo anotado** sempre que houver risco de o modelo confundir "o que o usuário disse" com "o que a IA gerou/recomendou" — esse é o erro de extração mais comum e mais silencioso.
- **Retorne flags determinísticas** (`shouldSavePreferences`, `intent`, `actionSuccess`) em vez de forçar quem consome a resposta a reinterpretar texto livre.
- **Injete todo dado que varia** (listas de referência, contexto do usuário, data atual) como parâmetro da função — nunca hardcode.
- **Um arquivo de prompt = uma responsabilidade.** `identifyIntent.ts`, `messageGenerator.ts`, `summarization.ts` são arquivos separados, não um mega-prompt fazendo tudo.
- **Repita a instrução relevante no `user prompt`**, mesmo que já esteja no system — em conversas longas isso reduz esquecimento/drift do modelo.

### ❌ Não faça

- **Não escreva o system prompt como parágrafo de texto livre.** Se está difícil revisar "qual frase faz o quê", já devia ser um objeto com seções.
- **Não coloque a mensagem do turno atual dentro de `getSystemPrompt`.** Isso quebra cache de prompt (quando o provider suporta) e mistura o que é estável com o que muda a cada chamada.
- **Não deixe um campo `optional()` no schema sem `.describe()`.** Campo opcional sem descrição é extraído de forma inconsistente entre chamadas.
- **Não assuma que o modelo vai "perceber sozinho" uma ambiguidade óbvia** (ex.: não confundir recomendação da IA com preferência do usuário). Sem contra-exemplo anotado, esse erro se repete.
- **Não hardcode dados de referência** (listas, catálogos, IDs) direto no texto do objeto — isso trava o prompt a um ambiente/teste específico. Sempre parâmetro.
- **Não misture duas responsabilidades no mesmo prompt** (ex.: classificar intenção E gerar a mensagem final no mesmo `getSystemPrompt`). Cada preocupação, seu próprio módulo de prompt.
- **Não edite um prompt em produção destrutivamente.** Se for mudar a estrutura, crie uma nova versão (`v2`) em vez de sobrescrever — permite comparar e reverter.

## Referências

- `references/examples.md` — 4 exemplos completos e comentados de `getSystemPrompt`/`getUserPromptTemplate` + schema, cobrindo: extração de preferências, classificação de intenção, geração de mensagem de resposta, e sumarização de conversa.
