import { ApiError } from './api-error';

/**
 * Client Component'lerin kendi Next.js origin'indeki güvenli proxy'yi çağırması
 * için küçük yardımcı. Burada Bearer token yoktur; Auth.js cookie tarayıcı
 * tarafından aynı origin isteğine otomatik eklenir.
 */
export async function apiClient<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('API path must start with a single slash');
  }

  const response = await fetch(`/api/gateway${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const details =
      body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const backendMessage = details.message;
    const message = Array.isArray(backendMessage)
      ? backendMessage.filter((item) => typeof item === 'string').join(', ')
      : typeof backendMessage === 'string'
        ? backendMessage
        : typeof details.error === 'string'
          ? details.error
          : `Request failed (${response.status})`;

    throw new ApiError(response.status, message, body);
  }

  return body as T;
}
