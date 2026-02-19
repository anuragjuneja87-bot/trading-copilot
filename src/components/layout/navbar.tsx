'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LiveTickerBar } from './live-ticker-bar';
import { YodhaLogo, YodhaWordmark } from '@/components/brand/yodha-logo';
import { Menu, X } from 'lucide-react';

const navigation = [
  { name: 'Yodha Room', href: '/ask' },
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

      {/* Main Navigation Bar */}
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
            <Link href="/" className="flex items-center gap-2.5">
              <YodhaLogo size={28} />
              <YodhaWordmark className="text-base" />
            </Link>
          </div>

          {/* CENTER: Navigation Links */}
          <div className="hidden md:flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '10px' }}>
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'px-5 py-2.5 rounded-lg text-base font-semibold transition-all duration-200',
                    isActive
                      ? 'text-white shadow-lg'
                      : 'text-gray-300 hover:text-white hover:bg-[rgba(255,255,255,0.1)]'
                  )}
                  style={isActive ? { 
                    background: 'rgba(0, 229, 255, 0.15)', 
                    border: '1px solid rgba(0, 229, 255, 0.3)',
                    color: '#00e5ff',
                    fontWeight: 600
                  } : {
                    fontWeight: 500
                  }}
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
          <div className="md:hidden fixed inset-0 z-40" style={{ background: 'rgba(10, 15, 26, 0.95)', backdropFilter: 'blur(16px)' }}>
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2">
                  <YodhaLogo size={24} />
                  <YodhaWordmark className="text-sm" />
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-lg hover:bg-[rgba(255,255,255,0.08)] text-[#71717a]"
                  aria-label="Close menu"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
                {navigation.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-4 py-3 text-base font-semibold transition-all",
                        isActive
                          ? "text-white bg-[rgba(0,229,255,0.15)] border border-[rgba(0,229,255,0.3)]"
                          : "text-gray-300 hover:bg-[rgba(255,255,255,0.1)] hover:text-white"
                      )}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
