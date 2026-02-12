'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, TrendingUp, BarChart3, Newspaper, Settings, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Command {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  category: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  watchlist?: string[];
  onQuery?: (query: string) => void;
}

export function CommandPalette({ isOpen, onClose, watchlist = [], onQuery }: CommandPaletteProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands: Command[] = [
    // Navigation
    {
      id: 'dashboard',
      label: 'Go to Dashboard',
      icon: <LayoutDashboard className="h-4 w-4" />,
      action: () => router.push('/app'),
      category: 'Navigation',
    },
    {
      id: 'flow',
      label: 'Options Flow',
      icon: <TrendingUp className="h-4 w-4" />,
      action: () => router.push('/app/flow'),
      category: 'Navigation',
    },
    {
      id: 'news',
      label: 'News Feed',
      icon: <Newspaper className="h-4 w-4" />,
      action: () => router.push('/app/news'),
      category: 'Navigation',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="h-4 w-4" />,
      action: () => router.push('/app/settings'),
      category: 'Navigation',
    },
    // Quick queries
    {
      id: 'spy-levels',
      label: 'SPY Levels',
      icon: <BarChart3 className="h-4 w-4" />,
      action: () => {
        onQuery?.('What are SPY levels today?');
        onClose();
      },
      category: 'Quick Queries',
    },
    {
      id: 'market-regime',
      label: 'Market Regime',
      icon: <TrendingUp className="h-4 w-4" />,
      action: () => {
        onQuery?.('What is the current market regime?');
        onClose();
      },
      category: 'Quick Queries',
    },
    // Watchlist tickers
    ...watchlist.slice(0, 5).map((ticker) => ({
      id: `ticker-${ticker}`,
      label: `Analyze ${ticker}`,
      icon: <BarChart3 className="h-4 w-4" />,
      action: () => {
        onQuery?.(`Build a thesis on ${ticker}`);
        onClose();
      },
      category: 'Watchlist',
    })),
  ];

  const filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl z-50">
        <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-background-card shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 p-4 border-b border-[rgba(255,255,255,0.06)]">
            <Search className="h-5 w-5 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Search commands, tickers, or ask a question..."
              className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none"
              autoFocus
            />
            <kbd className="px-2 py-1 text-xs rounded border border-[rgba(255,255,255,0.1)] text-text-muted">
              ESC
            </kbd>
          </div>

          {/* Commands List */}
          <div className="max-h-96 overflow-y-auto">
            {filteredCommands.length === 0 ? (
              <div className="p-8 text-center text-text-muted">
                <p>No commands found</p>
              </div>
            ) : (
              <div className="py-2">
                {filteredCommands.map((command, idx) => (
                  <button
                    key={command.id}
                    onClick={command.action}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 hover:bg-background-elevated transition-colors text-left',
                      idx === selectedIndex && 'bg-background-elevated'
                    )}
                  >
                    <div className="text-text-muted">{command.icon}</div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-text-primary">{command.label}</div>
                      <div className="text-xs text-text-muted">{command.category}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
