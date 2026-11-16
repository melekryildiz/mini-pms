import 'server-only';

import { ApiError } from './api-error';

// Bu değişken NEXT_PUBLIC_ ile başlamaz. Dolayısıyla backend adresi yalnızca
// Next.js sunucusunda bulunur ve tarayıcı paketine yazılmaz.
const API_GATEWAY_URL =
  process.env.API_GATEWAY_URL ?? 'http://localhost:3001/api';

type QueryValue = string | number | boolean | null | undefined;

export type GatewayRequestOptions = Omit<RequestInit, 'headers'> & {
  accessToken: string;
  headers?: HeadersInit;
  query?: Record<string, QueryValue>;
};

function buildUrl(path: string, query?: Record<string, QueryValue>): URL {
  // Mutlak URL kabul etmeyerek bu client'ın yanlışlıkla başka hostlara token
  // göndermesini engelliyoruz.
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Gateway path must start with a single slash');
  }

  const url = new URL(`${API_GATEWAY_URL.replace(/\/$/, '')}${path}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function getErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const candidate = body as Record<string, unknown>;

    if (typeof candidate.message === 'string') return candidate.message;
    if (typeof candidate.error === 'string') return candidate.error;
  }

  return `API request failed (${status})`;
}

/**
 * Next.js sunucusundan NestJS API Gateway'e yapılan bütün isteklerin ortak
 * giriş noktasıdır. Token ekleme, query oluşturma ve hata çevirme burada bir
 * kez yapılır; her sayfa aynı kodu tekrar yazmaz.
 */
export async function gatewayFetch(
  path: string,
  options: GatewayRequestOptions,
): Promise<Response> {
  const { accessToken, query, headers, ...requestInit } = options;
  return fetch(buildUrl(path, query), {
    ...requestInit,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...headers,
    },
    // Kullanıcıya özel yanıtların Next.js cache'inde paylaşılmasını istemeyiz.
    cache: 'no-store',
    signal: requestInit.signal ?? AbortSignal.timeout(8_000),
  });
}

export async function gatewayRequest<T>(
  path: string,
  options: GatewayRequestOptions,
): Promise<T> {
  const response = await gatewayFetch(path, options);

  const contentType = response.headers.get('content-type') ?? '';
  const body: unknown = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      getErrorMessage(body, response.status),
      body,
    );
  }

  return body as T;
}
