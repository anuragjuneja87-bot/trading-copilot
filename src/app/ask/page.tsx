'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useUserStore, useChatStore } from '@/stores';
import { generateId } from '@/lib/utils';
import { Send, Loader2, Menu, X } from 'lucide-react';
import {
  AnalysisDepth,
  parseAIResponse,
  getAnalysisDepthPreference,
  setAnalysisDepthPreference,
} from '@/lib/chat-utils';
import { useQuery } from '@tanstack/react-query';
import { MarketContextSidebar } from '@/components/war-room/market-context-sidebar';
import { RecentInsightsSidebar } from '@/components/war-room/recent-insights-sidebar';
import { SymbolEntry } from '@/components/war-room/symbol-entry';
import { SymbolHub } from '@/components/war-room/symbol-hub';
import { RadarScanner } from '@/components/war-room/radar-scanner';
import { LiveReportBuilder } from '@/components/war-room/live-report-builder';
import { AnalysisResponse } from '@/components/war-room/analysis-response';
import { AnalysisModeSelector } from '@/components/war-room/analysis-mode-selector';
import { PremarketTemplate } from '@/components/war-room/templates/premarket-template';
import { GapsTemplate } from '@/components/war-room/templates/gaps-template';
import { CalendarTemplate } from '@/components/war-room/templates/calendar-template';
import { BullishSetupsTemplate } from '@/components/war-room/templates/bullish-setups-template';
import { SeasonalityTemplate } from '@/components/war-room/templates/seasonality-template';
import { EODSummaryTemplate } from '@/components/war-room/templates/eod-summary-template';
import { AfterhoursTemplate } from '@/components/war-room/templates/afterhours-template';

type Phase = 'idle' | 'scanning' | 'building' | 'complete';

export default function AskPage() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Initialize with default to avoid hydration mismatch, then update from localStorage in useEffect
  const [analysisDepth, setAnalysisDepth] = useState<AnalysisDepth>('quick');
  const [phase, setPhase] = useState<Phase>('idle');
  const [currentAnalysis, setCurrentAnalysis] = useState<{
    ticker?: string;
    content?: string;
    parsed?: ReturnType<typeof parseAIResponse>;
    startTime?: number;
  } | null>(null);
  const [activeSegments, setActiveSegments] = useState<number[]>([]);
  const [completedSegments, setCompletedSegments] = useState<number[]>([]);
  const [visibleRows, setVisibleRows] = useState(0);
  const [showFlow, setShowFlow] = useState(false);
  const [showVerdict, setShowVerdict] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [currentStep, setCurrentStep] = useState('Initializing...');
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [dim1Response, setDim1Response] = useState<{
    type: 'premarket' | 'gaps' | 'calendar' | 'levels';
    data: any;
  } | null>(null);
  const [dim2Response, setDim2Response] = useState<{
    type: 'bullish_setups' | 'seasonality' | 'eod_summary' | 'afterhours_movers';
    data: any;
    elapsed?: number;
  } | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const animationTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { messages, addMessage, updateMessage, clearMessages } = useChatStore();
  const { dailyQuestionsUsed, incrementQuestionsUsed, tier, watchlist } = useUserStore();

  // Load analysis depth preference from localStorage after mount (client-only)
  useEffect(() => {
    const preference = getAnalysisDepthPreference();
    setAnalysisDepth(preference);
  }, []);

  // Get prices for ticker extraction
  const { data: prices } = useQuery({
    queryKey: ['market-prices', watchlist],
    queryFn: async () => {
      if (watchlist.length === 0) return {};
      const res = await fetch(`/api/market/prices?tickers=${watchlist.join(',')}`);
      const data = await res.json();
      return data.data || {};
    },
    refetchInterval: 30000,
  });

  // Get regime data for symbol entry
  const { data: regime } = useQuery({
    queryKey: ['regime'],
    queryFn: async () => {
      const res = await fetch('/api/market/regime');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 60000,
  });

  // Extract ticker from query
  const extractTicker = (query: string): string | undefined => {
    const match = query.match(/\b([A-Z]{1,5})\b/);
    if (match && prices?.[match[1]]) {
      return match[1];
    }
    // Check watchlist
    for (const ticker of watchlist) {
      if (query.toUpperCase().includes(ticker)) {
        return ticker;
      }
    }
    return undefined;
  };

  // Update elapsed time during loading
  useEffect(() => {
    if (phase === 'scanning' || phase === 'building') {
      const interval = setInterval(() => {
        if (currentAnalysis?.startTime) {
          setElapsed(Math.floor((Date.now() - currentAnalysis.startTime) / 1000));
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [phase, currentAnalysis?.startTime]);

  // Handle radar scanner animation
  useEffect(() => {
    if (phase === 'scanning' || phase === 'building') {
      const steps = analysisDepth === 'quick' ? 2 : analysisDepth === 'analysis' ? 5 : 7;
      const stepInterval = analysisDepth === 'quick' ? 500 : analysisDepth === 'analysis' ? 2000 : 3000;

      let currentStepIndex = activeSegments.length;
      const stepNames = [
        'Fetching market data...',
        'Analyzing options flow...',
        'Checking news and sentiment...',
        'Reviewing gamma levels...',
        'Running historical analysis...',
        'Building trading thesis...',
        'Finalizing report...',
      ];

      // Mark previous segments as completed
      if (currentStepIndex > 0) {
        setCompletedSegments((prev) => [...prev, ...activeSegments.filter((i) => !prev.includes(i))]);
      }

      const timer = setInterval(() => {
        if (currentStepIndex < steps) {
          setActiveSegments([currentStepIndex]);
          setCurrentStep(stepNames[currentStepIndex] || 'Analyzing...');
          currentStepIndex++;
        } else {
          // All segments complete, move to building phase
          setCompletedSegments([0, 1, 2, 3, 4, 5]);
          setPhase('building');
          clearInterval(timer);
        }
      }, stepInterval);

      animationTimerRef.current = timer;
      return () => {
        if (timer) clearInterval(timer);
      };
    }
  }, [phase, analysisDepth, activeSegments]);

  // Handle report builder progressive fill-in
  useEffect(() => {
    if (phase === 'building' && visibleRows < 5) {
      const rowInterval = 800;
      let rowIndex = visibleRows;

      const timer = setInterval(() => {
        if (rowIndex < 5) {
          setVisibleRows(rowIndex + 1);
          rowIndex++;
        } else {
          setShowFlow(true);
          setTimeout(() => setShowVerdict(true), 500);
          clearInterval(timer);
        }
      }, rowInterval);

      return () => {
        if (timer) clearInterval(timer);
      };
    }
  }, [phase, visibleRows]);

  const handleAnalysisDepthChange = (depth: AnalysisDepth) => {
    setAnalysisDepth(depth);
    setAnalysisDepthPreference(depth);
  };

  const handleSubmit = async (question?: string) => {
    const query = question || input;
    if (!query.trim() || isLoading) return;

    // Extract ticker
    const ticker = extractTicker(query);

    // Set selected symbol if ticker was extracted
    if (ticker) {
      setSelectedSymbol(ticker);
    }

    // Reset state
    setPhase('scanning');
    setActiveSegments([]);
    setCompletedSegments([]);
    setVisibleRows(0);
    setShowFlow(false);
    setShowVerdict(false);
    setElapsed(0);
    setCurrentStep('Initializing...');

    // Add user message
    const userMsgId = generateId();
    addMessage({
      id: userMsgId,
      role: 'user',
      content: query.trim(),
      timestamp: new Date(),
    });

    // Set current analysis
    const startTime = Date.now();
    setCurrentAnalysis({
      ticker,
      startTime,
    });

    setInput('');
    setIsLoading(true);

    // Create abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Build conversation history
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
          question: query.trim(),
          history: history.slice(-10),
          analysis_depth: analysisDepth,
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

      const messageText = data.data?.message;
      if (!messageText || messageText === 'null' || messageText.trim() === '') {
        throw new Error('Received empty response from AI service');
      }

      // Parse response
      const parsed = parseAIResponse(messageText);

      // Complete all animations immediately if they haven't finished
      if (phase === 'scanning' || phase === 'building') {
        setCompletedSegments([0, 1, 2, 3, 4, 5]);
        setVisibleRows(5);
        setShowFlow(true);
        setShowVerdict(true);
        setPhase('building');
        // Small delay before showing complete
        setTimeout(() => setPhase('complete'), 500);
      } else {
        setPhase('complete');
      }

      // Add message to store
      const assistantMsgId = generateId();
      addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: messageText,
        timestamp: new Date(),
      });

      // Update current analysis
      setCurrentAnalysis({
        ticker: parsed.snapshot?.ticker || ticker,
        content: messageText,
        parsed,
      });

      setPhase('complete');
      incrementQuestionsUsed();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setPhase('idle');
        setCurrentAnalysis(null);
        return;
      }
      console.error('Chat error:', error);
      setPhase('idle');
      setCurrentAnalysis(null);
      // Show error message
      const errorMsgId = generateId();
      addMessage({
        id: errorMsgId,
        role: 'assistant',
        content: `Error: ${error.message || 'Failed to process request'}`,
        timestamp: new Date(),
      });
    } finally {
      setIsLoading(false);
      if (animationTimerRef.current) {
        clearInterval(animationTimerRef.current);
      }
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setPhase('idle');
    setCurrentAnalysis(null);
    setIsLoading(false);
    if (animationTimerRef.current) {
      clearInterval(animationTimerRef.current);
    }
  };

  const handleNewAnalysis = () => {
    setPhase('idle');
    setCurrentAnalysis(null);
    setDim1Response(null);
    setDim2Response(null);
    setActiveSegments([]);
    setCompletedSegments([]);
    setVisibleRows(0);
    setShowFlow(false);
    setShowVerdict(false);
    setElapsed(0);
  };

  const handleTickerClick = (ticker: string) => {
    setSelectedSymbol(ticker);
    setInput(`Full trading thesis for ${ticker}`);
    // Focus input
    setTimeout(() => {
      const inputEl = document.querySelector('input[type="text"]') as HTMLInputElement;
      inputEl?.focus();
    }, 100);
  };

  const handleSymbolSelect = (symbol: string) => {
    setSelectedSymbol(symbol);
    // Reset any previous analysis state
    setPhase('idle');
    setCurrentAnalysis(null);
    setDim1Response(null);
    setDim2Response(null);
  };

  const handleBackToSearch = () => {
    setSelectedSymbol(null);
    setPhase('idle');
    setCurrentAnalysis(null);
    setDim1Response(null);
    setDim2Response(null);
  };

  const handleDim1Click = async (apiEndpoint: string, query: string) => {
    // Determine template type from endpoint
    const templateType = apiEndpoint.includes('premarket') ? 'premarket'
      : apiEndpoint.includes('gaps') ? 'gaps'
      : apiEndpoint.includes('calendar') ? 'calendar'
      : 'levels';

    // Build URL with watchlist tickers
    const tickers = watchlist.length > 0 ? watchlist.slice(0, 5).join(',') : 'SPY,QQQ,NVDA';
    let url = apiEndpoint;
    if (templateType === 'premarket' || templateType === 'gaps') {
      url += `?tickers=${tickers}`;
      if (templateType === 'gaps') url += '&top_movers=5';
    } else if (templateType === 'calendar') {
      const today = new Date().toISOString().split('T')[0];
      url += `?date=${today}`;
    } else if (templateType === 'levels') {
      url += '?ticker=SPY';
    }

    // Set loading state (use a brief shimmer, NOT the radar scanner)
    setPhase('scanning');
    setDim1Response({ type: templateType, data: null }); // null = loading

    try {
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setDim1Response({ type: templateType, data: json.data });
        setPhase('complete');
      } else {
        throw new Error(json.error || 'Failed to fetch data');
      }
    } catch (err: any) {
      console.error('DIM 1 fetch error:', err);
      setDim1Response(null);
      setPhase('idle');
      // Optionally show error toast
    }
  };

  const handleDim2Click = async (templateType: string, query: string, overrideTickers?: string[]) => {
    // Use override tickers if provided, otherwise fall back to watchlist
    const tickers = overrideTickers 
      || (watchlist.length > 0 ? watchlist.slice(0, 5) : ['SPY', 'QQQ', 'NVDA']);

    // Set loading state — use a QUICK radar ping (not full scanner)
    setPhase('scanning');
    setDim2Response({ type: templateType as any, data: null });
    setDim1Response(null);
    setCurrentAnalysis({ startTime: Date.now() });
    setCurrentStep('Fetching market data...');
    setActiveSegments([0]);

    // Start elapsed timer
    const startTime = Date.now();
    const elapsedInterval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      const res = await fetch('/api/ai/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateType,
          tickers,
          context: {
            month: new Date().getMonth() + 1,
            regime: undefined, // Will be fetched server-side
          },
        }),
        signal: AbortSignal.timeout(20000), // 20s client timeout
      });

      clearInterval(elapsedInterval);

      const json = await res.json();
      if (json.success) {
        setDim2Response({ type: templateType as any, data: json.data });
        setCompletedSegments([0, 1]);
        setPhase('complete');
      } else {
        throw new Error(json.error || 'Format request failed');
      }
    } catch (err: any) {
      clearInterval(elapsedInterval);
      console.error('DIM 2 error:', err);
      setDim2Response(null);
      setPhase('idle');
      // Show error in chat
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: `Error: ${err.message || 'Failed to generate analysis'}`,
        timestamp: new Date(),
      });
    }
  };

  const handleCardClick = (query: string, dimension?: number, apiEndpoint?: string, overrideTickers?: string[]) => {
    if (dimension === 1 && apiEndpoint) {
      // DIM 1: Direct data fetch + template render
      handleDim1Click(apiEndpoint, query);
      return;
    }
    if (dimension === 2 && apiEndpoint) {
      // DIM 2: apiEndpoint doubles as template name
      handleDim2Click(apiEndpoint, query, overrideTickers);
      return;
    }
    // DIM 3-4: Pre-fill input (existing behavior)
    setInput(query);
    setTimeout(() => {
      const inputEl = document.querySelector('input[type="text"]') as HTMLInputElement;
      inputEl?.focus();
    }, 100);
  };

  const handleFollowUp = (query: string) => {
    if (query === '__NEW_ANALYSIS__') {
      handleNewAnalysis();
      return;
    }
    setDim1Response(null);
    setDim2Response(null);
    setInput(query);
    setTimeout(() => {
      const inputEl = document.querySelector('input[type="text"]') as HTMLInputElement;
      inputEl?.focus();
    }, 100);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit();
  };

  // Determine if we should show split-screen (skip for quick mode)
  const showSplitScreen = phase === 'scanning' || phase === 'building';
  const skipSplitScreen = analysisDepth === 'quick' && phase === 'scanning';

  return (
    <div className="min-h-screen" style={{ background: '#060810' }}>
      <Navbar />
      <div className="flex h-[calc(100vh-64px)]">
        {/* Left Sidebar */}
        <div
          className={`
            hidden lg:block flex-shrink-0 border-r border-[rgba(255,255,255,0.04)] overflow-hidden
            ${leftSidebarOpen ? 'block' : ''}
          `}
          style={{ background: '#060810', width: '240px', maxWidth: '240px' }}
        >
          <MarketContextSidebar watchlist={watchlist} onTickerClick={handleTickerClick} />
        </div>

        {/* Mobile Sidebar Toggle */}
        {selectedSymbol && (
          <button
            onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
            className="lg:hidden fixed top-20 left-4 z-50 p-2 rounded bg-[rgba(0,0,0,0.6)] border border-[rgba(255,255,255,0.1)]"
          >
            {leftSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        )}

        {/* Mobile Sidebar Overlay */}
        {selectedSymbol && leftSidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setLeftSidebarOpen(false)}>
            <div
              className="absolute left-0 top-0 bottom-0 w-[240px] bg-[#060810] border-r border-[rgba(255,255,255,0.04)] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <MarketContextSidebar watchlist={watchlist} onTickerClick={handleTickerClick} />
            </div>
          </div>
        )}

        {/* Center Column */}
        <div className="flex-1 flex flex-col min-w-0" style={{ background: '#060810' }}>
          <div className="flex-1 overflow-y-auto p-6 lg:p-8">
            {/* No symbol selected — show symbol entry */}
            {!selectedSymbol && (
              <SymbolEntry
                watchlist={watchlist}
                onSymbolSelect={handleSymbolSelect}
                regime={regime ? { status: regime.status, vix: regime.vixLevel || regime.vix } : undefined}
              />
            )}

            {/* Symbol selected — show hub */}
            {selectedSymbol && phase === 'idle' && (
              <SymbolHub
                symbol={selectedSymbol}
                onBack={handleBackToSearch}
                onAskAI={(query) => {
                  setInput(query);
                  setTimeout(() => {
                    const inputEl = document.querySelector('input[type="text"]') as HTMLInputElement;
                    inputEl?.focus();
                  }, 100);
                }}
              />
            )}

            {/* Keep existing scanning/building/complete states for now */}
            {/* These will be refactored in a later prompt once the hub is built */}
            {selectedSymbol && (phase === 'scanning' || phase === 'building') && !skipSplitScreen && !dim1Response && !dim2Response && (
              <div className="flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto">
                {/* Radar Scanner */}
                <div className="w-full lg:w-[240px] flex-shrink-0 flex justify-center">
                  <RadarScanner
                    activeSegments={activeSegments}
                    completedSegments={completedSegments}
                    centerData={{
                      ticker: currentAnalysis?.ticker || selectedSymbol,
                      price: currentAnalysis?.ticker && prices?.[currentAnalysis.ticker]?.price
                        ? `$${prices[currentAnalysis.ticker].price.toFixed(2)}`
                        : undefined,
                      status: phase === 'building' ? 'ACQUIRED' : undefined,
                    }}
                    currentStep={currentStep}
                    elapsed={elapsed}
                    onCancel={handleCancel}
                  />
                </div>

                {/* Report Builder */}
                <div className="flex-1">
                  <LiveReportBuilder
                    ticker={currentAnalysis?.ticker || 'MARKET'}
                    visibleRows={visibleRows}
                    showFlow={showFlow}
                    showVerdict={showVerdict}
                    verdict={currentAnalysis?.parsed?.verdict}
                    optionsPositioning={currentAnalysis?.parsed?.analysis?.substring(0, 100)}
                    marketData={
                      currentAnalysis?.parsed?.snapshot
                        ? {
                            previousClose: currentAnalysis.parsed.snapshot.price
                              ? `$${currentAnalysis.parsed.snapshot.price.toFixed(2)}`
                              : undefined,
                            gap: currentAnalysis.parsed.snapshot.changePercent
                              ? `${currentAnalysis.parsed.snapshot.changePercent >= 0 ? '+' : ''}${currentAnalysis.parsed.snapshot.changePercent.toFixed(2)}%`
                              : undefined,
                            sessionRange: currentAnalysis.parsed.snapshot.callWall && currentAnalysis.parsed.snapshot.putWall
                              ? `$${currentAnalysis.parsed.snapshot.putWall.toFixed(0)} – $${currentAnalysis.parsed.snapshot.callWall.toFixed(0)}`
                              : undefined,
                          }
                        : undefined
                    }
                  />
                </div>
              </div>
            )}

            {/* DIM 1 Loading — Brief skeleton shimmer */}
            {selectedSymbol && phase === 'scanning' && dim1Response && !dim1Response.data && !dim2Response && (
              <div className="max-w-4xl mx-auto space-y-3">
                <div className="h-8 w-48 rounded bg-[rgba(255,255,255,0.05)] animate-pulse" />
                <div className="h-64 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] animate-pulse" />
              </div>
            )}

            {/* DIM 2 Loading — Quick scan indicator */}
            {selectedSymbol && phase === 'scanning' && dim2Response && !dim2Response.data && (
              <div className="max-w-4xl mx-auto text-center space-y-4 py-12">
                <div className="text-lg text-white font-semibold">Analyzing {dim2Response.type.replace('_', ' ')}...</div>
                <div className="text-sm text-[#8b99b0]">{currentStep}</div>
                <div className="text-3xl font-bold" style={{ color: '#00e5ff', fontFamily: "'Oxanium', monospace" }}>
                  {elapsed}s
                </div>
                <button onClick={handleCancel} className="text-xs text-[#6b7a99] hover:text-red-400 transition-colors">
                  ✕ Cancel
                </button>
              </div>
            )}

            {/* DIM 1 Complete — Structured Data Template */}
            {selectedSymbol && phase === 'complete' && dim1Response?.data && !dim2Response && (
              <div className="max-w-4xl mx-auto">
                {dim1Response.type === 'premarket' && (
                  <PremarketTemplate data={dim1Response.data} onFollowUp={handleFollowUp} />
                )}
                {dim1Response.type === 'gaps' && (
                  <GapsTemplate data={dim1Response.data} onFollowUp={handleFollowUp} />
                )}
                {dim1Response.type === 'calendar' && (
                  <CalendarTemplate data={dim1Response.data} onFollowUp={handleFollowUp} />
                )}
              </div>
            )}

            {/* DIM 2 Complete — Structured Template + AI Narrative */}
            {selectedSymbol && phase === 'complete' && dim2Response?.data && (
              <div className="max-w-4xl mx-auto">
                {dim2Response.type === 'bullish_setups' && (
                  <BullishSetupsTemplate data={dim2Response.data} onFollowUp={handleFollowUp} />
                )}
                {dim2Response.type === 'seasonality' && (
                  <SeasonalityTemplate data={dim2Response.data} onFollowUp={handleFollowUp} />
                )}
                {dim2Response.type === 'eod_summary' && (
                  <EODSummaryTemplate data={dim2Response.data} onFollowUp={handleFollowUp} />
                )}
                {dim2Response.type === 'afterhours_movers' && (
                  <AfterhoursTemplate data={dim2Response.data} onFollowUp={handleFollowUp} />
                )}
              </div>
            )}

            {/* Quick mode - show simple loading */}
            {selectedSymbol && skipSplitScreen && phase === 'scanning' && !dim1Response && !dim2Response && (
              <div className="max-w-2xl mx-auto text-center space-y-4">
                <div className="text-lg text-white font-semibold">Analyzing...</div>
                <div className="text-sm text-[#8b99b0]">{currentStep}</div>
                <div
                  className="text-3xl font-bold"
                  style={{ color: '#00e5ff', fontFamily: "'Oxanium', monospace" }}
                >
                  {elapsed}s
                </div>
                <button
                  onClick={handleCancel}
                  className="text-xs text-[#6b7a99] hover:text-red-400 transition-colors"
                >
                  ✕ Cancel
                </button>
              </div>
            )}

            {selectedSymbol && phase === 'complete' && currentAnalysis?.parsed && !dim1Response && !dim2Response && (
              <div className="max-w-4xl mx-auto">
                <AnalysisResponse
                  parsed={currentAnalysis.parsed}
                  rawContent={currentAnalysis.content || ''}
                  ticker={currentAnalysis.ticker}
                  onGoDeeper={() => {
                    const nextDepth: AnalysisDepth = analysisDepth === 'quick' ? 'analysis' : 'full';
                    setAnalysisDepth(nextDepth);
                    handleSubmit(input || messages[messages.length - 1]?.content || '');
                  }}
                  onFollowUp={handleFollowUp}
                  onNewAnalysis={handleNewAnalysis}
                />
              </div>
            )}
          </div>

          {/* Input Bar */}
          {selectedSymbol && (
            <div className="border-t border-[rgba(255,255,255,0.04)] p-4 lg:p-6" style={{ background: '#060810' }}>
            <div className="max-w-4xl mx-auto space-y-3">
              <AnalysisModeSelector value={analysisDepth} onChange={handleAnalysisDepthChange} />
              <form onSubmit={handleFormSubmit} className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about prices, levels, or trading analysis..."
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 rounded-lg text-sm text-white placeholder:text-[#4a6070] focus:outline-none focus:ring-2 focus:ring-[#00e5ff] focus:border-transparent min-h-[48px]"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="min-h-[48px] px-6"
                  style={{
                    background: '#00e5ff',
                    color: '#0a0f1a',
                  }}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span>Analyze</span>
                      <Send className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>
          )}
        </div>

        {/* Right Sidebar */}
        {selectedSymbol && (
          <div
            className="hidden xl:block w-[220px] flex-shrink-0 border-l border-[rgba(255,255,255,0.04)]"
            style={{ background: '#060810' }}
          >
            <RecentInsightsSidebar onInsightClick={handleCardClick} onTrendingClick={handleCardClick} />
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
