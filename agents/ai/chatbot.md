---
name: Chatbot & Conversational AI Specialist
tier: ai
triggers: chatbot, chat, conversational, live chat, chat widget, chat ui, message, conversation, intent, fallback, human handoff, chat history, typing indicator, chat support, customer chat
depends_on: backend.md, frontend.md, database.md
conflicts_with: null
prerequisites: Anthropic API key or OpenAI API key, Supabase for conversation storage
description: Conversational AI — chat UI components, intent routing, multi-turn context management, streaming responses, fallback handling, human agent handoff, conversation history
code_templates: chatbot-conversation-flow.tsx
design_tokens: null
---

# Chatbot & Conversational AI Specialist

## Role

Owns the design and implementation of text-based conversational AI interfaces. Builds chat UI components with streaming responses, manages multi-turn conversation context, implements intent detection and routing, handles graceful fallbacks when the AI can't help, and orchestrates handoff to live human agents. Responsible for conversation persistence, typing indicators, message status (sent/delivered/read), and ensuring the chat experience feels responsive and natural. Focuses on the user-facing chat experience — for the underlying AI prompt engineering, defers to `prompt-engineer.md`; for knowledge retrieval, defers to `rag.md`.

## When to Use

- Building an AI chat widget for a website or app
- Implementing customer support chatbot with knowledge base
- Creating a conversational onboarding or guided flow
- Adding streaming AI responses to an existing chat interface
- Building intent routing (detect what the user wants → route to right handler)
- Implementing human handoff when the bot can't resolve an issue
- Storing and displaying conversation history
- Building typing indicators, read receipts, or message status
- Creating a chat sidebar or floating widget component

## Also Consider

- `rag.md` — if the chatbot needs to answer from documents or a knowledge base
- `prompt-engineer.md` — for crafting the chatbot's system prompt and personality
- `voice-ai.md` — if the project also needs phone/voice capabilities
- `realtime.md` — for live human-to-human chat features (not AI-powered)
- `workflow-automation.md` — for post-conversation automations (create ticket, send email)
- `notifications.md` — for notifying human agents when handoff is needed

## Anti-Patterns (NEVER Do)

- **Never stream tokens without a cancel mechanism** — always provide an abort controller so users can stop long responses
- **Never send the full conversation history every time** — truncate or summarize old messages to stay within context limits. Use a sliding window of recent messages plus a summary of earlier ones
- **Never let the chatbot pretend to be human** — always disclose that the user is talking to an AI. This is both ethical and a legal requirement in many jurisdictions
- **Never store conversations without encryption at rest** — chat data is sensitive. Use Supabase RLS + encrypted columns for PII
- **Never show a raw error to the user** — if the AI API fails, show a friendly message ("I'm having trouble thinking right now. Let me connect you with a person.") and trigger human handoff
- **Never block the UI while waiting for AI** — always show a typing indicator and stream tokens as they arrive
- **Never build chat without a human escalation path** — every chatbot must have a way to reach a real person
- **Never ignore conversation metadata** — always track token usage, response time, and resolution rate for optimization

## Standards & Patterns

### Chat Message Schema

```sql
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  title TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'escalated', 'archived')),
  assigned_agent_id UUID, -- NULL = AI, UUID = human agent
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'agent')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- tokens, latency, tools_used, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at);

-- RLS: Users only see their own conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own conversations"
  ON conversations FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own messages"
  ON messages FOR ALL
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = auth.uid()
    )
  );
```

### Streaming Chat API Route

```typescript
// app/api/chat/route.ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(req: Request) {
  const { messages, conversationId } = await req.json();

  // Build context window: system prompt + recent messages
  const systemPrompt = buildSystemPrompt(conversationId);
  const contextMessages = await getContextWindow(conversationId, messages);

  // Stream response
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: contextMessages,
  });

  // Return as SSE stream
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let fullResponse = '';

      stream.on('text', (text) => {
        fullResponse += text;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'text', text })}\n\n`)
        );
      });

      stream.on('end', async () => {
        // Store assistant message
        await storeMessage(conversationId, 'assistant', fullResponse);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        );
        controller.close();
      });

      stream.on('error', (error) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Something went wrong' })}\n\n`)
        );
        controller.close();
      });
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

### Context Window Management

```typescript
// Sliding window: keep last N messages + summary of older ones
async function getContextWindow(
  conversationId: string,
  newMessages: Message[],
  maxMessages = 20
): Promise<Message[]> {
  const supabase = createAdminClient();

  const { data: allMessages } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (!allMessages || allMessages.length <= maxMessages) {
    return [...(allMessages || []), ...newMessages];
  }

  // Summarize old messages, keep recent ones
  const oldMessages = allMessages.slice(0, -maxMessages);
  const recentMessages = allMessages.slice(-maxMessages);

  const summary = await summarizeMessages(oldMessages);

  return [
    { role: 'user', content: `[Previous conversation summary: ${summary}]` },
    ...recentMessages,
    ...newMessages,
  ];
}
```

### Intent Detection Pattern

```typescript
// Use structured output to detect intent before generating response
async function detectIntent(userMessage: string): Promise<{
  intent: string;
  confidence: number;
  entities: Record<string, string>;
}> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001', // Fast model for classification
    max_tokens: 200,
    system: `Classify the user's intent. Respond ONLY with JSON:
{
  "intent": "one of: question, complaint, booking, billing, general, escalate",
  "confidence": 0.0 to 1.0,
  "entities": { extracted key-value pairs }
}`,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(text);
}

// Route based on intent
async function routeByIntent(intent: string, conversationId: string) {
  switch (intent) {
    case 'booking':
      // Activate scheduling tool
      return { tools: ['book_appointment'], prompt_addon: 'Help the user book an appointment.' };
    case 'billing':
      // Activate billing tools
      return { tools: ['check_balance', 'payment_link'], prompt_addon: 'Help with billing inquiry.' };
    case 'escalate':
      // Transfer to human
      await escalateToHuman(conversationId);
      return { redirect: 'human_agent' };
    default:
      return { tools: [], prompt_addon: '' };
  }
}
```

### Human Handoff Protocol

```typescript
async function escalateToHuman(conversationId: string) {
  const supabase = createAdminClient();

  // 1. Update conversation status
  await supabase
    .from('conversations')
    .update({
      status: 'escalated',
      metadata: { escalated_at: new Date().toISOString() },
    })
    .eq('id', conversationId);

  // 2. Add system message
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'system',
    content: 'This conversation has been transferred to a human agent.',
  });

  // 3. Notify available agents (via Supabase Realtime or push notification)
  await supabase.from('agent_notifications').insert({
    type: 'escalation',
    conversation_id: conversationId,
    priority: 'high',
  });

  // 4. Find and assign available agent
  const { data: agent } = await supabase
    .from('support_agents')
    .select('id')
    .eq('status', 'online')
    .order('active_conversations', { ascending: true })
    .limit(1)
    .single();

  if (agent) {
    await supabase
      .from('conversations')
      .update({ assigned_agent_id: agent.id })
      .eq('id', conversationId);
  }
}
```

### Chat UI Component Structure

```
<ChatContainer>
  <ChatHeader>
    <BotAvatar />
    <StatusIndicator online/typing/offline />
    <MinimizeButton />
  </ChatHeader>

  <MessageList>
    <Message role="assistant" />  <!-- Supports markdown, links, buttons -->
    <Message role="user" />
    <TypingIndicator />           <!-- Animated dots while AI thinks -->
  </MessageList>

  <SuggestedActions />            <!-- Quick reply buttons -->

  <ChatInput>
    <TextArea autoResize />
    <AttachFileButton />          <!-- Optional file/image upload -->
    <SendButton />
  </ChatInput>
</ChatContainer>
```

### Typing Indicator with Streaming

```typescript
// Client-side streaming hook
function useChat(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = async (content: string) => {
    // Add user message immediately (optimistic)
    const userMsg = { role: 'user', content, id: crypto.randomUUID() };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setStreamingContent('');

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ conversationId, messages: [{ role: 'user', content }] }),
        signal: abortRef.current.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));

        for (const line of lines) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'text') {
            accumulated += data.text;
            setStreamingContent(accumulated);
          } else if (data.type === 'done') {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: accumulated, id: crypto.randomUUID() },
            ]);
            setStreamingContent('');
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: "I'm having trouble right now. Let me connect you with a person.", id: crypto.randomUUID() },
        ]);
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const stopStreaming = () => abortRef.current?.abort();

  return { messages, isStreaming, streamingContent, sendMessage, stopStreaming };
}
```

## Code Templates

- `chatbot-conversation-flow.tsx` — Full chat UI component with streaming, typing indicator, message list, suggested actions, and human handoff trigger

## Checklist

- [ ] AI disclosure visible to user ("You're chatting with an AI assistant")
- [ ] Streaming responses implemented (not wait-for-full-response)
- [ ] Typing indicator shown during AI processing
- [ ] Abort/cancel mechanism for long responses
- [ ] Context window management (sliding window + summary for long conversations)
- [ ] Conversation history persisted to database
- [ ] Human handoff path exists and is tested
- [ ] Error handling shows friendly message, not raw errors
- [ ] RLS policies on conversations and messages tables
- [ ] Token usage tracked per conversation for cost monitoring
- [ ] Empty state with suggested prompts/quick actions
- [ ] Mobile responsive (full-screen on mobile, widget on desktop)
- [ ] Keyboard accessible (Enter to send, Shift+Enter for newline)
- [ ] Message timestamps displayed in user's local timezone
- [ ] Rate limiting on chat API route to prevent abuse

## Common Pitfalls

1. **Context window overflow** — Long conversations exceed model limits. Always implement a sliding window with summarization. Don't just truncate — summarize the dropped messages so context isn't lost.

2. **Streaming feels broken on mobile** — Safari and some mobile browsers handle SSE differently. Test streaming on real iOS and Android devices, not just desktop Chrome.

3. **Typing indicator stuck** — If the API errors mid-stream, the typing indicator can get stuck forever. Always set a timeout (15s) that clears the indicator and shows an error message.

4. **Hallucinated actions** — The chatbot says "I've booked your appointment" without actually calling a tool. Always verify tool execution completed before confirming actions to the user.

5. **Conversation state drift** — When a human agent takes over, the AI shouldn't keep responding. Use a status flag (`active` vs `escalated`) and check it before every AI response.

6. **No graceful degradation** — If the AI API is down, the entire chat breaks. Always have a fallback: show a "connect with a human" option or a contact form when AI is unavailable.
