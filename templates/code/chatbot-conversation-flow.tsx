/**
 * Chatbot Conversation Flow Component
 * CodeBakers Agent System — Code Template
 *
 * Usage: Import as a full-page chat or floating widget.
 * Requires: Anthropic API key (via /api/chat route), lucide-react, Supabase client
 *
 * Features:
 * - Streaming AI responses with real-time token rendering
 * - Typing indicator with animated dots
 * - Message list with role-based styling (user/assistant/system)
 * - Suggested quick actions / starter prompts
 * - Abort/cancel streaming mid-response
 * - Auto-scroll with "scroll to bottom" button
 * - Markdown rendering in assistant messages
 * - Human handoff trigger
 * - Conversation persistence to Supabase
 * - Floating widget mode (collapsible)
 * - Mobile-first responsive layout
 * - Accessible: keyboard nav, aria-live, focus management
 */

'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  Send,
  X,
  MessageCircle,
  Loader2,
  Square,
  ArrowDown,
  User,
  Bot,
  AlertCircle,
  PhoneForwarded,
  RotateCcw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
}

interface ChatbotProps {
  /** API endpoint for chat completions */
  apiEndpoint?: string;
  /** Conversation ID (for persistence — omit for new conversations) */
  conversationId?: string;
  /** Title shown in header */
  title?: string;
  /** Subtitle / status text */
  subtitle?: string;
  /** AI disclosure text */
  aiDisclosure?: string;
  /** Initial suggested prompts */
  suggestedPrompts?: string[];
  /** Placeholder text for the input */
  placeholder?: string;
  /** Enable floating widget mode (vs full page) */
  widget?: boolean;
  /** Show human handoff button */
  showHandoff?: boolean;
  /** Callback when user requests human agent */
  onRequestHandoff?: (conversationId: string) => void;
  /** Maximum message length */
  maxMessageLength?: number;
  /** Custom class names */
  className?: string;
  /** Avatar for assistant */
  assistantName?: string;
}

// ─── Markdown-lite Renderer ───────────────────────────────

function renderMarkdown(text: string): string {
  let html = text
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="chat-link">$1</a>')
    // Line breaks
    .replace(/\n/g, '<br />');

  return html;
}

// ─── Typing Indicator ─────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2" aria-label="Assistant is typing">
      <div className="flex gap-1">
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────

function MessageBubble({
  message,
  assistantName,
}: {
  message: Message;
  assistantName: string;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-primary' : 'bg-muted'
        }`}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-primary-foreground" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/70 text-foreground'
        }`}
      >
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <div
            className="chat-content prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        )}

        {/* Timestamp */}
        <p
          className={`mt-1 text-[10px] ${
            isUser ? 'text-primary-foreground/60' : 'text-muted-foreground/60'
          }`}
        >
          {message.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          {message.status === 'error' && (
            <span className="ml-1 text-red-400">• Failed to send</span>
          )}
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

export function Chatbot({
  apiEndpoint = '/api/chat',
  conversationId: initialConversationId,
  title = 'Chat',
  subtitle = 'AI Assistant',
  aiDisclosure = "You're chatting with an AI assistant.",
  suggestedPrompts = [],
  placeholder = 'Type a message…',
  widget = false,
  showHandoff = true,
  onRequestHandoff,
  maxMessageLength = 2000,
  className = '',
  assistantName = 'Assistant',
}: ChatbotProps) {
  // ─── State ─────────────────────────────────────────────

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isOpen, setIsOpen] = useState(!widget);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState(initialConversationId || '');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── Auto-scroll ───────────────────────────────────────

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  useEffect(() => {
    if (!showScrollButton) {
      scrollToBottom();
    }
  }, [messages, streamingContent, scrollToBottom, showScrollButton]);

  // Detect if user scrolled up
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // ─── Focus input on open ───────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // ─── Send Message ──────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      setError(null);

      // Add user message optimistically
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
        status: 'sent',
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsStreaming(true);
      setStreamingContent('');

      // Create abort controller
      abortRef.current = new AbortController();

      try {
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            messages: [{ role: 'user', content: content.trim() }],
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Chat API error: ${response.status}`);
        }

        // Read SSE stream
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'text') {
                accumulated += data.text;
                setStreamingContent(accumulated);
              } else if (data.type === 'done') {
                // Finalize assistant message
                const assistantMsg: Message = {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: accumulated,
                  timestamp: new Date(),
                  status: 'sent',
                };
                setMessages((prev) => [...prev, assistantMsg]);
                setStreamingContent('');

                // Store conversation ID if returned
                if (data.conversationId) {
                  setConversationId(data.conversationId);
                }
              } else if (data.type === 'error') {
                throw new Error(data.message || 'Something went wrong');
              }
            } catch (parseErr) {
              // Skip malformed SSE lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          // User cancelled — keep partial response
          if (streamingContent) {
            const partialMsg: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: streamingContent + '\n\n_(response stopped)_',
              timestamp: new Date(),
              status: 'sent',
            };
            setMessages((prev) => [...prev, partialMsg]);
          }
        } else {
          setError('Failed to get a response. Please try again.');
          // Add error message from assistant
          const errorMsg: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content:
              "I'm having trouble right now. Please try again, or I can connect you with a person.",
            timestamp: new Date(),
            status: 'error',
          };
          setMessages((prev) => [...prev, errorMsg]);
        }
      } finally {
        setIsStreaming(false);
        setStreamingContent('');
        abortRef.current = null;
      }
    },
    [apiEndpoint, conversationId, isStreaming, streamingContent]
  );

  // ─── Stop Streaming ────────────────────────────────────

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ─── Handle Submit ─────────────────────────────────────

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ─── Handle Handoff ────────────────────────────────────

  const handleHandoff = () => {
    const systemMsg: Message = {
      id: crypto.randomUUID(),
      role: 'system',
      content: 'Connecting you with a human agent…',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, systemMsg]);

    if (onRequestHandoff && conversationId) {
      onRequestHandoff(conversationId);
    }
  };

  // ─── Clear Chat ────────────────────────────────────────

  const clearChat = () => {
    setMessages([]);
    setStreamingContent('');
    setError(null);
    setConversationId('');
  };

  const hasMessages = messages.length > 0 || streamingContent;

  // ─── Widget Toggle ─────────────────────────────────────

  if (widget && !isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg transition-transform hover:scale-105"
        aria-label="Open chat"
      >
        <MessageCircle className="h-6 w-6 text-primary-foreground" />
      </button>
    );
  }

  // ─── Render ────────────────────────────────────────────

  const containerClass = widget
    ? 'fixed bottom-6 right-6 z-50 flex h-[600px] w-[380px] flex-col rounded-2xl border bg-background shadow-2xl'
    : `flex h-full flex-col ${className}`;

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
            <Bot className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold leading-tight">{title}</h2>
            <p className="text-[11px] text-muted-foreground">
              {isStreaming ? 'Typing…' : subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear chat"
              title="Clear chat"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          {showHandoff && (
            <button
              onClick={handleHandoff}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Talk to a person"
              title="Talk to a person"
            >
              <PhoneForwarded className="h-4 w-4" />
            </button>
          )}
          {widget && (
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {!hasMessages ? (
          /* Empty state with suggested prompts */
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Bot className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{aiDisclosure}</p>

            {suggestedPrompts.length > 0 && (
              <div className="mt-6 flex flex-col gap-2">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="rounded-xl border px-4 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* AI Disclosure */}
            <div className="flex justify-center">
              <span className="rounded-full bg-muted/50 px-3 py-1 text-[10px] text-muted-foreground">
                {aiDisclosure}
              </span>
            </div>

            {/* Message bubbles */}
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                assistantName={assistantName}
              />
            ))}

            {/* Streaming response */}
            {isStreaming && streamingContent && (
              <MessageBubble
                message={{
                  id: 'streaming',
                  role: 'assistant',
                  content: streamingContent,
                  timestamp: new Date(),
                }}
                assistantName={assistantName}
              />
            )}

            {/* Typing indicator */}
            {isStreaming && !streamingContent && (
              <div className="flex gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="rounded-2xl bg-muted/70 px-3.5 py-2.5">
                  <TypingIndicator />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Scroll to bottom button */}
        {showScrollButton && (
          <button
            onClick={() => {
              scrollToBottom();
              setShowScrollButton(false);
            }}
            className="sticky bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background p-2 shadow-md hover:bg-muted"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="text-xs text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="border-t px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, maxMessageLength))}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={isStreaming}
              className="w-full resize-none rounded-xl border bg-muted/30 px-3.5 py-2.5 pr-10 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              style={{
                height: 'auto',
                minHeight: '40px',
                maxHeight: '120px',
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
              aria-label="Type a message"
            />

            {/* Character count (shows near limit) */}
            {input.length > maxMessageLength * 0.8 && (
              <span className="absolute bottom-1 right-12 text-[10px] text-muted-foreground">
                {input.length}/{maxMessageLength}
              </span>
            )}
          </div>

          {isStreaming ? (
            <button
              type="button"
              onClick={stopStreaming}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              aria-label="Stop generating"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

// ─── Styles (add to globals.css) ──────────────────────────
//
// .chat-content .inline-code {
//   @apply rounded bg-muted px-1 py-0.5 text-xs font-mono;
// }
//
// .chat-content pre {
//   @apply my-2 overflow-x-auto rounded-lg bg-muted p-3;
// }
//
// .chat-content pre code {
//   @apply text-xs font-mono;
// }
//
// .chat-content .chat-link {
//   @apply text-primary underline underline-offset-2;
// }

// ─── Usage Example ────────────────────────────────────────
//
// // Full page chat
// import { Chatbot } from '@/components/chatbot-conversation-flow';
//
// export default function ChatPage() {
//   return (
//     <div className="h-screen">
//       <Chatbot
//         title="BotMakers Support"
//         subtitle="Powered by AI"
//         suggestedPrompts={[
//           'What services do you offer?',
//           'How does AI automation work?',
//           'I want to schedule a consultation',
//         ]}
//         showHandoff
//         onRequestHandoff={(convId) => {
//           console.log('Handoff requested for', convId);
//         }}
//       />
//     </div>
//   );
// }
//
// // Floating widget
// import { Chatbot } from '@/components/chatbot-conversation-flow';
//
// export function ChatWidget() {
//   return (
//     <Chatbot
//       widget
//       title="Help"
//       subtitle="Ask me anything"
//       suggestedPrompts={['Track my order', 'Pricing info', 'Talk to support']}
//     />
//   );
// }
