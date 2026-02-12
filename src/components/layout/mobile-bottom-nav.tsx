'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  BarChart3,
  MessageSquare,
  Bell,
} from 'lucide-react';

const navItems = [
  { name: 'Home', href: '/app', icon: LayoutDashboard },
  { name: 'Flow', href: '/app/flow', icon: BarChart3 },
  { name: 'AI Chat', href: '/app?chat=true', icon: MessageSquare },
  { name: 'Alerts', href: '/app/alerts', icon: Bell },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleClick = (href: string) => {
    if (href.includes('?chat=true')) {
      // Special handling for chat - could open chat modal or navigate
      router.push('/app');
      // TODO: Open chat panel if needed
    } else {
      router.push(href);
    }
  };

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-14 bg-background-card border-t border-[rgba(255,255,255,0.06)] z-50 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-full px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || 
            (item.href === '/app' && pathname.startsWith('/app') && pathname !== '/app/flow' && pathname !== '/app/alerts');
          
          return (
            <button
              key={item.name}
              onClick={() => handleClick(item.href)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 flex-1 h-full min-h-[56px] transition-colors relative',
                isActive ? 'text-[#00e5ff]' : 'text-text-muted'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.name}</span>
              {isActive && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-[#00e5ff]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
