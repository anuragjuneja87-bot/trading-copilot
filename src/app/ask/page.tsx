'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ResponseTypeSelector } from '@/components/chat/response-type-selector';
import { ResponseSections } from '@/components/chat/response-sections';
import { ChatHeader } from '@/components/chat/chat-header';
import { LoadingState } from '@/components/chat/loading-state';
import { MarkdownRenderer } from '@/components/chat/markdown-renderer';
import { ChatEmptyState } from '@/components/command-center/chat-empty-state';
import { useUserStore, useChatStore } from '@/stores';
import { generateId } from '@/lib/utils';
import { 
  Send, 
  Lock,
  Loader2,
  Sparkles
} from 'lucide-react';
import { 
  AnalysisDepth, 
  parseAIResponse, 
  generateSuggestions, 
  getTimeOfDay,
  getPinnedInsights,
  unpinInsight,
  getAnalysisDepthPreference,
  setAnalysisDepthPreference,
} from '@/lib/chat-utils';
import { useQuery } from '@tanstack/react-query';

export default function AskPage() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysisDepth, setAnalysisDepth] = useState<AnalysisDepth>(getAnalysisDepthPreference());
  const [pinnedInsights, setPinnedInsights] = useState(getPinnedInsights());
  const [showPinned, setShowPinned] = useState(pinnedInsights.length > 0);
  const [parsedMessages, setParsedMessages] = useState<Map<string, ReturnType<typeof parseAIResponse>>>(new Map());
  const [messageAnalysisDepth, setMessageAnalysisDepth] = useState<Map<string, AnalysisDepth>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadingStartTimeRef = useRef<{ [key: string]: number }>({});
  
  const { messages, addMessage, updateMessage, clearMessages } = useChatStore();
  const { dailyQuestionsUsed, incrementQuestionsUsed, tier } = useUserStore();
  
  // Get watchlist for smart suggestions
  const { data: watchlistData } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/user/watchlist');
      const data = await res.json();
      return data.data;
    },
  });

  const watchlist = watchlistData?.watchlist?.map((item: any) => item.ticker) || [];

  // Get regime for smart suggestions
  const { data: regime } = useQuery({
    queryKey: ['regime'],
    queryFn: async () => {
      const res = await fetch('/api/market/regime');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 60000,
  });

  // Temporarily disabled for testing - set to unlimited
  const dailyLimit = -1; // tier === 'free' ? 3 : tier === 'pro' ? 100 : -1;
  const questionsRemaining = dailyLimit === -1 ? '∞' : Math.max(0, dailyLimit - dailyQuestionsUsed);
  const canAsk = true; // dailyLimit === -1 || dailyQuestionsUsed < dailyLimit;

  // Extract primary ticker and verdict from conversation
  const primaryTicker = useMemo(() => {
    for (const msg of [...messages].reverse()) {
      const parsed = parsedMessages.get(msg.id);
      if (msg.role === 'assistant' && parsed?.snapshot?.ticker) {
        return parsed.snapshot.ticker;
      }
      const tickerMatch = msg.content.match(/\b([A-Z]{1,5})\b/);
      if (tickerMatch && ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'MSFT'].includes(tickerMatch[1])) {
        return tickerMatch[1];
      }
    }
    return undefined;
  }, [messages, parsedMessages]);

  const latestVerdict = useMemo(() => {
    for (const msg of [...messages].reverse()) {
      const parsed = parsedMessages.get(msg.id);
      if (msg.role === 'assistant' && parsed?.verdict) {
        return parsed.verdict.type;
      }
    }
    return undefined;
  }, [messages, parsedMessages]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update pinned insights
  useEffect(() => {
    setPinnedInsights(getPinnedInsights());
  }, [messages]);

  const handleAnalysisDepthChange = (depth: AnalysisDepth) => {
    setAnalysisDepth(depth);
    setAnalysisDepthPreference(depth);
  };

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
    const startTime = Date.now();
    loadingStartTimeRef.current[assistantMsgId] = startTime;
    
    // Create abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
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
        signal: abortController.signal,
        body: JSON.stringify({ 
          question: question.trim(),
          history: history.slice(-10), // Last 10 messages for context
          analysis_depth: analysisDepth, // Add to payload
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
      const messageText = data.data?.message;
      if (!messageText || messageText === 'null' || messageText.trim() === '') {
        throw new Error('Received empty response from AI service');
      }
      
      // Parse response into structured sections
      const parsed = parseAIResponse(messageText);
      
      // Update message with parsed data
      updateMessage(assistantMsgId, messageText);
      
      // Store parsed data in local state map
      setParsedMessages(prev => new Map(prev).set(assistantMsgId, parsed));
      setMessageAnalysisDepth(prev => new Map(prev).set(assistantMsgId, analysisDepth));
      
      incrementQuestionsUsed();
      
    } catch (error: any) {
      // Don't show error if request was aborted
      if (error.name === 'AbortError') {
        updateMessage(assistantMsgId, 'Analysis cancelled. Try a Quick Look for faster results.');
        return;
      }
      console.error('Chat error:', error);
      const errorMessage = error.message || 'Sorry, there was an error processing your request. Please try again.';
      updateMessage(assistantMsgId, errorMessage);
    } finally {
      setIsLoading(false);
      delete loadingStartTimeRef.current[assistantMsgId];
      abortControllerRef.current = null;
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
            
            {/* Questions remaining - Hidden during testing */}
            {dailyLimit !== -1 && (
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
            )}
          </div>

          {/* Chat container */}
          <div className="rounded-xl border border-border bg-background-card overflow-hidden flex flex-col" style={{ height: '600px' }}>
            {/* Chat Header (only when conversation active) */}
            {messages.length > 0 && (
              <ChatHeader
                ticker={primaryTicker}
                verdict={latestVerdict}
                onNewChat={clearMessages}
              />
            )}

            {/* Pinned Insights */}
            {showPinned && pinnedInsights.length > 0 && (
              <div className="px-4 pt-3 pb-2 border-b border-[rgba(255,255,255,0.06)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">📌 Pinned Insights</span>
                  <button
                    onClick={() => setShowPinned(false)}
                    className="text-text-muted hover:text-text-primary"
                  >
                    ×
                  </button>
                </div>
                <div className="space-y-1">
                  {pinnedInsights.map((pin) => (
                    <div
                      key={pin.id}
                      className="flex items-center justify-between p-2 rounded bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] text-xs"
                    >
                      <span className="text-text-secondary flex-1 truncate">{pin.content}</span>
                      <button
                        onClick={() => {
                          unpinInsight(pin.id);
                          setPinnedInsights(getPinnedInsights());
                        }}
                        className="ml-2 text-text-muted hover:text-text-primary"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <ChatEmptyState onSuggestionClick={handleSubmit} watchlist={watchlist} />
              ) : (
                // Messages list
                <>
                  {messages.map((message) => {
                    const parsed = parsedMessages.get(message.id);
                    const msgAnalysisDepth = messageAnalysisDepth.get(message.id) || analysisDepth;
                    
                    return (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg px-4 py-3 ${
                            message.role === 'user'
                              ? 'bg-accent/10 text-text-primary'
                              : 'bg-background-elevated border border-[rgba(255,255,255,0.06)]'
                          }`}
                        >
                          {message.isLoading ? (
                            <LoadingState 
                              analysisDepth={msgAnalysisDepth} 
                              onCancel={() => {
                                // Cancel the request
                                if (abortControllerRef.current) {
                                  abortControllerRef.current.abort();
                                }
                                updateMessage(message.id, 'Analysis cancelled. Try a Quick Look for faster results.');
                                setIsLoading(false);
                              }}
                              startTime={loadingStartTimeRef.current[message.id] || Date.now()}
                            />
                          ) : message.role === 'assistant' && parsed ? (
                            <ResponseSections
                              parsed={parsed}
                              analysisDepth={msgAnalysisDepth}
                              onGoDeeper={() => {
                                const index = messages.findIndex(m => m.id === message.id);
                                const userMsg = messages[index - 1];
                                if (userMsg?.role === 'user') {
                                  // Escalate to next depth
                                  const currentDepth = msgAnalysisDepth;
                                  let nextDepth: AnalysisDepth = 'analysis';
                                  if (currentDepth === 'quick') nextDepth = 'analysis';
                                  else if (currentDepth === 'analysis') nextDepth = 'full';
                                  else return;
                                  handleAnalysisDepthChange(nextDepth);
                                  handleSubmit(userMsg.content);
                                }
                              }}
                              onFollowUp={(prompt) => setInput(prompt)}
                            />
                          ) : (
                            <MarkdownRenderer content={message.content} className="text-sm" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input area with Response Type Selector */}
            <div className="border-t border-border p-4 bg-background-surface space-y-3">
              {/* Response Type Selector */}
              <ResponseTypeSelector
                value={analysisDepth}
                onChange={handleAnalysisDepthChange}
              />

              {canAsk ? (
                <form onSubmit={handleFormSubmit} className="flex gap-3">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about any ticker, market conditions, or trading setup..."
                    className="flex-1 bg-background border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent min-h-[48px]"
                    disabled={isLoading}
                  />
                  <Button type="submit" disabled={!input.trim() || isLoading} className="min-h-[48px]">
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
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
