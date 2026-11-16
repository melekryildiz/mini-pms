import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/lib/api-error';

const mocks = vi.hoisted(() => ({
  gatewayAuth: vi.fn(),
  gatewayRequest: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock('@/auth', () => ({ gatewayAuth: mocks.gatewayAuth }));
vi.mock('@/lib/api', () => ({ gatewayRequest: mocks.gatewayRequest }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
// `server-only` üretimde yanlış client importunu bilerek patlatır. Bu dosya ise
// server fonksiyonunu izole test ettiği için paketi boş modül olarak karşılar.
vi.mock('server-only', () => ({}));

import { requireUser } from '../src/lib/auth/require-user';

describe('protected access and error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects a user without a session to login', async () => {
    mocks.gatewayAuth.mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(mocks.gatewayRequest).not.toHaveBeenCalled();
  });

  it('redirects a refresh-token failure to login', async () => {
    mocks.gatewayAuth.mockResolvedValue({
      error: 'RefreshTokenError',
      accessToken: undefined,
    });

    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(mocks.gatewayRequest).not.toHaveBeenCalled();
  });

  it('does not treat an API Gateway outage as an authentication failure', async () => {
    const outage = new TypeError('fetch failed');
    mocks.gatewayAuth.mockResolvedValue({ accessToken: 'server-only-token' });
    mocks.gatewayRequest.mockRejectedValue(outage);

    await expect(requireUser()).rejects.toBe(outage);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('redirects when the API Gateway explicitly rejects the token', async () => {
    mocks.gatewayAuth.mockResolvedValue({ accessToken: 'server-only-token' });
    mocks.gatewayRequest.mockRejectedValue(new ApiError(401, 'Unauthorized'));

    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT:/login');
  });
});
