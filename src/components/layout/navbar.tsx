'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LiveTickerBar } from './live-ticker-bar';
import {
  Menu,
  X,
  Zap,
} from 'lucide-react';

const navigation = [
  { name: 'War Room', href: '/ask' },
  { name: 'Options Flow', href: '/flow' },
  { name: 'Dark Pool', href: '/darkpool' },
  { name: 'Gamma Levels', href: '/levels' },
  { name: 'Pulse', href: '/pulse' },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

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
            <Link href="/ask" className="flex items-center gap-2">
              <Zap className="h-5 w-5" style={{ color: '#00e5ff' }} />
              <span className="text-base font-semibold" style={{ fontSize: '16px', fontWeight: 600 }}>
                <span className="text-white">Trading</span>
                <span style={{ color: '#00e5ff' }}>Copilot</span>
              </span>
            </Link>
          </div>

          {/* CENTER: Navigation Links */}
          <div className="hidden md:flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.04)', padding: '3px', borderRadius: '10px' }}>
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'px-[18px] py-[7px] rounded-[7px] text-sm font-medium transition-colors',
                    isActive
                      ? 'text-white'
                      : 'text-[#71717a] hover:text-white hover:bg-[rgba(255,255,255,0.08)]'
                  )}
                  style={isActive ? { background: 'rgba(255,255,255,0.08)' } : {}}
                >
                  {item.name}
                </Link>
              );
            })}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-[#71717a] hover:text-white"
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
        </nav>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40" style={{ background: 'rgba(10, 15, 26, 0.95)', backdropFilter: 'blur-lg' }}>
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <span className="text-lg font-bold text-white">Menu</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-lg hover:bg-[rgba(255,255,255,0.08)] text-[#71717a]"
                  aria-label="Close menu"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-[#71717a] hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
