'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LiveTickerBar } from './live-ticker-bar';
import {
  Menu,
  X,
  Zap,
  BarChart3,
  MessageSquare,
  ChevronDown,
  User,
  LogOut,
  LayoutDashboard,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/app' },
  { name: 'Options Flow', href: '/flow' },
  { name: 'Ask AI', href: '/ask', badge: 'Free' },
  { name: 'Pricing', href: '/pricing' },
];

const loggedInNavigation = [
  { name: 'Dashboard', href: '/app', icon: LayoutDashboard },
  { name: 'Options Flow', href: '/app/flow', icon: BarChart3 },
  { name: 'Ask AI', href: '/app', icon: MessageSquare },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { data: session, status } = useSession();
  const pathname = usePathname();

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  const isAuthenticated = !!session?.user;
  const isLandingPage = pathname === '/';

  return (
    <>
      {/* Live Ticker Bar - Always at top */}
      <div className="sticky top-0 z-[60]">
        <LiveTickerBar />
      </div>

      {/* Main Navigation Bar - Below ticker bar */}
      <header
        className="sticky top-8 z-50 w-full border-b border-[rgba(255,255,255,0.06)]"
        style={{
          backdropFilter: 'blur(12px)',
          background: 'rgba(10, 15, 26, 0.9)',
          minHeight: '56px',
        }}
      >
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 lg:px-8" style={{ minHeight: '56px', width: '100%' }}>
        {/* LEFT: Logo */}
        <div className="flex lg:flex-1">
          <Link href="/" className="flex items-center gap-2">
            <Zap className="h-5 w-5" style={{ color: '#00e5ff' }} />
            <span className="text-base font-semibold" style={{ fontSize: '16px', fontWeight: 600 }}>
              <span className="text-white">Trading</span>
              <span style={{ color: '#00e5ff' }}>Copilot</span>
            </span>
          </Link>
        </div>

        {/* CENTER: Navigation Links (Pill Container) - Show on landing page OR when unauthenticated */}
        {(isLandingPage || !isAuthenticated) && (
          <div className="hidden md:flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.04)', padding: '3px', borderRadius: '10px' }}>
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'px-[18px] py-[7px] rounded-[7px] text-sm font-medium transition-colors flex items-center gap-1.5',
                    isActive
                      ? 'text-white'
                      : 'text-[#71717a] hover:text-white hover:bg-[rgba(255,255,255,0.08)]'
                  )}
                  style={isActive ? { background: 'rgba(255,255,255,0.08)' } : {}}
                >
                  {item.name}
                  {item.badge && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ color: '#00e5ff', background: 'rgba(0,229,255,0.1)' }}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {/* Mobile menu button */}
        <div className="flex md:hidden">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2 text-text-secondary hover:text-text-primary"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="sr-only">Open main menu</span>
            {mobileMenuOpen ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* RIGHT: CTAs or User Menu */}
        <div className="hidden md:flex items-center gap-3">
          {status === 'loading' ? (
            <div className="flex items-center gap-4">
              <div className="h-8 w-8 rounded-full bg-background-surface animate-pulse" />
            </div>
          ) : isAuthenticated && !isLandingPage ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-background-elevated transition-colors"
                aria-label="User menu"
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#00e5ff] to-[#0097a7] flex items-center justify-center">
                  <span className="text-xs font-semibold text-[#0a0f1a]">
                    {(() => {
                      const name = session.user.name || session.user.email || 'U';
                      const parts = name.split(' ');
                      if (parts.length >= 2) {
                        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
                      }
                      return name.substring(0, 2).toUpperCase();
                    })()}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 text-text-secondary" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 rounded-lg border border-border bg-background-card shadow-lg z-20">
                    <div className="p-2">
                      <Link
                        href="/app/settings"
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-background-elevated transition-colors"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <User className="h-4 w-4" />
                        Settings
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-background-elevated transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                        Log Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Log In - Ghost Button */}
              <Link
                href="/login"
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                Log In
              </Link>
              {/* Start Free - Solid Cyan Button */}
              <Link
                href="/signup"
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: '#00e5ff',
                  color: '#0a0f1a',
                  fontWeight: 600,
                  boxShadow: '0 0 20px rgba(0,229,255,0.2)',
                }}
              >
                Start Free
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-background/95 backdrop-blur-lg">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="text-lg font-bold text-text-primary">Menu</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-background-elevated text-text-secondary"
                aria-label="Close menu"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
              {isAuthenticated
                ? loggedInNavigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-text-secondary hover:bg-background-elevated hover:text-text-primary"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.icon && <item.icon className="h-5 w-5" />}
                      {item.name}
                    </Link>
                  ))
                : navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-text-secondary hover:bg-background-elevated hover:text-text-primary"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.name}
                      {item.badge && (
                        <span
                          className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ color: '#00e5ff', background: 'rgba(0,229,255,0.1)' }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  ))}
              <div className="mt-6 flex flex-col gap-2 border-t border-border pt-6">
                {isAuthenticated ? (
                  <>
                    <Link
                      href="/app/settings"
                      className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-text-secondary hover:bg-background-elevated hover:text-text-primary"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <User className="h-5 w-5" />
                      Settings
                    </Link>
                    <button
                      onClick={() => {
                        handleSignOut();
                        setMobileMenuOpen(false);
                      }}
                      className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-text-secondary hover:bg-background-elevated hover:text-text-primary text-left"
                    >
                      <LogOut className="h-5 w-5" />
                      Log Out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="w-full px-4 py-2 rounded-lg text-sm font-medium text-white text-center transition-colors"
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Log In
                    </Link>
                    <Link
                      href="/signup"
                      className="w-full px-5 py-2 rounded-lg text-sm font-semibold text-center transition-all"
                      style={{
                        background: '#00e5ff',
                        color: '#0a0f1a',
                        fontWeight: 600,
                        boxShadow: '0 0 20px rgba(0,229,255,0.2)',
                      }}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Start Free
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
    </>
  );
}
