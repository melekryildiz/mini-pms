import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: null as null | { accessToken?: string; error?: string },
  gatewayFetch: vi.fn(),
}));

vi.mock('@/auth', () => ({
  gatewayAuth: vi.fn(
    (handler: (request: NextRequest, context: unknown) => unknown) =>
      (request: NextRequest, context: unknown) => {
        Object.defineProperty(request, 'auth', {
          configurable: true,
          value: mocks.auth,
        });
        return handler(request, context);
      },
  ),
}));

vi.mock('@/lib/api', () => ({ gatewayFetch: mocks.gatewayFetch }));

import {
  DELETE,
  GET,
  PATCH,
  POST,
} from '../src/app/api/gateway/[...path]/route';

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });

describe('authenticated API proxy', () => {
  const topologyPaths = [
    '/units/navigation/roots',
    '/units/navigation/search',
    '/units/7/navigation-children',
    '/units/7/tree',
    '/units/7/path',
  ];
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth = { accessToken: 'server-only-token' };
  });

  it.each(topologyPaths)(
    'forwards topology GET %s and its query',
    async (path) => {
      mocks.gatewayFetch.mockResolvedValue(Response.json({ data: [] }));
      const response = await GET(
        new NextRequest(`http://localhost/api/gateway${path}?limit=20`),
        context(path.slice(1).split('/')),
      );
      expect(response?.status).toBe(200);
      expect(mocks.gatewayFetch).toHaveBeenCalledWith(
        path,
        expect.objectContaining({
          method: 'GET',
          query: { limit: '20' },
        }),
      );
    },
  );

  it.each(topologyPaths)(
    'rejects writes to read-only topology route %s',
    async (path) => {
      for (const [method, handler] of [
        ['POST', POST],
        ['PATCH', PATCH],
        ['DELETE', DELETE],
      ] as const) {
        const response = await handler(
          new NextRequest(`http://localhost/api/gateway${path}`, { method }),
          context(path.slice(1).split('/')),
        );
        expect(response?.status).toBe(404);
      }
      expect(mocks.gatewayFetch).not.toHaveBeenCalled();
    },
  );

  it('rejects unknown nested routes', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/gateway/units/navigation/unknown'),
      context(['units', 'navigation', 'unknown']),
    );
    expect(response?.status).toBe(404);
    expect(mocks.gatewayFetch).not.toHaveBeenCalled();
  });

  it('rejects proxy access without an authenticated session', async () => {
    mocks.auth = null;
    const request = new NextRequest('http://localhost/api/gateway/units');

    const response = await GET(request, context(['units']));

    expect(response?.status).toBe(401);
    expect(mocks.gatewayFetch).not.toHaveBeenCalled();
  });

  it('forwards query parameters to the API Gateway', async () => {
    mocks.gatewayFetch.mockResolvedValue(
      Response.json({ data: [] }, { status: 200 }),
    );
    const request = new NextRequest(
      'http://localhost/api/gateway/units?page=2&limit=25&is_active=true',
    );

    const response = await GET(request, context(['units']));

    expect(mocks.gatewayFetch).toHaveBeenCalledWith(
      '/units',
      expect.objectContaining({
        method: 'GET',
        query: { page: '2', limit: '25', is_active: 'true' },
      }),
    );
    expect(response?.status).toBe(200);
  });

  it('forwards a JSON request body and preserves the 201 status', async () => {
    mocks.gatewayFetch.mockResolvedValue(
      Response.json({ id: 'unit-1' }, { status: 201 }),
    );
    const body = { code: 'UNIT-1', name: 'Test Unit' };
    const request = new NextRequest('http://localhost/api/gateway/units', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost',
      },
      body: JSON.stringify(body),
    });

    const response = await POST(request, context(['units']));

    expect(mocks.gatewayFetch).toHaveBeenCalledWith(
      '/units',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(response?.status).toBe(201);
    await expect(response?.json()).resolves.toEqual({ id: 'unit-1' });
  });

  it('preserves an authorization error returned by the backend', async () => {
    mocks.gatewayFetch.mockResolvedValue(
      Response.json({ message: 'Insufficient permissions' }, { status: 403 }),
    );
    const request = new NextRequest(
      'http://localhost/api/gateway/devices/device-1',
    );

    const response = await GET(request, context(['devices', 'device-1']));

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
  });

  it('allows unit history and paginated reactive-limit list routes', async () => {
    mocks.gatewayFetch.mockResolvedValue(Response.json({ data: [], total: 0 }));

    const historyResponse = await GET(
      new NextRequest('http://localhost/api/gateway/units/7/history?page=1'),
      context(['units', '7', 'history']),
    );
    const limitsResponse = await GET(
      new NextRequest(
        'http://localhost/api/gateway/reactive-limits?organization_unit_id=7',
      ),
      context(['reactive-limits']),
    );

    expect(historyResponse?.status).toBe(200);
    expect(limitsResponse?.status).toBe(200);
  });
});
