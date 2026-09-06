# Complete examples of `getSystemPrompt` + `getUserPromptTemplate`

Four real examples (generalized from production prompts), each with a note on what it demonstrates well. Use them as a structural reference; do not copy the domain (music, medical appointments) if it is not yours — what matters is the pattern.

---

## 1. Preference extraction in a chat (open-ended conversation)

**Demonstrates:** an explicit "what never to extract" rule, an annotated counter-example, a deterministic boolean flag.

```ts
import { z } from 'zod';

export const UserPreferencesSchema = z.object({
  name: z.string().optional().describe("The user's name"),
  favoriteGenres: z.array(z.string()).optional().describe('Favorite music genres'),
  favoriteBands: z.array(z.string()).optional().describe('Favorite bands or artists'),
  mood: z.string().optional().describe('Current mood or feeling'),
});

export const ChatResponseSchema = z.object({
  message: z.string().describe('The conversational reply to the user'),
  preferences: UserPreferencesSchema.optional().describe('Preferences extracted from this message'),
  shouldSavePreferences: z.boolean().describe('Whether the extracted preferences should be saved'),
});

export const getSystemPrompt = (userContext?: string) => {
  return JSON.stringify({
    role: 'Enthusiastic, friendly music assistant - warm, conversational (2-4 sentences)',

    tasks: [
      'Chat about music preferences and make personalized recommendations',
      'Extract information about the user (name, genres, bands, mood)',
      'ALWAYS recommend specific songs based on what you know about the user',
    ],

    previously_stored_preferences: userContext || 'None',

    extraction_rules: {
      shouldSavePreferences: 'Set to true ONLY when the USER shares NEW information in the current message',
      extract_only: 'Information the USER explicitly stated',
      never_extract: 'Songs, bands, or artists that YOU (the AI) recommended - only what the USER said they like',
    },

    examples: [
      {
        user: "Hi! My name is Alex and I love rock music",
        response: {
          message: 'Hey Alex! I recommend "Everlong" by Foo Fighters!',
          preferences: { name: 'Alex', favoriteGenres: ['rock'] },
          shouldSavePreferences: true,
        },
      },
      {
        // Counter-example: the risk of cross-contamination between an AI
        // recommendation and an actual user preference.
        user: 'I liked those recommendations!',
        context: 'The AI has just recommended Foo Fighters and Def Leppard',
        response: {
          message: 'Awesome! Want more rock recommendations, or a different genre?',
          preferences: null,
          shouldSavePreferences: false,
        },
        important_note: 'Do NOT extract "Foo Fighters" or "Def Leppard" as preferences - they were AI recommendations, not the user\'s own picks',
      },
    ],
  });
};

export const getUserPromptTemplate = (userMessage: string, conversationHistory?: string) => {
  return JSON.stringify({
    conversation_context: conversationHistory || 'First message',
    current_user_message: userMessage,
    instructions: [
      'Generate a warm reply',
      'ALWAYS include specific recommendations when relevant',
      'Extract any preferences the user shared',
      'Set the shouldSavePreferences flag appropriately',
    ],
  });
};
```

---

## 2. Intent classification with injected reference data

**Demonstrates:** injecting dynamic data (`professionals`) instead of hardcoding it, one-per-field `extraction_instructions`, `current_date` generated inside the function, examples covering every enum value.

```ts
import { z } from 'zod';

export const IntentSchema = z.object({
  intent: z.enum(['schedule', 'cancel', 'list_professionals', 'unknown']).describe("The user's intent"),
  professionalId: z.number().optional().describe('ID of the professional mentioned'),
  datetime: z.string().optional().describe('Appointment date and time in ISO format'),
  specialty: z.string().optional().describe('Medical specialty mentioned, if any'),
});

// `professionals` is always injected by the caller — never hardcoded in here.
export const getSystemPrompt = (professionals: { id: number; name: string; specialty: string }[]) => {
  return JSON.stringify({
    role: 'Intent classifier for medical appointment scheduling',
    task: "Identify the user's intent and extract all relevant details",
    professionals: professionals.map((p) => ({ id: p.id, name: p.name, specialty: p.specialty })),
    current_date: new Date().toISOString(),

    rules: {
      schedule: {
        description: 'User wants to book a new appointment',
        required_fields: ['professionalId', 'datetime'],
      },
      list_professionals: {
        description: 'User wants to know which professionals are available',
        optional_fields: ['specialty'],
      },
      unknown: {
        description: 'Anything unrelated to scheduling/canceling/listing',
      },
    },

    // One instruction per schema field — never leave the extraction implicit.
    extraction_instructions: {
      professionalId: 'Match the mentioned name against the ID in the `professionals` list. Use fuzzy matching.',
      datetime: 'Convert relative dates (today, tomorrow) to ISO using `current_date` as the reference.',
      specialty: 'Extract the specialty the user mentioned, if any.',
    },

    examples: [
      {
        input: 'I want to book with Dr. Silva tomorrow at 4pm',
        output: { intent: 'schedule', professionalId: 1, datetime: '2026-03-02T16:00:00.000Z' },
      },
      {
        input: 'Which cardiologists do you have?',
        output: { intent: 'list_professionals', specialty: 'Cardiology' },
      },
      {
        input: "What's the weather like today?",
        output: { intent: 'unknown' },
      },
    ],
  });
};

export const getUserPromptTemplate = (question: string) => {
  return JSON.stringify({
    question,
    instructions: [
      'Analyze the question to determine the intent',
      'Extract all relevant details',
      'Convert dates and times to ISO format',
      'Return only the fields present in the question',
    ],
  });
};
```

---

## 3. Final message generation per scenario (`scenario` + `details`)

**Demonstrates:** a "writing" prompt (it extracts nothing, it only generates text), guided by an explicit `scenario` plus a per-scenario example dictionary, and an explicit anti-hallucination rule (`hasProfessionals`) that stops the model from inventing or denying data that already exists.

```ts
import { z } from 'zod';

export const MessageSchema = z.object({
  message: z.string().min(10).describe('Clear, friendly message for the user'),
});

export const getSystemPrompt = () => {
  return JSON.stringify({
    role: 'Friendly medical receptionist',
    task: 'Generate clear, professional, empathetic messages for patients',
    tone: 'Professional but warm, clear and concise, empathetic',

    scenarios: {
      schedule_success: 'Confirm the appointment with all the details',
      schedule_error: 'Apologize and explain why the booking failed',
      list_professionals_success: 'Present the list of available professionals (in details.professionals)',
      unknown: 'Politely explain that you can only help with appointments',
    },
  });
};

export const getUserPromptTemplate = (data: { scenario: string; details: any }) => {
  return JSON.stringify({
    scenario: data.scenario,
    details: data.details,
    instructions: [
      'Generate a message appropriate for the given scenario',
      'Include every relevant detail from the details object',
      // Anti-hallucination rule: forces the model to respect a control value coming
      // from the code, instead of "deciding for itself" whether something was found.
      'If details.hasProfessionals is true, details.professionals is NOT empty: you MUST list those professionals. Never say none were found when hasProfessionals is true',
      'If details.hasProfessionals is false, clearly say that no matching professional was found',
    ],
    examples: {
      schedule_success: 'Your appointment with Dr. Silva on March 12 at 4pm is confirmed. We look forward to seeing you!',
      unknown: 'I can help you book or cancel appointments, or list the available professionals. How can I help?',
    },
  });
};
```

---

## 4. Incremental summarization (merging with previous state)

**Demonstrates:** the `user prompt` receiving a previous result (`previous_summary`) as an explicit parameter to allow incremental merging, instead of reprocessing the whole conversation from scratch on every call.

```ts
import { z } from 'zod';

export const SummarySchema = z.object({
  favoriteGenres: z.array(z.string()).optional().describe('All genres mentioned'),
  keyPreferences: z.string().describe('Concise 2-4 sentence summary of tastes and context'),
});

export type ConversationSummary = z.infer<typeof SummarySchema>;

export const getSummarizationSystemPrompt = () => {
  return JSON.stringify({
    role: 'Conversation summarizer for music preferences',
    task: 'Analyze the conversation and extract structured music preferences',
    rules: [
      'Merge duplicate information',
      'When updating a previous summary, preserve info not discussed in the new conversation',
      'Include only information explicitly stated',
    ],
  });
};

export const getSummarizationUserPrompt = (
  conversationHistory: Array<{ role: string; content: string }>,
  previousSummary?: ConversationSummary,
) => {
  return JSON.stringify({
    conversation: conversationHistory.map((msg) => `${msg.role}: ${msg.content}`).join('\n'),
    previous_summary: previousSummary || 'None',
    instructions: [
      'Update the summary with new information from this conversation',
      'Preserve existing information not discussed in the new messages',
    ],
  });
};
```

---

## What all four examples have in common

- The schema is defined before the prompt, every field with a `.describe()`.
- `getSystemPrompt` never receives the current turn's message — only config/context/reference data.
- `getUserPromptTemplate` always includes an explicit instructions array, even when it repeats something from the system prompt.
- Where there is a risk of ambiguity (example 1) or hallucination (example 3), there is a rule or an *annotated* example dealing specifically with that risk — it is never assumed that the model will get it right on its own.
