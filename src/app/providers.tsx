'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect, useState } from 'react';
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
  
  // Fetch WS key from server at runtime (not baked into JS bundle)
  const [wsKey, setWsKey] = useState('');
  
  useEffect(() => {
    fetch('/api/ws/token')
      .then(res => res.json())
      .then(data => {
        if (data.key) setWsKey(data.key);
      })
      .catch(err => console.warn('[Providers] Failed to fetch WS token:', err));
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider apiKey={wsKey}>
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
