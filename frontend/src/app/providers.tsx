'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { FeedbackProvider } from '@/components/feedback/FeedbackProvider';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { PwaUpdater } from '@/components/pwa/PwaUpdater';
import { GraphQLRequestError } from '@/lib/graphql';
import { ThemeRegistry } from '@/theme/ThemeRegistry';

function shouldRetry(failureCount: number, error: Error): boolean {
  // GraphQL errors (validation, permissions, auth) will not fix themselves.
  if (error instanceof GraphQLRequestError) return false;
  return failureCount < 2;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: shouldRetry, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <ThemeRegistry>
      <QueryClientProvider client={queryClient}>
        <FeedbackProvider>{children}</FeedbackProvider>
        <OfflineBanner />
        <PwaUpdater />
      </QueryClientProvider>
    </ThemeRegistry>
  );
}
