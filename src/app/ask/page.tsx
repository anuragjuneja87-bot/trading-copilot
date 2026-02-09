'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUserStore, useChatStore } from '@/stores';
import { generateId } from '@/lib/utils';
import { 
  Send, 
  Zap, 
  Sparkles,
  Lock,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  BarChart3
} from 'lucide-react';

// Suggested questions
const suggestions = [
  { text: 'Should I buy NVDA on this dip?', icon: TrendingUp },
  { text: 'What are the key levels for SPY today?', icon: BarChart3 },
  { text: 'Is it safe to buy tech tomorrow?', icon: AlertTriangle },
  { text: 'Give me a morning briefing', icon: Sparkles },
];

export default function AskPage() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { messages, addMessage, updateMessage, clearMessages } = useChatStore();
  const { dailyQuestionsUsed, incrementQuestionsUsed, tier } = useUserStore();
  
  const dailyLimit = tier === 'free' ? 3 : tier === 'pro' ? 100 : -1;
  const questionsRemaining = dailyLimit === -1 ? '∞' : Math.max(0, dailyLimit - dailyQuestionsUsed);
  const canAsk = dailyLimit === -1 || dailyQuestionsUsed < dailyLimit;

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (question: string) => {
    if (!question.trim() || isLoading || !canAsk) return;

    // Add user message
    const userMsgId = generateId();
    addMessage({
      id: userMsgId,
      role: 'user',
      content: question.trim(),
      timestamp: new Date(),
    });

    // Add loading assistant message
    const assistantMsgId = generateId();
    addMessage({
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    });

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
          question: question.trim(),
          history: history.slice(-10), // Last 10 messages for context
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      
      // Update assistant message with response
      updateMessage(assistantMsgId, data.data?.message || 'Sorry, I couldn\'t process that request.');
      incrementQuestionsUsed();
      
    } catch (error) {
      console.error('Chat error:', error);
      updateMessage(
        assistantMsgId, 
        'Sorry, there was an error processing your request. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit(input);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-20">
        <div className="mx-auto max-w-4xl px-4 py-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-1.5 mb-4">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium text-accent">Free AI Trading Copilot</span>
            </div>
            <h1 className="text-3xl font-bold text-text-primary sm:text-4xl">
              Ask anything about the market
            </h1>
            <p className="mt-3 text-text-secondary">
              Get verdicts, key levels, and actionable insights. Not just data.
            </p>
            
            {/* Questions remaining */}
            <div className="mt-4 inline-flex items-center gap-2 text-sm">
              <span className="text-text-muted">Questions today:</span>
              <Badge variant={canAsk ? 'normal' : 'crisis'}>
                {questionsRemaining} remaining
              </Badge>
              {tier === 'free' && (
                <Link href="/pricing" className="text-accent hover:underline ml-2">
                  Upgrade for more →
                </Link>
              )}
            </div>
          </div>

          {/* Chat container */}
          <div className="rounded-xl border border-border bg-background-card overflow-hidden">
            {/* Messages area */}
            <div className="h-[500px] overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                // Empty state with suggestions
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="mb-6 h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center">
                    <MessageSquare className="h-8 w-8 text-accent" />
                  </div>
                  <h3 className="text-lg font-medium text-text-primary mb-2">
                    What would you like to know?
                  </h3>
                  <p className="text-sm text-text-secondary mb-6 max-w-md">
                    Ask about specific tickers, market conditions, or get a morning briefing. 
                    I'll give you actionable insights, not just data.
                  </p>
                  
                  {/* Suggestion chips */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.text}
                        onClick={() => handleSubmit(suggestion.text)}
                        disabled={!canAsk || isLoading}
                        className="flex items-center gap-2 px-4 py-3 rounded-lg border border-border bg-background-surface text-left text-sm text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <suggestion.icon className="h-4 w-4 text-accent flex-shrink-0" />
                        <span>{suggestion.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                // Messages list
                <>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {message.role === 'assistant' && (
                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center">
                          <Zap className="h-4 w-4 text-accent" />
                        </div>
                      )}
                      
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-3 ${
                          message.role === 'user'
                            ? 'bg-accent/10 border border-accent/20'
                            : 'bg-background-elevated'
                        }`}
                      >
                        {message.isLoading ? (
                          <div className="flex items-center gap-2 text-text-muted">
                            <div className="flex gap-1">
                              <div className="h-2 w-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                              <div className="h-2 w-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                              <div className="h-2 w-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                            <span className="text-sm">Analyzing...</span>
                          </div>
                        ) : (
                          <div 
                            className="text-sm text-text-primary whitespace-pre-wrap"
                            dangerouslySetInnerHTML={{ 
                              __html: formatMessage(message.content) 
                            }}
                          />
                        )}
                      </div>
                      
                      {message.role === 'user' && (
                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-text-muted/20 flex items-center justify-center">
                          <span className="text-xs text-text-secondary">You</span>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input area */}
            <div className="border-t border-border p-4 bg-background-surface">
              {canAsk ? (
                <form onSubmit={handleFormSubmit} className="flex gap-3">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about any ticker, market conditions, or trading setup..."
                    className="flex-1 bg-background border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    disabled={isLoading}
                  />
                  <Button type="submit" disabled={!input.trim() || isLoading}>
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              ) : (
                // Upgrade prompt when limit reached
                <div className="flex items-center justify-between rounded-lg border border-warning/20 bg-warning/10 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Lock className="h-5 w-5 text-warning" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        Daily limit reached
                      </p>
                      <p className="text-xs text-text-secondary">
                        Upgrade to Pro for 100 questions/day
                      </p>
                    </div>
                  </div>
                  <Button size="sm" asChild>
                    <Link href="/pricing">Upgrade</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Clear chat button */}
          {messages.length > 0 && (
            <div className="mt-4 text-center">
              <button
                onClick={clearMessages}
                className="text-sm text-text-muted hover:text-text-secondary"
              >
                Clear conversation
              </button>
            </div>
          )}
        </div>
      </main>
      
      <Footer />
    </div>
  );
}

// Simple markdown-like formatting
function formatMessage(content: string): string {
  return content
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-text-primary">$1</strong>')
    // Verdict badges
    .replace(/VERDICT:\s*(BUY|SELL|WAIT|HOLD)/gi, (_, verdict) => {
      const colors: Record<string, string> = {
        BUY: 'bg-bull text-white',
        SELL: 'bg-bear text-white',
        WAIT: 'bg-warning text-background',
        HOLD: 'bg-text-muted text-white',
      };
      return `<span class="inline-flex px-2 py-0.5 rounded text-xs font-bold ${colors[verdict.toUpperCase()]}">${verdict.toUpperCase()}</span>`;
    })
    // Crisis/Elevated tags
    .replace(/\(CRISIS\)/gi, '<span class="text-bear font-medium">(CRISIS)</span>')
    .replace(/\(ELEVATED\)/gi, '<span class="text-warning font-medium">(ELEVATED)</span>')
    // Price levels
    .replace(/\$[\d,]+\.?\d*/g, '<span class="text-accent font-mono">$&</span>')
    // Bullet points
    .replace(/^[•·-]\s*/gm, '<span class="text-accent mr-1">•</span>')
    // Newlines
    .replace(/\n/g, '<br>');
}
