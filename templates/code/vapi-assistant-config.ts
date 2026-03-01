/**
 * VAPI Assistant Configuration
 * CodeBakers Agent System — Code Template
 *
 * Usage: Copy to lib/vapi/assistant-config.ts
 * Requires: VAPI account + API key, phone number provisioned in VAPI dashboard
 *
 * Features:
 * - Complete assistant configuration with model, voice, and transcriber
 * - Tool definitions for common actions (booking, transfer, lookup)
 * - Server-side assistant creation and update via VAPI API
 * - Phone number assignment
 * - Dynamic variable injection for per-call context
 * - Conversation hooks (first message, end call, voicemail)
 * - Type-safe configuration with full interface definitions
 */

// ─── Types ────────────────────────────────────────────────

interface VapiAssistantConfig {
  name: string;
  model: VapiModelConfig;
  voice: VapiVoiceConfig;
  transcriber: VapiTranscriberConfig;
  firstMessage: string;
  firstMessageMode?: 'assistant-speaks-first' | 'assistant-waits-for-user';
  endCallMessage?: string;
  endCallFunctionEnabled: boolean;
  silenceTimeoutSeconds: number;
  maxDurationSeconds: number;
  backgroundSound?: 'off' | 'office';
  backgroundDenoisingEnabled?: boolean;
  hipaaEnabled?: boolean;
  recordingEnabled?: boolean;
  serverUrl?: string;
  serverUrlSecret?: string;
  metadata?: Record<string, string>;
  tools?: VapiToolDefinition[];
}

interface VapiModelConfig {
  provider: 'anthropic' | 'openai' | 'together-ai' | 'custom-llm';
  model: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  emotionRecognitionEnabled?: boolean;
}

interface VapiVoiceConfig {
  provider: '11labs' | 'playht' | 'deepgram' | 'azure';
  voiceId: string;
  speed?: number;
  stability?: number;
  similarityBoost?: number;
}

interface VapiTranscriberConfig {
  provider: 'deepgram' | 'assembly-ai' | 'google';
  model?: string;
  language?: string;
  keywords?: string[]; // Boost recognition of specific words
}

interface VapiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required?: string[];
    };
  };
  /** Where VAPI sends tool call requests */
  server?: {
    url: string;
    secret?: string;
  };
  /** Use 'transferCall' type for call transfers */
  destinations?: {
    type: 'number' | 'sip';
    number?: string;
    sipUri?: string;
    description: string;
  }[];
}

interface VapiPhoneCallConfig {
  assistantId: string;
  phoneNumberId: string;
  customer: {
    number: string; // E.164 format: +1XXXXXXXXXX
    name?: string;
  };
  assistantOverrides?: {
    variableValues?: Record<string, string>;
    firstMessage?: string;
    model?: Partial<VapiModelConfig>;
  };
}

// ─── Voice Presets ────────────────────────────────────────

const VOICE_PRESETS = {
  professional_female: {
    provider: '11labs' as const,
    voiceId: 'rachel',
    stability: 0.6,
    similarityBoost: 0.75,
  },
  professional_male: {
    provider: '11labs' as const,
    voiceId: 'josh',
    stability: 0.6,
    similarityBoost: 0.75,
  },
  friendly_female: {
    provider: '11labs' as const,
    voiceId: 'sarah',
    stability: 0.5,
    similarityBoost: 0.8,
  },
  friendly_male: {
    provider: '11labs' as const,
    voiceId: 'adam',
    stability: 0.5,
    similarityBoost: 0.8,
  },
};

// ─── Common Tool Definitions ──────────────────────────────

const COMMON_TOOLS = {
  bookAppointment: {
    type: 'function' as const,
    function: {
      name: 'book_appointment',
      description: 'Book an appointment or meeting for the caller. Use when the caller wants to schedule something.',
      parameters: {
        type: 'object' as const,
        properties: {
          caller_name: {
            type: 'string',
            description: "The caller's full name",
          },
          phone_number: {
            type: 'string',
            description: "The caller's phone number for confirmation",
          },
          preferred_date: {
            type: 'string',
            description: 'Preferred date in YYYY-MM-DD format',
          },
          preferred_time: {
            type: 'string',
            description: 'Preferred time in HH:MM format (24hr)',
          },
          reason: {
            type: 'string',
            description: 'Brief reason for the appointment',
          },
        },
        required: ['caller_name', 'preferred_date', 'preferred_time'],
      },
    },
    server: {
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/tools`,
      secret: process.env.VAPI_TOOL_SECRET,
    },
  },

  lookupAccount: {
    type: 'function' as const,
    function: {
      name: 'lookup_account',
      description: 'Look up a customer account by phone number or account number.',
      parameters: {
        type: 'object' as const,
        properties: {
          phone_number: {
            type: 'string',
            description: 'Customer phone number',
          },
          account_number: {
            type: 'string',
            description: 'Customer account number',
          },
        },
        required: [],
      },
    },
    server: {
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/tools`,
      secret: process.env.VAPI_TOOL_SECRET,
    },
  },

  createTicket: {
    type: 'function' as const,
    function: {
      name: 'create_support_ticket',
      description: 'Create a support ticket for issues that cannot be resolved on the call.',
      parameters: {
        type: 'object' as const,
        properties: {
          caller_name: {
            type: 'string',
            description: "Caller's name",
          },
          issue_summary: {
            type: 'string',
            description: 'Brief description of the issue',
          },
          priority: {
            type: 'string',
            description: 'Ticket priority level',
            enum: ['low', 'medium', 'high', 'urgent'],
          },
          callback_number: {
            type: 'string',
            description: 'Number to call back on',
          },
        },
        required: ['caller_name', 'issue_summary', 'priority'],
      },
    },
    server: {
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/tools`,
      secret: process.env.VAPI_TOOL_SECRET,
    },
  },

  transferCall: {
    type: 'function' as const,
    function: {
      name: 'transfer_call',
      description: 'Transfer the caller to a specific department or person. Use when the caller needs human help or requests a specific department.',
      parameters: {
        type: 'object' as const,
        properties: {
          department: {
            type: 'string',
            description: 'Department to transfer to',
            enum: ['sales', 'support', 'billing', 'manager'],
          },
          reason: {
            type: 'string',
            description: 'Why the transfer is needed (passed to receiving agent)',
          },
        },
        required: ['department'],
      },
    },
    // Transfer destinations configured per deployment
    destinations: [
      { type: 'number' as const, number: process.env.TRANSFER_SALES, description: 'Sales department' },
      { type: 'number' as const, number: process.env.TRANSFER_SUPPORT, description: 'Support department' },
      { type: 'number' as const, number: process.env.TRANSFER_BILLING, description: 'Billing department' },
      { type: 'number' as const, number: process.env.TRANSFER_MANAGER, description: 'Manager on duty' },
    ],
  },
};

// ─── System Prompt Templates ──────────────────────────────

const SYSTEM_PROMPTS = {
  receptionist: (businessName: string, businessHours: string, services: string) => `
You are a professional, friendly receptionist for ${businessName}.

YOUR JOB:
- Greet callers warmly
- Determine their need quickly
- Route them to the right action (schedule, answer, or transfer)

BUSINESS INFO:
- Hours: ${businessHours}
- Services: ${services}

RULES:
- Keep responses under 2 sentences — this is a phone call, not an essay
- If you can schedule an appointment, use the book_appointment tool
- If you can't help, use transfer_call to connect them with a person
- Never make up pricing, availability, or policies
- If asked something you don't know, say "Let me connect you with someone who can help with that"
- Always confirm details before booking (name, date, time)
- Be warm but efficient — respect the caller's time
`.trim(),

  leadQualifier: (businessName: string, qualifyingQuestions: string) => `
You are an AI sales assistant for ${businessName}.

YOUR JOB:
- Engage interested callers warmly
- Ask qualifying questions naturally (don't interrogate)
- If they're a good fit, schedule a meeting with the sales team
- If they're not ready, offer to send information

QUALIFYING QUESTIONS:
${qualifyingQuestions}

RULES:
- Keep it conversational — this is a phone call
- Ask ONE question at a time, wait for the answer
- Don't be pushy — if they're not interested, thank them and end gracefully
- Once qualified, use book_appointment to schedule with sales
- Never discuss pricing — that's for the sales meeting
- If they have technical questions, use transfer_call to connect with support
`.trim(),

  supportAgent: (businessName: string, knowledgeBase: string) => `
You are a helpful support agent for ${businessName}.

YOUR JOB:
- Help callers resolve their issues
- Use the knowledge base to answer questions accurately
- Create tickets for issues you can't resolve
- Transfer to a human when needed

KNOWLEDGE BASE:
${knowledgeBase}

RULES:
- Be empathetic — the caller has a problem and wants help
- Keep responses clear and actionable
- If the answer is in the knowledge base, use it verbatim
- If you're unsure, say so and create a ticket rather than guessing
- For billing disputes, always transfer to billing (never resolve yourself)
- For urgent/safety issues, transfer to manager immediately
- Confirm resolution before ending: "Is there anything else I can help with?"
`.trim(),
};

// ─── Assistant Builder ────────────────────────────────────

function buildAssistant(
  type: 'receptionist' | 'leadQualifier' | 'supportAgent',
  options: {
    businessName: string;
    voice?: keyof typeof VOICE_PRESETS;
    tools?: (keyof typeof COMMON_TOOLS)[];
    firstMessage?: string;
    maxDurationMinutes?: number;
    recordCalls?: boolean;
    /** Extra context injected into system prompt */
    extraContext?: string;
    /** HIPAA mode for healthcare */
    hipaa?: boolean;
  }
): VapiAssistantConfig {
  const voice = VOICE_PRESETS[options.voice || 'professional_female'];
  const tools = (options.tools || ['bookAppointment', 'transferCall']).map(
    (t) => COMMON_TOOLS[t]
  );

  // Build system prompt based on type
  let systemPrompt: string;
  switch (type) {
    case 'receptionist':
      systemPrompt = SYSTEM_PROMPTS.receptionist(
        options.businessName,
        options.extraContext || 'Monday-Friday 9am-5pm',
        'General services'
      );
      break;
    case 'leadQualifier':
      systemPrompt = SYSTEM_PROMPTS.leadQualifier(
        options.businessName,
        options.extraContext || '- What problem are you trying to solve?\n- What is your timeline?\n- What is your budget range?'
      );
      break;
    case 'supportAgent':
      systemPrompt = SYSTEM_PROMPTS.supportAgent(
        options.businessName,
        options.extraContext || 'No knowledge base configured.'
      );
      break;
  }

  return {
    name: `${options.businessName} - ${type}`,
    model: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt,
      temperature: 0.3, // Low for consistency, not zero for natural conversation
      maxTokens: 300, // Short responses for voice
    },
    voice,
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'en',
      keywords: [options.businessName], // Boost recognition of business name
    },
    firstMessage:
      options.firstMessage ||
      `Hi, thanks for calling ${options.businessName}! How can I help you today?`,
    endCallMessage: 'Thanks for calling. Have a great day!',
    endCallFunctionEnabled: true,
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: (options.maxDurationMinutes || 10) * 60,
    backgroundDenoisingEnabled: true,
    recordingEnabled: options.recordCalls ?? true,
    hipaaEnabled: options.hipaa ?? false,
    serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/webhook`,
    serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
    tools,
  };
}

// ─── VAPI API Client ──────────────────────────────────────

const VAPI_BASE = 'https://api.vapi.ai';

async function vapiRequest(path: string, method: string, body?: unknown) {
  const response = await fetch(`${VAPI_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`VAPI API error (${response.status}): ${error.message || JSON.stringify(error)}`);
  }

  return response.json();
}

/** Create a new assistant in VAPI */
async function createAssistant(config: VapiAssistantConfig) {
  return vapiRequest('/assistant', 'POST', config);
}

/** Update an existing assistant */
async function updateAssistant(assistantId: string, updates: Partial<VapiAssistantConfig>) {
  return vapiRequest(`/assistant/${assistantId}`, 'PATCH', updates);
}

/** Get assistant details */
async function getAssistant(assistantId: string) {
  return vapiRequest(`/assistant/${assistantId}`, 'GET');
}

/** Delete an assistant */
async function deleteAssistant(assistantId: string) {
  return vapiRequest(`/assistant/${assistantId}`, 'DELETE');
}

/** Assign a phone number to an assistant */
async function assignPhoneNumber(phoneNumberId: string, assistantId: string) {
  return vapiRequest(`/phone-number/${phoneNumberId}`, 'PATCH', {
    assistantId,
  });
}

/** Initiate an outbound call */
async function makeOutboundCall(config: VapiPhoneCallConfig) {
  return vapiRequest('/call/phone', 'POST', config);
}

/** Get call details */
async function getCall(callId: string) {
  return vapiRequest(`/call/${callId}`, 'GET');
}

/** List recent calls */
async function listCalls(limit = 50) {
  return vapiRequest(`/call?limit=${limit}`, 'GET');
}

// ─── Phone Number Helpers ─────────────────────────────────

/** Normalize phone number to E.164 format */
function normalizePhoneNumber(phone: string): string {
  // Strip all non-numeric characters
  const digits = phone.replace(/\D/g, '');

  // Handle US numbers
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  // Already has country code
  if (phone.startsWith('+')) return phone.replace(/[^\d+]/g, '');

  throw new Error(`Cannot normalize phone number: ${phone}`);
}

// ─── Exports ──────────────────────────────────────────────

export {
  buildAssistant,
  createAssistant,
  updateAssistant,
  getAssistant,
  deleteAssistant,
  assignPhoneNumber,
  makeOutboundCall,
  getCall,
  listCalls,
  normalizePhoneNumber,
  VOICE_PRESETS,
  COMMON_TOOLS,
  SYSTEM_PROMPTS,
  type VapiAssistantConfig,
  type VapiPhoneCallConfig,
  type VapiToolDefinition,
};

// ─── Usage Example ────────────────────────────────────────
//
// import { buildAssistant, createAssistant, assignPhoneNumber } from '@/lib/vapi/assistant-config';
//
// // 1. Build config
// const config = buildAssistant('receptionist', {
//   businessName: 'Acme Law Firm',
//   voice: 'professional_female',
//   tools: ['bookAppointment', 'transferCall', 'lookupAccount'],
//   firstMessage: 'Thank you for calling Acme Law Firm. How may I direct your call?',
//   maxDurationMinutes: 15,
//   recordCalls: true,
//   extraContext: 'Monday-Friday 8:30am-5:30pm CST. Practice areas: Personal Injury, Family Law, Estate Planning.',
// });
//
// // 2. Create in VAPI
// const assistant = await createAssistant(config);
// console.log('Created assistant:', assistant.id);
//
// // 3. Assign phone number
// await assignPhoneNumber('your-phone-number-id', assistant.id);
//
// // 4. Make an outbound call
// await makeOutboundCall({
//   assistantId: assistant.id,
//   phoneNumberId: 'your-phone-number-id',
//   customer: { number: '+15551234567', name: 'John Doe' },
//   assistantOverrides: {
//     variableValues: { appointment_date: '2025-03-15', appointment_time: '2:00 PM' },
//     firstMessage: 'Hi John, this is a reminder about your appointment tomorrow at 2 PM.',
//   },
// });
