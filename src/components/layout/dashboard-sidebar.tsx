'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  BarChart3,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  Zap,
  FileText,
  Eye,
  Newspaper,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  badgeType?: 'count' | 'new' | 'activity';
  weight?: 'primary' | 'normal' | 'secondary';
}

const tradeSection: NavItem[] = [
  { name: 'Command Center', href: '/app', icon: LayoutDashboard, weight: 'primary' },
  { name: 'Options Flow', href: '/app/flow', icon: BarChart3, weight: 'primary' },
  { name: 'Dark Pool', href: '/app/darkpool', icon: Eye, badgeType: 'activity' },
];

const intelligenceSection: NavItem[] = [
  { name: 'Thesis Report', href: '/app/thesis', icon: FileText },
  { name: 'News', href: '/app/news', icon: Newspaper, badgeType: 'new' },
  { name: 'Alerts', href: '/app/alerts', icon: Bell, badgeType: 'count' },
];

export function DashboardSidebar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [tickerSearch, setTickerSearch] = useState('');
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Check screen size for auto-collapse
  useEffect(() => {
    const checkScreenSize = () => {
      if (window.innerWidth < 1200) {
        setIsCollapsed(true);
      }
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Keyboard shortcut for search (⌘K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isCollapsed) setIsCollapsed(false);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCollapsed]);

  // Fetch badge data
  const { data: alertsData } = useQuery({
    queryKey: ['alerts-count'],
    queryFn: async () => {
      // TODO: Replace with actual alerts API
      return { count: 0 };
    },
    refetchInterval: 30000,
  });

  const { data: newsData } = useQuery({
    queryKey: ['news-new-count'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/news?limit=10');
        const data = await res.json();
        if (data.success && data.data?.articles) {
          // Check for articles from last hour
          const oneHourAgo = Date.now() - 60 * 60 * 1000;
          const newCount = data.data.articles.filter((a: any) => {
            const published = new Date(a.publishedAt).getTime();
            return published > oneHourAgo;
          }).length;
          return { hasNew: newCount > 0 };
        }
      } catch {}
      return { hasNew: false };
    },
    refetchInterval: 60000,
  });

  const { data: darkPoolData } = useQuery({
    queryKey: ['darkpool-activity'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/darkpool?limit=5');
        const data = await res.json();
        if (data.success && data.data?.prints) {
          // Check for prints in last 5 minutes
          const fiveMinAgo = Date.now() - 5 * 60 * 1000;
          const recentPrints = data.data.prints.filter((p: any) => {
            return p.timestampMs > fiveMinAgo && p.significance >= 4;
          });
          return { hasActivity: recentPrints.length > 0 };
        }
      } catch {}
      return { hasActivity: false };
    },
    refetchInterval: 30000,
  });

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  const handleTickerSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (tickerSearch.trim()) {
      router.push(`/app/flow?tickers=${tickerSearch.toUpperCase()}`);
      setTickerSearch('');
    }
  };

  const renderNavItem = (item: NavItem) => {
    const isActive = pathname === item.href;
    const Icon = item.icon;
    
    // Get badge content
    let badgeContent: string | number | null = null;
    if (item.badgeType === 'count' && alertsData?.count) {
      badgeContent = alertsData.count;
    } else if (item.badgeType === 'new' && newsData?.hasNew) {
      badgeContent = 'NEW';
    } else if (item.badgeType === 'activity' && darkPoolData?.hasActivity) {
      // Activity indicator (pulsing dot)
    }

    const itemContent = (
      <Link
        href={item.href}
        onClick={() => setMobileMenuOpen(false)}
        onMouseEnter={() => setHoveredItem(item.href)}
        onMouseLeave={() => setHoveredItem(null)}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all relative group',
          isActive
            ? 'bg-[#00e5ff]/10 text-[#00e5ff] border-l-[3px] border-[#00e5ff]'
            : 'text-text-secondary hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)]',
          item.weight === 'primary' && 'font-medium',
          item.weight === 'secondary' && 'text-xs text-text-muted'
        )}
        title={isCollapsed ? item.name : undefined}
      >
        <Icon className={cn(
          'h-5 w-5 flex-shrink-0',
          isActive && 'text-[#00e5ff]'
        )} />
        {!isCollapsed && (
          <>
            <span className={cn(
              'flex-1',
              item.weight === 'primary' && 'font-medium',
              item.weight === 'secondary' && 'text-xs'
            )}>
              {item.name}
            </span>
            {badgeContent && (
              <span className={cn(
                'px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                item.badgeType === 'count' && 'bg-[#ff5252] text-white min-w-[18px] text-center',
                item.badgeType === 'new' && 'bg-[#00e5ff] text-[#0a0f1a] px-2'
              )}>
                {badgeContent}
              </span>
            )}
            {item.badgeType === 'activity' && darkPoolData?.hasActivity && (
              <span className="h-2 w-2 rounded-full bg-[#00e5ff] animate-pulse" />
            )}
          </>
        )}
        {isCollapsed && hoveredItem === item.href && (
          <div className="absolute left-full ml-2 px-2 py-1 rounded bg-background-card border border-[rgba(255,255,255,0.06)] text-sm text-text-primary whitespace-nowrap z-50 shadow-lg">
            {item.name}
            {badgeContent && (
              <span className={cn(
                'ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                item.badgeType === 'count' && 'bg-[#ff5252] text-white',
                item.badgeType === 'new' && 'bg-[#00e5ff] text-[#0a0f1a]'
              )}>
                {badgeContent}
              </span>
            )}
          </div>
        )}
      </Link>
    );

    return itemContent;
  };

  const renderSection = (title: string, items: NavItem[]) => (
    <div className={cn('space-y-1', !isCollapsed && 'mb-6')}>
      {!isCollapsed && (
        <div className="px-3 mb-2">
          <span className="text-[9px] font-bold uppercase tracking-[2px] text-[#6b7a99]">
            {title}
          </span>
        </div>
      )}
      {items.map((item) => (
        <div key={item.href}>
          {renderNavItem(item)}
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* Mobile menu button - only show on mobile */}
      <button
        type="button"
        className="lg:hidden fixed top-4 left-4 z-50 p-3 rounded-lg bg-background-card border border-[rgba(255,255,255,0.06)] text-text-primary min-h-[44px] min-w-[44px] flex items-center justify-center"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        {mobileMenuOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Menu className="h-5 w-5" />
        )}
      </button>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-40 bg-background-card border-r border-[rgba(255,255,255,0.06)] transform transition-all duration-300 ease-in-out',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          isCollapsed ? 'w-16' : 'w-64',
          'lg:block hidden' // Hide on mobile by default, show on desktop
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <Link 
            href="/" 
            className={cn(
              'flex items-center gap-2 px-6 py-4 border-b border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.02)] transition-colors',
              isCollapsed && 'justify-center px-4'
            )}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00e5ff] flex-shrink-0">
              <Zap className="h-5 w-5 text-[#0a0f1a]" />
            </div>
            {!isCollapsed && (
              <span className="text-lg font-bold text-text-primary">
                Trading<span className="text-[#00e5ff]">Copilot</span>
              </span>
            )}
          </Link>

          {/* Ticker Search */}
          {!isCollapsed && (
            <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
              <form onSubmit={handleTickerSearch} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={tickerSearch}
                  onChange={(e) => setTickerSearch(e.target.value.toUpperCase())}
                  placeholder="Search tickers... ⌘K"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[#00e5ff]/50"
                />
              </form>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 overflow-y-auto">
            {renderSection('TRADE', tradeSection)}
            {renderSection('INTELLIGENCE', intelligenceSection)}
          </nav>

          {/* Bottom Section */}
          <div className="px-4 py-4 border-t border-[rgba(255,255,255,0.06)] space-y-1">
            <Link
              href="/app/settings"
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-[rgba(255,255,255,0.02)] transition-colors',
                pathname === '/app/settings' && 'text-[#00e5ff] bg-[#00e5ff]/10'
              )}
              title={isCollapsed ? 'Settings' : undefined}
            >
              <Settings className="h-4 w-4 flex-shrink-0" />
              {!isCollapsed && 'Settings'}
            </Link>
            <button
              onClick={handleSignOut}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-[rgba(255,255,255,0.02)] w-full transition-colors',
                isCollapsed && 'justify-center'
              )}
              title={isCollapsed ? 'Log Out' : undefined}
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              {!isCollapsed && 'Log Out'}
            </button>
          </div>

          {/* Collapse Toggle */}
          <div className="px-4 py-3 border-t border-[rgba(255,255,255,0.06)]">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-[rgba(255,255,255,0.02)] transition-colors text-text-muted hover:text-text-primary"
              title={isCollapsed ? 'Expand' : 'Collapse'}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </aside>

    </>
  );
}
