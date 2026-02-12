'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ChatEmptyState } from '@/components/command-center/chat-empty-state';
import { ResponseTypeSelector } from '@/components/chat/response-type-selector';
import { ResponseSections } from '@/components/chat/response-sections';
import { ChatHeader } from '@/components/chat/chat-header';
import { LoadingState } from '@/components/chat/loading-state';
import { MarkdownRenderer } from '@/components/chat/markdown-renderer';
import { Send, Loader2, X } from 'lucide-react';
import { generateId, cn } from '@/lib/utils';
import { 
  AnalysisDepth, 
  parseAIResponse, 
  generateSuggestions, 
  getTimeOfDay,
  getPinnedInsights,
  unpinInsight,
} from '@/lib/chat-utils';
import { useQuery } from '@tanstack/react-query';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  routedTo?: 'SIMPLE_LOOKUP' | 'QUICK_ANALYSIS' | 'SUPERVISOR';
  processingTime?: number;
  analysisDepth?: AnalysisDepth;
  parsed?: ReturnType<typeof parseAIResponse>;
}

interface ChatPanelProps {
  initialMessage?: string;
  quickActions?: Array<{ label: string; prompt: string; icon?: React.ReactNode }>;
  watchlist?: string[];
}

export function ChatPanel({ initialMessage, quickActions, watchlist = [] }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<string | null>(null);
  const [analysisDepth, setAnalysisDepth] = useState<AnalysisDepth>('quick');
  const [pinnedInsights, setPinnedInsights] = useState(getPinnedInsights());
  const [showPinned, setShowPinned] = useState(pinnedInsights.length > 0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadingStartTimeRef = useRef<{ [key: string]: number }>({});

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

  // Generate smart quick actions with ticker-enriched prompts
  const smartQuickActions = useMemo(() => {
    const timeOfDay = getTimeOfDay();
    const month = new Date().getMonth() + 1;
    const suggestions = generateSuggestions(
      timeOfDay,
      regime?.status?.toUpperCase() as any,
      watchlist,
      month
    );
    // Use the first 4 suggestions, which already have ticker-enriched prompts
    return suggestions.slice(0, 4).map(s => ({
      label: s.title,
      prompt: s.prompt, // Already includes tickers via buildSuggestionPrompt
      icon: <span>{s.icon}</span>,
    }));
  }, [regime?.status, watchlist]);

  const actions = quickActions || smartQuickActions;

  // Extract primary ticker and verdict from conversation
  const primaryTicker = useMemo(() => {
    for (const msg of [...messages].reverse()) {
      if (msg.role === 'assistant' && msg.parsed?.snapshot?.ticker) {
        return msg.parsed.snapshot.ticker;
      }
      // Also check message content for ticker mentions
      const tickerMatch = msg.content.match(/\b([A-Z]{1,5})\b/);
      if (tickerMatch && ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'MSFT'].includes(tickerMatch[1])) {
        return tickerMatch[1];
      }
    }
    return undefined;
  }, [messages]);

  const latestVerdict = useMemo(() => {
    for (const msg of [...messages].reverse()) {
      if (msg.role === 'assistant' && msg.parsed?.verdict) {
        return msg.parsed.verdict.type;
      }
    }
    return undefined;
  }, [messages]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update pinned insights
  useEffect(() => {
    setPinnedInsights(getPinnedInsights());
  }, [messages]);

  // Send initial message if provided
  useEffect(() => {
    if (initialMessage && messages.length === 0) {
      handleSubmit(initialMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const startTime = Date.now();
    loadingStartTimeRef.current[assistantMsgId] = startTime;
    
    // Create abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isLoading: true,
        analysisDepth,
      },
    ]);

    setInput('');
    setIsLoading(true);

    try {
      // Map analysis depth to route preference
      let routePreference = 'auto';
      if (analysisDepth === 'quick') {
        routePreference = 'SIMPLE_LOOKUP';
      } else if (analysisDepth === 'analysis') {
        routePreference = 'QUICK_ANALYSIS';
      } else {
        routePreference = 'SUPERVISOR';
      }

      // Step 1: Try Query Router first (unless full thesis)
      if (analysisDepth !== 'full') {
        setCurrentRoute('ROUTING');
        
        const routerResponse = await fetch('/api/ai/query-router', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({
            query: questionText,
            watchlist: watchlist,
            analysis_depth: analysisDepth, // Add to payload
          }),
        });

        const routerData = await routerResponse.json();

        if (routerData.success) {
          const { data } = routerData;
          
          // If routed to Supervisor or user wants full thesis, call it
          if (data.routedTo === 'SUPERVISOR' || analysisDepth === 'full') {
            setCurrentRoute('SUPERVISOR');
            await handleSupervisorQuery(questionText, assistantMsgId, analysisDepth);
          } else {
            // Quick response from router
            setCurrentRoute(data.routedTo);
            
            const parsed = parseAIResponse(data.answer);
            
            // Update the loading message with the response
            setMessages((prev) => prev.map((msg) => 
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    content: data.answer,
                    isLoading: false,
                    routedTo: data.routedTo,
                    processingTime: data.processingTime,
                    parsed,
                  }
                : msg
            ));
          }
        } else {
          // Fallback to Supervisor if router fails
          setCurrentRoute('SUPERVISOR');
          await handleSupervisorQuery(questionText, assistantMsgId, analysisDepth);
        }
      } else {
        // Full thesis goes directly to Supervisor
        setCurrentRoute('SUPERVISOR');
        await handleSupervisorQuery(questionText, assistantMsgId, analysisDepth);
      }
    } catch (error: any) {
      // Don't show error if request was aborted
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Query error:', error);
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
      setCurrentRoute(null);
      delete loadingStartTimeRef.current[assistantMsgId];
      abortControllerRef.current = null;
    }
  };

  const handleSupervisorQuery = async (query: string, messageId: string, depth: AnalysisDepth) => {
    try {
      // Build conversation history for context
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current?.signal,
        body: JSON.stringify({
          question: query,
          history: history.slice(-10),
          analysis_depth: depth, // Add to payload
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to get response' }));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to get response`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to get response');
      }
      
      // Update assistant message with response
      const messageText = data.data?.message || data.message || 'Analysis complete.';
      const parsed = parseAIResponse(messageText);
      
      setMessages((prev) => prev.map((msg) => 
        msg.id === messageId
          ? {
              ...msg,
              content: messageText,
              isLoading: false,
              routedTo: 'SUPERVISOR',
              parsed,
              analysisDepth: depth,
            }
          : msg
      ));
    } catch (error) {
      throw error;
    }
  };

  const handleGoDeeper = (messageId: string, originalQuery: string) => {
    // Find the message's current depth and escalate
    const message = messages.find(m => m.id === messageId);
    const currentDepth = message?.analysisDepth || 'quick';
    let nextDepth: AnalysisDepth = 'analysis';
    if (currentDepth === 'quick') nextDepth = 'analysis';
    else if (currentDepth === 'analysis') nextDepth = 'full';
    else return; // Already at full

    setAnalysisDepth(nextDepth);
    handleSubmit(originalQuery);
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput('');
  };

  const handleFollowUp = (prompt: string) => {
    setInput(prompt);
    // Auto-focus input (handled by browser)
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Chat Header (only when conversation active) */}
      {messages.length > 0 && (
        <ChatHeader
          ticker={primaryTicker}
          verdict={latestVerdict}
          onNewChat={handleNewChat}
        />
      )}

      {/* Pinned Insights */}
      {showPinned && pinnedInsights.length > 0 && (
        <div className="px-4 pt-4 pb-2 border-b border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">📌 Pinned Insights</span>
            <button
              onClick={() => setShowPinned(false)}
              className="text-text-muted hover:text-text-primary"
            >
              <X className="h-3 w-3" />
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
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions (above input, always visible) */}
      {actions.length > 0 && (
        <div className="px-4 pt-3 pb-2 border-b border-[rgba(255,255,255,0.06)] flex gap-2 flex-wrap">
          {actions.map((action, idx) => (
            <Button
              key={idx}
              variant="ghost"
              size="sm"
              onClick={() => handleSubmit(action.prompt)}
              disabled={isLoading}
              className="text-xs h-7 px-2"
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
          <ChatEmptyState onSuggestionClick={handleSubmit} watchlist={watchlist} />
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-accent/10 text-text-primary'
                  : 'bg-background-card border border-[rgba(255,255,255,0.06)] text-text-primary'
              }`}
            >
              {message.isLoading ? (
                <LoadingState 
                  analysisDepth={message.analysisDepth || 'quick'} 
                  onCancel={() => {
                    // Cancel the request
                    if (abortControllerRef.current) {
                      abortControllerRef.current.abort();
                    }
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === message.id
                          ? {
                              ...msg,
                              content: 'Analysis cancelled. Try a Quick Look for faster results.',
                              isLoading: false,
                            }
                          : msg
                      )
                    );
                    setIsLoading(false);
                  }}
                  startTime={loadingStartTimeRef.current[message.id] || Date.now()}
                />
              ) : message.role === 'assistant' && message.parsed ? (
                <ResponseSections
                  parsed={message.parsed}
                  analysisDepth={message.analysisDepth || 'quick'}
                  onGoDeeper={() => {
                    const index = messages.findIndex(m => m.id === message.id);
                    const userMsg = messages[index - 1];
                    if (userMsg?.role === 'user') {
                      handleGoDeeper(message.id, userMsg.content);
                    }
                  }}
                  onFollowUp={handleFollowUp}
                />
              ) : (
                <MarkdownRenderer content={message.content} className="text-sm" />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input with Response Type Selector */}
      <div className="p-4 border-t border-[rgba(255,255,255,0.06)] space-y-3">
        {/* Response Type Selector */}
        <ResponseTypeSelector
          value={analysisDepth}
          onChange={setAnalysisDepth}
        />

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
            placeholder="Ask about prices, levels, or trading analysis..."
            disabled={isLoading}
            className="flex-1 px-4 py-3 lg:py-2 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 min-h-[48px] lg:min-h-[44px]"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} size="lg" className="min-h-[48px] lg:min-h-[44px]">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
