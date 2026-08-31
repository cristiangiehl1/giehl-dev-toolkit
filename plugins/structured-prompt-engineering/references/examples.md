# Exemplos completos de `getSystemPrompt` + `getUserPromptTemplate`

Quatro exemplos reais (generalizados de prompts em produção), cada um com uma anotação do que ele demonstra de bom. Use como referência de estrutura, não copie o domínio (música, consultas médicas) se não for o seu caso — o que importa é o padrão.

---

## 1. Extração de preferências em chat (conversa aberta)

**Demonstra:** regra explícita de "o que nunca extrair", contra-exemplo anotado, flag booleana determinística.

```ts
import { z } from 'zod';

export const UserPreferencesSchema = z.object({
  name: z.string().optional().describe('Nome do usuário'),
  favoriteGenres: z.array(z.string()).optional().describe('Gêneros musicais favoritos'),
  favoriteBands: z.array(z.string()).optional().describe('Bandas ou artistas favoritos'),
  mood: z.string().optional().describe('Humor ou sentimento atual'),
});

export const ChatResponseSchema = z.object({
  message: z.string().describe('A resposta conversacional para o usuário'),
  preferences: UserPreferencesSchema.optional().describe('Preferências extraídas desta mensagem'),
  shouldSavePreferences: z.boolean().describe('Se as preferências extraídas devem ser salvas'),
});

export const getSystemPrompt = (userContext?: string) => {
  return JSON.stringify({
    role: 'Assistente musical entusiasta e amigável - caloroso, conversacional (2-4 frases)',

    tarefas: [
      'Conversar sobre preferências musicais e fazer recomendações personalizadas',
      'Extrair informações do usuário (nome, gêneros, bandas, humor)',
      'SEMPRE recomendar músicas específicas baseado no que sabe do usuário',
    ],

    preferencias_previamente_armazenadas: userContext || 'Nenhuma',

    regras_de_extracao: {
      shouldSavePreferences: 'Defina como true APENAS quando o USUÁRIO compartilhar NOVAS informações na mensagem atual',
      extrair_somente: 'Informações que o USUÁRIO declarou explicitamente',
      nunca_extrair: 'Músicas, bandas ou artistas que VOCÊ (IA) recomendou - apenas o que o USUÁRIO disse gostar',
    },

    exemplos: [
      {
        usuario: 'Oi! Meu nome é Alex e eu amo música rock',
        resposta: {
          message: 'E aí, Alex! Recomendo "Everlong" do Foo Fighters!',
          preferences: { name: 'Alex', favoriteGenres: ['rock'] },
          shouldSavePreferences: true,
        },
      },
      {
        // Contra-exemplo: o risco de contaminação entre recomendação da IA e preferência do usuário.
        usuario: 'Gostei dessas recomendações!',
        contexto: 'IA acabou de recomendar Foo Fighters e Def Leppard',
        resposta: {
          message: 'Que ótimo! Quer mais recomendações de rock ou outro gênero?',
          preferences: null,
          shouldSavePreferences: false,
        },
        nota_importante: 'NÃO extraia "Foo Fighters" ou "Def Leppard" como preferência - foram recomendações da IA, não escolhas do usuário',
      },
    ],
  });
};

export const getUserPromptTemplate = (userMessage: string, conversationHistory?: string) => {
  return JSON.stringify({
    contexto_da_conversa: conversationHistory || 'Primeira mensagem',
    mensagem_atual_do_usuario: userMessage,
    instrucoes: [
      'Gere uma resposta calorosa em Português',
      'SEMPRE inclua recomendações específicas quando relevante',
      'Extraia quaisquer preferências compartilhadas',
      'Defina o flag shouldSavePreferences apropriadamente',
    ],
  });
};
```

---

## 2. Classificação de intenção com dados de referência injetados

**Demonstra:** injeção de dado dinâmico (`professionals`) em vez de hardcode, `extraction_instructions` um-por-campo, `current_date` gerado dentro da função, exemplos cobrindo cada valor do enum.

```ts
import { z } from 'zod';

export const IntentSchema = z.object({
  intent: z.enum(['schedule', 'cancel', 'list_professionals', 'unknown']).describe('A intenção do usuário'),
  professionalId: z.number().optional().describe('ID do profissional mencionado'),
  datetime: z.string().optional().describe('Data e hora do agendamento em formato ISO'),
  specialty: z.string().optional().describe('Especialidade médica mencionada, se houver'),
});

// `professionals` é sempre injetado por quem chama — nunca hardcoded aqui dentro.
export const getSystemPrompt = (professionals: { id: number; name: string; specialty: string }[]) => {
  return JSON.stringify({
    role: 'Classificador de intenção para agendamento de consultas',
    task: 'Identificar a intenção do usuário e extrair todos os detalhes relevantes',
    professionals: professionals.map((p) => ({ id: p.id, name: p.name, specialty: p.specialty })),
    current_date: new Date().toISOString(),

    rules: {
      schedule: {
        description: 'Usuário quer marcar uma nova consulta',
        required_fields: ['professionalId', 'datetime'],
      },
      list_professionals: {
        description: 'Usuário quer saber quais profissionais estão disponíveis',
        optional_fields: ['specialty'],
      },
      unknown: {
        description: 'Qualquer coisa não relacionada a agendar/cancelar/consultar',
      },
    },

    // Uma instrução por campo do schema — nunca deixe implícito como extrair.
    extraction_instructions: {
      professionalId: 'Combine o nome mencionado com o ID na lista `professionals`. Use fuzzy matching.',
      datetime: 'Converta datas relativas (hoje, amanhã) para ISO usando `current_date` como referência.',
      specialty: 'Extraia a especialidade mencionada pelo usuário, se houver.',
    },

    examples: [
      {
        input: 'Quero marcar com o Dr. Silva amanhã às 16h',
        output: { intent: 'schedule', professionalId: 1, datetime: '2026-03-02T16:00:00.000Z' },
      },
      {
        input: 'Quais cardiologistas vocês têm?',
        output: { intent: 'list_professionals', specialty: 'Cardiologia' },
      },
      {
        input: 'Como está o tempo hoje?',
        output: { intent: 'unknown' },
      },
    ],
  });
};

export const getUserPromptTemplate = (question: string) => {
  return JSON.stringify({
    question,
    instructions: [
      'Analise a pergunta para determinar a intenção',
      'Extraia todos os detalhes relevantes',
      'Converta datas e horários para formato ISO',
      'Retorne apenas os campos presentes na pergunta',
    ],
  });
};
```

---

## 3. Geração de mensagem final por cenário (`scenario` + `details`)

**Demonstra:** um prompt de "redação" (não extrai nada, só gera texto), guiado por um `scenario` explícito + dicionário de exemplos por cenário, e uma regra anti-alucinação explícita (`hasProfessionals`) para impedir o modelo de inventar ou negar dados que já existem.

```ts
import { z } from 'zod';

export const MessageSchema = z.object({
  message: z.string().min(10).describe('Mensagem clara e amigável para o usuário'),
});

export const getSystemPrompt = () => {
  return JSON.stringify({
    role: 'Recepcionista médico(a) simpático(a)',
    task: 'Gerar mensagens claras, profissionais e empáticas para pacientes',
    tone: 'Profissional mas caloroso, claro e conciso, empático',

    scenarios: {
      schedule_success: 'Confirme o agendamento com todos os detalhes',
      schedule_error: 'Peça desculpas e explique por que o agendamento falhou',
      list_professionals_success: 'Apresente a lista de profissionais disponíveis (em details.professionals)',
      unknown: 'Explique educadamente que só pode ajudar com agendamentos',
    },
  });
};

export const getUserPromptTemplate = (data: { scenario: string; details: any }) => {
  return JSON.stringify({
    scenario: data.scenario,
    details: data.details,
    instructions: [
      'Gere uma mensagem apropriada para o cenário informado',
      'Inclua todos os detalhes relevantes do objeto details',
      // Regra anti-alucinação: força o modelo a respeitar um dado de controle vindo do código,
      // em vez de "decidir sozinho" se algo foi encontrado ou não.
      'Se details.hasProfessionals for true, details.professionals NÃO está vazio: você DEVE listar esses profissionais. Nunca diga que nenhum foi encontrado quando hasProfessionals é true',
      'Se details.hasProfessionals for false, diga claramente que nenhum profissional correspondente foi encontrado',
    ],
    examples: {
      schedule_success: 'Sua consulta com o Dr. Silva em 12/03 às 16h foi confirmada. Aguardamos sua visita!',
      unknown: 'Posso ajudar a agendar ou cancelar consultas, ou listar profissionais disponíveis. Como posso ajudar?',
    },
  });
};
```

---

## 4. Sumarização incremental (merge com estado anterior)

**Demonstra:** o `user prompt` recebendo um resultado anterior (`sumario_anterior`) como parâmetro explícito para permitir merge incremental, em vez de reprocessar a conversa inteira do zero a cada chamada.

```ts
import { z } from 'zod';

export const SummarySchema = z.object({
  favoriteGenres: z.array(z.string()).optional().describe('Todos os gêneros mencionados'),
  keyPreferences: z.string().describe('Sumário conciso de 2-4 frases sobre gostos e contexto'),
});

export type ConversationSummary = z.infer<typeof SummarySchema>;

export const getSummarizationSystemPrompt = () => {
  return JSON.stringify({
    role: 'Sumarizador de conversação para preferências musicais',
    tarefa: 'Analisar a conversa e extrair preferências musicais estruturadas',
    regras: [
      'Combinar informações duplicadas',
      'Se atualizando sumário anterior, preservar info não discutida na nova conversa',
      'Incluir apenas informações explicitamente declaradas',
    ],
  });
};

export const getSummarizationUserPrompt = (
  conversationHistory: Array<{ role: string; content: string }>,
  previousSummary?: ConversationSummary,
) => {
  return JSON.stringify({
    conversa: conversationHistory.map((msg) => `${msg.role}: ${msg.content}`).join('\n'),
    sumario_anterior: previousSummary || 'Nenhum',
    instrucoes: [
      'Atualizar o sumário com novas informações desta conversa',
      'Preservar informação existente não discutida nas novas mensagens',
    ],
  });
};
```

---

## O que os quatro exemplos têm em comum

- Schema definido antes do prompt, cada campo com `.describe()`.
- `getSystemPrompt` nunca recebe a mensagem do turno atual — só config/contexto/dados de referência.
- `getUserPromptTemplate` sempre inclui um array de instruções explícito, mesmo repetindo algo do system.
- Quando há risco de ambiguidade (exemplo 1) ou de alucinação (exemplo 3), existe uma regra ou exemplo *anotado* tratando especificamente desse risco — não se assume que o modelo vai acertar sozinho.
