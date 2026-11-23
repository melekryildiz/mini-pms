'use client';

import { useQuery } from '@tanstack/react-query';
import type { GetUnitInstantValuesResponse } from '@mini-pms/contracts';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';

export function useUnitInstantValues(unitId: string | null) {
  return useQuery({
    // Her birimin verisi cache'te ayrı tutulur.
    queryKey: ['unit-instant-values', unitId],

    // Kullanıcı henüz birim seçmediyse istek gönderme.
    enabled: Boolean(unitId),

    queryFn: ({ signal }) => {
      // enabled otomatik isteği engeller.
      // Bu kontrol, birim seçilmeden elle refetch çağrılmasını da karşılar.
      if (!unitId) {
        throw new Error('Önce bir birim seçmelisin.');
      }

      return apiClient<GetUnitInstantValuesResponse>(
        `/units/${encodeURIComponent(unitId)}/instant-values`,
        {
          // Sorgu iptal edilirse fetch isteği de iptal edilebilir.
          signal,

          // Güncel veriyi HTTP cache'inden alma.
          cache: 'no-store',
        },
      );
    },

    // Ekran açıkken 30 saniyede bir yeniden iste.
    refetchInterval: 30_000,
    // Sekme arka plandayken de polling iste; tarayıcı zamanlayıcıları
    // yavaşlatabilir. Geri dönüldüğünde ayrıca güncel veriyi al.
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,

    retry: (failureCount, error) => {
      // Yetki veya yanlış istek gibi hataları tekrar denemek çözmez.
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        return false;
      }

      // Geçici bağlantı/sunucu hatasında bir kez daha dene.
      return failureCount < 1;
    },
  });
}
