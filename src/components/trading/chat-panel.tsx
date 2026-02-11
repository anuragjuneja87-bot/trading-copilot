'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Sparkles, BarChart3, TrendingUp, Zap, Brain, Clock, Loader2 } from 'lucide-react';
import { generateId, cn } from '@/lib/utils';
import { QueryResponse } from '@/types/query-router';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  routedTo?: 'SIMPLE_LOOKUP' | 'QUICK_ANALYSIS' | 'SUPERVISOR';
  processingTime?: number;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
      // Step 1: Try Query Router first
      setCurrentRoute('ROUTING');
      
      const routerResponse = await fetch('/api/ai/query-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: questionText,
          watchlist: watchlist,
        }),
      });

      const routerData = await routerResponse.json();

      if (routerData.success) {
        const { data } = routerData;
        
        // If routed to Supervisor, call it
        if (data.routedTo === 'SUPERVISOR') {
          setCurrentRoute('SUPERVISOR');
          await handleSupervisorQuery(questionText, assistantMsgId);
        } else {
          // Quick response from router
          setCurrentRoute(data.routedTo);
          
          // Update the loading message with the response
          setMessages((prev) => prev.map((msg) => 
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content: data.answer,
                  isLoading: false,
                  routedTo: data.routedTo,
                  processingTime: data.processingTime,
                }
              : msg
          ));
        }
      } else {
        // Fallback to Supervisor if router fails
        setCurrentRoute('SUPERVISOR');
        await handleSupervisorQuery(questionText, assistantMsgId);
      }
    } catch (error: any) {
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
    }
  };

  const handleSupervisorQuery = async (query: string, messageId: string) => {
    // Call your existing Supervisor endpoint
    try {
      // Build conversation history for context
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: query,
          history: history.slice(-10), // Last 10 messages for context
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
      
      setMessages((prev) => prev.map((msg) => 
        msg.id === messageId
          ? {
              ...msg,
              content: messageText,
              isLoading: false,
              routedTo: 'SUPERVISOR',
            }
          : msg
      ));
    } catch (error) {
      throw error;
    }
  };

  const handleDeepDive = async (messageId: string, query: string) => {
    // Allow user to request Supervisor analysis for a quick response
    setIsLoading(true);
    setCurrentRoute('SUPERVISOR');
    
    const newLoadingMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };
    setMessages((prev) => [...prev, newLoadingMessage]);
    
    try {
      await handleSupervisorQuery(`Provide a detailed analysis: ${query}`, newLoadingMessage.id);
    } finally {
      setIsLoading(false);
      setCurrentRoute(null);
    }
  };

  const getRouteIndicator = (routedTo?: string) => {
    switch (routedTo) {
      case 'SIMPLE_LOOKUP':
        return { icon: <Zap className="w-3 h-3" />, label: 'Instant', color: 'text-green-400' };
      case 'QUICK_ANALYSIS':
        return { icon: <Clock className="w-3 h-3" />, label: 'Quick', color: 'text-blue-400' };
      case 'SUPERVISOR':
        return { icon: <Brain className="w-3 h-3" />, label: 'Deep Analysis', color: 'text-purple-400' };
      default:
        return null;
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
            <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">Trading Command Center</p>
            <p className="text-sm">Ask about prices, levels, analysis, or complex trading strategies</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                onClick={() => handleSubmit('What are SPY levels today?')}
                disabled={isLoading}
                className="px-3 py-1.5 bg-background-card border border-background-elevated rounded-full text-sm text-text-secondary hover:text-text-primary hover:border-accent transition-colors disabled:opacity-50"
              >
                SPY Levels
              </button>
              <button
                onClick={() => handleSubmit('Is TSLA bullish or bearish?')}
                disabled={isLoading}
                className="px-3 py-1.5 bg-background-card border border-background-elevated rounded-full text-sm text-text-secondary hover:text-text-primary hover:border-accent transition-colors disabled:opacity-50"
              >
                TSLA Sentiment
              </button>
              <button
                onClick={() => handleSubmit('Build a thesis on NVDA')}
                disabled={isLoading}
                className="px-3 py-1.5 bg-background-card border border-background-elevated rounded-full text-sm text-text-secondary hover:text-text-primary hover:border-accent transition-colors disabled:opacity-50"
              >
                NVDA Thesis
              </button>
            </div>
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
                  <Loader2 className="w-4 h-4 animate-spin text-accent" />
                  <span className="text-sm text-text-muted">
                    {currentRoute === 'ROUTING' && 'Analyzing query...'}
                    {currentRoute === 'SIMPLE_LOOKUP' && 'Fetching data...'}
                    {currentRoute === 'QUICK_ANALYSIS' && 'Generating analysis...'}
                    {currentRoute === 'SUPERVISOR' && 'Deep analysis in progress...'}
                    {!currentRoute && 'Processing...'}
                  </span>
                </div>
              ) : (
                <>
                  <div
                    className="prose prose-invert max-w-none text-sm"
                    dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                  />
                  
                  {/* Route indicator for assistant messages */}
                  {message.role === 'assistant' && message.routedTo && (
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-background-elevated/50">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const indicator = getRouteIndicator(message.routedTo);
                          if (!indicator) return null;
                          return (
                            <span className={cn("flex items-center gap-1 text-xs", indicator.color)}>
                              {indicator.icon}
                              {indicator.label}
                            </span>
                          );
                        })()}
                        {message.processingTime && (
                          <span className="text-xs text-text-muted">
                            {message.processingTime}ms
                          </span>
                        )}
                      </div>
                      
                      {/* Deep Dive button for non-Supervisor responses */}
                      {message.routedTo !== 'SUPERVISOR' && (
                        <button
                          onClick={() => {
                            // Find the corresponding user message
                            const index = messages.findIndex(m => m.id === message.id);
                            const userMsg = messages[index - 1];
                            if (userMsg?.role === 'user') {
                              handleDeepDive(message.id, userMsg.content);
                            }
                          }}
                          disabled={isLoading}
                          className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 disabled:opacity-50"
                        >
                          <Brain className="w-3 h-3" />
                          Go Deeper
                        </button>
                      )}
                    </div>
                  )}
                </>
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
            placeholder="Ask about prices, levels, or trading analysis..."
            disabled={isLoading}
            className="flex-1 px-4 py-2 rounded-lg border border-border bg-background-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} size="lg">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
        
        {/* Speed hint */}
        <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-green-400" />
            Prices/Levels: ~1s
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-blue-400" />
            Quick Analysis: ~3s
          </span>
          <span className="flex items-center gap-1">
            <Brain className="w-3 h-3 text-purple-400" />
            Deep Analysis: ~30s
          </span>
        </div>
      </div>
    </div>
  );
}
