'use client';

import { useState, type ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

export function QueryProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Her render'da yeni QueryClient oluşturmayalım.
  // Bu provider açık kaldığı sürece aynı client kullanılır.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Başarısız isteği bir kez daha dene.
            retry: 1,

            // Sekmeye dönünce ayrıca istek başlatma.
            // Anlık izleme için polling'i ayrı tanımlayacağız.
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}