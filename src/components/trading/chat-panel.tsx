'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Sparkles, BarChart3, TrendingUp } from 'lucide-react';
import { generateId } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

interface ChatPanelProps {
  initialMessage?: string;
  quickActions?: Array<{ label: string; prompt: string; icon?: React.ReactNode }>;
}

export function ChatPanel({ initialMessage, quickActions }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send initial message if provided
  useEffect(() => {
    if (initialMessage && messages.length === 0) {
      handleSubmit(initialMessage);
    }
  }, [initialMessage]);

  const handleSubmit = async (question?: string) => {
    const questionText = question || input.trim();
    if (!questionText || isLoading) return;

    // Add user message
    const userMsgId = generateId();
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: 'user',
        content: questionText,
        timestamp: new Date(),
      },
    ]);

    // Add loading assistant message
    const assistantMsgId = generateId();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isLoading: true,
      },
    ]);

    setInput('');
    setIsLoading(true);

    try {
      // Build conversation history for context
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Call API
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionText,
          history: history.slice(-10), // Last 10 messages for context
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to get response' }));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to get response`);
      }

      const data = await response.json();

      // Handle response
      if (!data.success) {
        throw new Error(data.error || 'Failed to get response');
      }

      // Update assistant message with response
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: data.message || 'No response received',
                isLoading: false,
              }
            : msg
        )
      );
    } catch (error: any) {
      // Update assistant message with error
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: `Error: ${error.message || 'Failed to get response'}`,
                isLoading: false,
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const formatMessage = (content: string) => {
    // Basic markdown formatting
    let formatted = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-background-elevated px-1 py-0.5 rounded text-sm">$1</code>')
      .replace(/\n/g, '<br />');

    // Headers
    formatted = formatted.replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');
    formatted = formatted.replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>');
    formatted = formatted.replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>');

    // Lists
    formatted = formatted.replace(/^\- (.*$)/gm, '<li class="ml-4">$1</li>');
    formatted = formatted.replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4">$2</li>');

    return formatted;
  };

  const defaultQuickActions = [
    { label: 'Morning Briefing', prompt: 'Give me a concise morning briefing', icon: <Sparkles className="h-4 w-4" /> },
    { label: 'SPY Levels', prompt: 'Key levels for SPY and QQQ today', icon: <BarChart3 className="h-4 w-4" /> },
    { label: 'Market Regime', prompt: 'What is the current market regime?', icon: <TrendingUp className="h-4 w-4" /> },
  ];

  const actions = quickActions || defaultQuickActions;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Quick Actions */}
      {actions.length > 0 && (
        <div className="p-4 border-b border-border flex gap-2 flex-wrap">
          {actions.map((action, idx) => (
            <Button
              key={idx}
              variant="outline"
              size="sm"
              onClick={() => handleSubmit(action.prompt)}
              disabled={isLoading}
              className="text-xs"
            >
              {action.icon}
              <span className="ml-1">{action.label}</span>
            </Button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-text-muted py-12">
            <p>Start a conversation with the AI trading copilot</p>
            <p className="text-sm mt-2">Ask questions about markets, stocks, or get trading insights</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-accent/10 text-text-primary'
                  : 'bg-background-card border border-border text-text-primary'
              }`}
            >
              {message.isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="h-2 w-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="h-2 w-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm text-text-muted">Analyzing...</span>
                </div>
              ) : (
                <div
                  className="prose prose-invert max-w-none text-sm"
                  dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the AI trading copilot..."
            disabled={isLoading}
            className="flex-1 px-4 py-2 rounded-lg border border-border bg-background-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} size="lg">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
