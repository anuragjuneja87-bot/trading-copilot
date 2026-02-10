'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  Menu, 
  X, 
  Zap, 
  BarChart3, 
  MessageSquare,
  ChevronDown,
  User,
  LogOut,
  LayoutDashboard
} from 'lucide-react';

const navigation = [
  { name: 'Options Flow', href: '/flow', icon: BarChart3 },
  { name: 'Ask AI', href: '/ask', icon: MessageSquare, badge: 'Free' },
  { name: 'Pricing', href: '/pricing' },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { data: session, status } = useSession();

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
        {/* Logo */}
        <div className="flex lg:flex-1">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
              <Zap className="h-5 w-5 text-background" />
            </div>
            <span className="text-lg font-bold text-text-primary">
              Trading<span className="text-accent">Copilot</span>
            </span>
          </Link>
        </div>

        {/* Mobile menu button */}
        <div className="flex lg:hidden">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2.5 text-text-secondary hover:text-text-primary"
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

        {/* Desktop navigation */}
        <div className="hidden lg:flex lg:gap-x-8">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              {item.icon && <item.icon className="h-4 w-4" />}
              {item.name}
              {item.badge && (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </div>

        {/* Desktop auth buttons */}
        <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:gap-x-4">
          {status === 'loading' ? (
            <div className="flex items-center gap-4">
              <div className="h-8 w-8 rounded-full bg-background-surface animate-pulse" />
            </div>
          ) : session?.user ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-background-elevated transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center">
                  <User className="h-4 w-4 text-accent" />
                </div>
                <span className="text-sm font-medium text-text-primary">
                  {session.user.name || session.user.email?.split('@')[0]}
                </span>
                <ChevronDown className="h-4 w-4 text-text-secondary" />
              </button>
              
              {userMenuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 rounded-lg border border-border bg-background-card shadow-lg z-20">
                    <div className="p-2">
                      <Link
                        href="/app"
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-background-elevated transition-colors"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
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
              <Button variant="ghost" asChild>
                <Link href="/login">Log In</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Start Free</Link>
              </Button>
            </>
          )}
        </div>
      </nav>

      {/* Mobile menu */}
      <div
        className={cn(
          'lg:hidden',
          mobileMenuOpen ? 'block' : 'hidden'
        )}
      >
        <div className="space-y-1 border-t border-border bg-background px-4 py-4">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-base font-medium text-text-secondary hover:bg-background-elevated hover:text-text-primary"
              onClick={() => setMobileMenuOpen(false)}
            >
              {item.icon && <item.icon className="h-5 w-5" />}
              {item.name}
              {item.badge && (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            {session?.user ? (
              <>
                <Link
                  href="/app"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-base font-medium text-text-secondary hover:bg-background-elevated hover:text-text-primary"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <LayoutDashboard className="h-5 w-5" />
                  Dashboard
                </Link>
                <button
                  onClick={() => {
                    handleSignOut();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-base font-medium text-text-secondary hover:bg-background-elevated hover:text-text-primary"
                >
                  <LogOut className="h-5 w-5" />
                  Log Out
                </button>
              </>
            ) : (
              <>
                <Button variant="outline" asChild className="w-full">
                  <Link href="/login">Log In</Link>
                </Button>
                <Button asChild className="w-full">
                  <Link href="/signup">Start Free</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
