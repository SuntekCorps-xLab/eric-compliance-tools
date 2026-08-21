import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShopifyGuestSession } from './auth';
import { listShopifyPointPacks, refillShopifyGuestDemo } from './credits';
import { getDetectionResult, submitDetection, waitForDetection } from './detection';
import { getDetectionHistory } from './history';
import { readShopifyStorefrontContext } from '../storefront/context';

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Shopify storefront API contract journey', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DETECTION_API_BASE_URL', 'https://compliance-api.example.com/Eric');
    document.body.innerHTML = `
      <div
        data-eric-root
        data-surface="workspace"
        data-proxy-base="/apps/eric"
        data-api-environment="sandbox"
        data-tenant-api-base="https://tenant-api.example.com"
        data-account-endpoint="https://tenant-api.example.com/account/account"
        data-detection-api-base="https://compliance-api.example.com/Eric"
        data-logout-endpoint="https://tenant-api.example.com/logout"
        data-workspace-url="/pages/workspace"
      ></div>
    `;
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
  });

  it('connects guest identity, points, task lifecycle, evidence, and history', async () => {
    const requestedRoutes: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      await Promise.resolve();
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const parsed = new URL(url, window.location.origin);
      requestedRoutes.push(`${init?.method ?? 'GET'} ${parsed.pathname}`);

      if (url.startsWith('https://')) {
        const headers = new Headers(init?.headers);
        expect(headers.get('Authorization')).toBe('Bearer test-session-token');
        expect(headers.get('user_id')).toBe('84');
        expect(headers.get('user_last_login_tenant')).toBe('9002');
      }

      if (parsed.pathname === '/apps/eric/demo-session') {
        expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
        return json({
          code: 200,
          token: 'test-session-token',
          data: {
            user: { id: 84, account: 'guest-84', last_login_tenant: 9002 },
            shopify: { display_name: 'Guest demo', storefront_domain: 'shop.example.com' },
            demo: {
              is_demo: true,
              session_id: 'demo-session-1',
              resume_token: 'test-resume-token-long-enough-for-storage',
              display_name: 'Guest demo',
              is_first_session: true,
              initial_points: 200,
              refill_points: 200,
              remaining_refills: 1,
              expires_at: '2099-08-26T12:00:00Z',
              idle_expires_at: '2099-08-20T12:00:00Z',
            },
          },
        });
      }

      if (parsed.pathname === '/account/account') {
        expect(parsed.searchParams.get('tenant_id')).toBe('9002');
        return json({
          code: 200,
          data: {
            id: 9002,
            company_name: 'Guest workspace',
            point_total: 200,
            point_margin: 200,
            permissions: [
              {
                id: 13,
                name: 'Text trademark',
                description: 'Trademark screening',
                url: 'trademark',
                checked: true,
                limit_count: -1,
              },
            ],
          },
        });
      }

      if (parsed.pathname === '/shopify/points/packs') {
        return json({
          success: true,
          code: 200,
          data: [
            {
              code: 'starter-50',
              name: 'Starter',
              points: 50,
              currency: 'USD',
              price_minor: 100,
              price: '1.00',
              expire_days: 0,
            },
          ],
        });
      }

      if (parsed.pathname === '/shopify/demo/refill') {
        expect(init?.method).toBe('POST');
        return json({
          success: true,
          code: 200,
          data: { points: 200, remaining_refills: 0, expires_at: '2099-08-26T12:00:00Z' },
        });
      }

      if (parsed.pathname === '/Eric/v5/save-check') {
        const requestBody = typeof init?.body === 'string' ? init.body : '';
        expect(JSON.parse(requestBody)).toMatchObject({
          title: 'Arc lamp',
          mode: ['trademark'],
        });
        return json({
          success: true,
          code: 200,
          request_id: 'request-submit',
          data: { id: 701 },
        });
      }

      if (parsed.pathname === '/Eric/v5/get-check-status') {
        expect(parsed.searchParams.get('work_space_id')).toBe('701');
        return json({
          success: true,
          code: 200,
          request_id: 'request-status',
          data: { trademark: 3 },
        });
      }

      if (parsed.pathname === '/Eric/v4/trademark/detail') {
        return json({
          success: true,
          code: 200,
          request_id: 'request-result',
          data: { checkData: { title: 'Arc lamp' }, wordArr: [] },
        });
      }

      if (parsed.pathname === '/Eric/v3/work-space/list') {
        return json({
          success: true,
          code: 200,
          request_id: 'request-history',
          data: {
            list: {
              current_page: 1,
              last_page: 1,
              per_page: 20,
              total: 1,
              from: 1,
              to: 1,
              data: [
                {
                  ews_id: 701,
                  title: 'Arc lamp',
                  params: ['trademark'],
                  check_status: [{ id: 1, mode: 'trademark', status: 3 }],
                  create_time: '2026-08-21 10:00:00',
                },
              ],
            },
          },
        });
      }

      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const context = readShopifyStorefrontContext();
    const session = await createShopifyGuestSession(context, true);
    expect(session).toMatchObject({
      user: { id: '84', tenantId: 9002, provider: 'shopify-guest' },
      balance: 200,
      sessionToken: 'test-session-token',
    });

    const auth = { sessionToken: 'test-session-token', userId: '84', tenantId: 9002 };
    await expect(listShopifyPointPacks(auth)).resolves.toEqual([
      expect.objectContaining({ code: 'starter-50', points: 50, priceMinor: 100 }),
    ]);
    await expect(refillShopifyGuestDemo(auth)).resolves.toMatchObject({
      points: 200,
      remainingRefills: 0,
    });

    const submission = await submitDetection(
      {
        code: 'T001',
        title: 'Arc lamp',
        description: 'Adjustable lamp with weighted base',
        sku: 'LAMP-1',
        markets: ['US'],
      },
      auth,
    );
    expect(submission).toEqual({ workspaceId: '701', requestId: 'request-submit' });

    await expect(
      waitForDetection('701', 'trademark', auth, { intervalMs: 0, maxAttempts: 1 }),
    ).resolves.toMatchObject({ state: 'completed', mode: 'trademark' });
    await expect(getDetectionResult('T001', '701', auth)).resolves.toMatchObject({
      kind: 'trademark',
      workspaceId: '701',
      title: 'Arc lamp',
      items: [],
    });
    await expect(getDetectionHistory({ page: 1, pageSize: 20 }, auth)).resolves.toMatchObject({
      total: 1,
      items: [{ workspaceId: '701', code: 'T001', status: 'COMPLETED' }],
    });

    expect(requestedRoutes).toEqual([
      'POST /apps/eric/demo-session',
      'GET /account/account',
      'GET /shopify/points/packs',
      'POST /shopify/demo/refill',
      'POST /Eric/v5/save-check',
      'GET /Eric/v5/get-check-status',
      'POST /Eric/v4/trademark/detail',
      'POST /Eric/v3/work-space/list',
    ]);
  });
});
