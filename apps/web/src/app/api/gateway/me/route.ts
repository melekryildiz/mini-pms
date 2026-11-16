import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { gatewayAuth } from '../../../../auth';
import { gatewayRequest } from '../../../../lib/api';
import { ApiError } from '../../../../lib/api-error';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

export const GET: (
  request: NextRequest,
  context: RouteContext,
) => Response | void | Promise<Response | void> = gatewayAuth(async (req) => {
  if (!req.auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (req.auth.error === 'RefreshTokenError' || !req.auth.accessToken) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  try {
    // Backend adresi, token ekleme ve hata yönetimi ortak server client'ında.
    const user = await gatewayRequest<unknown>('/auth/me', {
      accessToken: req.auth.accessToken,
    });

    return NextResponse.json({
      authenticated: true,
      user,
    });
  } catch (error) {
    // Backend kontrollü bir HTTP hatası döndürdüyse anlamını koruyoruz.
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: 'API Gateway unavailable' },
      { status: 502 },
    );
  }
});
