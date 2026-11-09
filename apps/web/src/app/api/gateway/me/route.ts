
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { gatewayAuth } from '../../../../auth';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

export const GET: (
  request: NextRequest,
  context: RouteContext
) => Response | void | Promise<Response | void> = gatewayAuth(
  async (req) => {
    if (!req.auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (
      req.auth.error === 'RefreshTokenError' ||
      !req.auth.accessToken
    ) {
      return NextResponse.json(
        { error: 'Session expired' },
        { status: 401 }
      );
    }

    try {
      const response = await fetch(
        'http://localhost:3001/api/auth/me',
        {
          headers: {
            Authorization: `Bearer ${req.auth.accessToken}`,
          },
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        return NextResponse.json(
          { error: 'API Gateway request failed' },
          { status: response.status }
        );
      }

      const user: unknown = await response.json();

      return NextResponse.json({
        authenticated: true,
        user,
      });
    } catch {
      return NextResponse.json(
        { error: 'API Gateway unavailable' },
        { status: 502 }
      );
    }
  }
);
