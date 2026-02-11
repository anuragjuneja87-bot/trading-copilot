'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { SessionProvider } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { initializeSocket, disconnectSocket } from '@/lib/socket';
import { ToastContainer } from '@/components/ui/toast';

// Create a client with good defaults for trading data
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Don't refetch on window focus for trading app (too disruptive)
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        // Keep data fresh for 30 seconds by default
        staleTime: 30 * 1000,
        // Cache data for 5 minutes
        gcTime: 5 * 60 * 1000,
        // Retry failed requests 2 times with exponential backoff
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
        // Show stale data while fetching new data
        placeholderData: (previousData: unknown) => previousData,
      },
      mutations: {
        // Retry mutations once
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  }
  // Browser: reuse the same query client
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

// ═══════════════════════════════════════════════════════════════
//  PROVIDERS COMPONENT
// ═══════════════════════════════════════════════════════════════

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  // Initialize WebSocket connection on mount
  useEffect(() => {
    // Only initialize in browser and if URL is configured
    if (typeof window !== 'undefined') {
      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
      if (socketUrl && socketUrl.trim() !== '') {
        initializeSocket();
      }
    }

    return () => {
      disconnectSocket();
    };
  }, []);

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <ToastContainer />
        {process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools initialIsOpen={false} position="bottom" />
        )}
      </QueryClientProvider>
    </SessionProvider>
  );
}

// ═══════════════════════════════════════════════════════════════
//  THEME PROVIDER (for future dark/light mode)
// ═══════════════════════════════════════════════════════════════

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Force dark mode for trading app
    document.documentElement.classList.add('dark');
  }, []);

  return <>{children}</>;
}
