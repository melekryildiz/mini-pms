import { NextResponse, type NextRequest } from 'next/server';
import { gatewayAuth } from '@/auth';
import { gatewayFetch } from '@/lib/api';

export const dynamic = 'force-dynamic';

type AuthRouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

// Açık annotation, NextAuth'ın dahili route tipinin üretilen declaration'a
// sızmasını önler ve Next.js'in beklediği handler sözleşmesini görünür kılar.
type ProxyRouteHandler = (
  request: NextRequest,
  context: AuthRouteContext,
) => Response | void | Promise<Response | void>;

type SupportedMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * Proxy açık bir yönlendirici değildir. Yalnızca frontend'in gerçekten ihtiyaç
 * duyduğu mevcut backend yolları ve metotları buradan geçirilebilir.
 */
function isAllowedRoute(path: string, method: SupportedMethod): boolean {
  // Topoloji ağacının köklerini ve kodla arama sonuçlarını getirir.
  if (/^\/units\/navigation\/(?:roots|search)$/.test(path)) {
    return method === 'GET';
  }

  if (/^\/(units|devices)$/.test(path)) {
    return method === 'GET' || method === 'POST';
  }

  if (/^\/(units|devices)\/[^/]+$/.test(path)) {
    return ['GET', 'PATCH', 'DELETE'].includes(method);
  }

  if (
    /^\/units\/[^/]+\/(?:history|instant-values|navigation-children|tree|path)$/.test(
      path,
    )
  ) {
    return method === 'GET';
  }

  if (path === '/reactive-limits') {
    return method === 'GET' || method === 'POST';
  }

  if (/^\/reactive-limits\/[^/]+$/.test(path)) {
    return method === 'GET' || method === 'PATCH';
  }

  if (/^\/reactive-limits\/unit\/[^/]+(?:\/active)?$/.test(path)) {
    return method === 'GET';
  }

  return false;
}

function hasValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');

  // Browser dışındaki aynı uygulama içi çağrılarda Origin bulunmayabilir.
  // Varsa mutlaka Next.js uygulamasının origin'iyle aynı olmalıdır.
  return !origin || origin === request.nextUrl.origin;
}

const proxyHandler: ProxyRouteHandler = gatewayAuth(
  async (request, context) => {
    if (!request.auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (
      request.auth.error === 'RefreshTokenError' ||
      !request.auth.accessToken
    ) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }

    const { path: rawPath } = await context.params;
    const segments = Array.isArray(rawPath)
      ? rawPath
      : typeof rawPath === 'string'
        ? [rawPath]
        : [];
    const path = `/${segments.map(encodeURIComponent).join('/')}`;
    const method = request.method as SupportedMethod;

    if (!isAllowedRoute(path, method)) {
      return NextResponse.json({ error: 'Route not allowed' }, { status: 404 });
    }

    // Cookie tabanlı oturum kullanılan yazma isteklerinde farklı origin'den gelen
    // çağrıları reddederek CSRF riskini azaltıyoruz.
    if (method !== 'GET' && !hasValidOrigin(request)) {
      return NextResponse.json(
        { error: 'Invalid request origin' },
        { status: 403 },
      );
    }

    try {
      const contentType = request.headers.get('content-type');
      const upstream = await gatewayFetch(path, {
        accessToken: request.auth.accessToken,
        method,
        query: Object.fromEntries(request.nextUrl.searchParams),
        headers: contentType ? { 'Content-Type': contentType } : undefined,
        body: method === 'GET' ? undefined : await request.text(),
      });

      // Backend'in durum kodunu ve gövdesini değiştirmeden tarayıcıya taşıyoruz.
      // Böylece örneğin 201, 400 ve 403 anlamlarını korur.
      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type':
            upstream.headers.get('content-type') ?? 'application/json',
        },
      });
    } catch (error) {
      console.error('[Gateway proxy] Request failed', error);
      return NextResponse.json(
        { error: 'API Gateway unavailable' },
        { status: 502 },
      );
    }
  },
);

export const GET = proxyHandler;
export const POST = proxyHandler;
export const PATCH = proxyHandler;
export const DELETE = proxyHandler;
