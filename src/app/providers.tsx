'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect } from 'react';
import { ToastContainer } from '@/components/ui/toast';
import { WebSocketProvider } from '@/lib/websocket';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
        placeholderData: (previousData: unknown) => previousData,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;
function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  
  // Use Massive.com API key (same key works for REST and WebSocket)
  const apiKey = process.env.NEXT_PUBLIC_POLYGON_API_KEY || process.env.NEXT_PUBLIC_MASSIVE_API_KEY || '';

  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider apiKey={apiKey}>
        {children}
      </WebSocketProvider>
      <ToastContainer />
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} position="bottom" />
      )}
    </QueryClientProvider>
  );
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => { document.documentElement.classList.add('dark'); }, []);
  return <>{children}</>;
}
