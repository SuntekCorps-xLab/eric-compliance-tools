import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configurePasswordLoginEncryption,
  createShopifyGuestSession,
  createShopifyStorefrontSession,
  liveAuthApi,
  storefrontAuthApi,
} from './auth';
import type { ShopifyStorefrontContext } from '../storefront/context';

function exchangeResponse(isFirstRegister = true) {
  return new Response(
    JSON.stringify({
      code: 200,
      token: 'eric-jwt',
      data: {
        user: {
          id: 42,
          account: 'shopify-user-42',
          real_name: 'Legacy ERiC name',
          last_login_tenant: 5164,
        },
        shopify: {
          shop_id: '123456789',
          storefront_domain: 'shop.example.com',
          display_name: 'Alex Morgan',
          is_first_register: isFirstRegister,
          gift_status: 'granted',
          gift_points: 200,
          gift_expire_days: 7,
        },
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function accountResponse(balance = 200, tenantId = 5164) {
  return new Response(
    JSON.stringify({
      code: 200,
      data: {
        id: tenantId,
        company_name: 'Northstar Commerce',
        point_total: balance,
        point_margin: balance,
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
        is_api_service_enable: 0,
        is_api_token_enable: 0,
        api_expire_time: '',
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function passwordLoginResponse() {
  return new Response(
    JSON.stringify({
      code: 200,
      token: 'password-eric-jwt',
      data: {
        user: {
          id: 42,
          account: 'shopify-user-42',
          real_name: 'Alex Morgan',
          email: 'owner@example.com',
          last_login_tenant: 5164,
        },
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function guestSessionResponse(isFirstSession = true) {
  return new Response(
    JSON.stringify({
      code: 200,
      token: 'guest-eric-jwt',
      data: {
        user: {
          id: 84,
          account: 'guest-user-84',
          last_login_tenant: 9002,
        },
        shopify: {
          shop_id: '123456789',
          storefront_domain: 'shop.example.com',
          display_name: 'Guest demo',
        },
        demo: {
          is_demo: true,
          session_id: 'demo-session-one',
          resume_token: 'resume-token-that-is-long-enough-for-storage-123',
          display_name: 'Guest demo',
          is_first_session: isFirstSession,
          initial_points: 200,
          refill_points: 200,
          remaining_refills: 1,
          expires_at: '2099-08-26T12:00:00+08:00',
          idle_expires_at: '2099-08-20T12:00:00+08:00',
        },
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('live Shopify auth contract', () => {
  beforeEach(() => configurePasswordLoginEncryption((password) => `rsa-encrypted:${password}`));
  afterEach(() => vi.unstubAllGlobals());

  it('maps display_name and loads the authoritative ERiC balance and permissions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(exchangeResponse())
      .mockResolvedValueOnce(accountResponse());
    vi.stubGlobal('fetch', fetchMock);

    const result = await liveAuthApi().resolveShopifyCallback(
      'shopify_auth=success&ticket=one-time-ticket',
    );

    expect(result).toMatchObject({
      user: {
        id: '42',
        displayName: 'Alex Morgan',
        shopDomain: 'shop.example.com',
        shopId: '123456789',
        tenantId: 5164,
      },
      account: {
        tenantId: 5164,
        tenantName: 'Northstar Commerce',
        pointMargin: 200,
        webApiEnabled: true,
        externalApiTokenEnabled: false,
      },
      balance: 200,
      welcomeCreditsGranted: 200,
      welcomeCreditsExpireDays: 7,
      sessionToken: 'eric-jwt',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/auth/shopify/exchange',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        body: JSON.stringify({ ticket: 'one-time-ticket' }),
      }),
    );
    const accountUrl = String(fetchMock.mock.calls[1]?.[0]);
    const accountRequest = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    expect(accountUrl).toContain('/account/account?tenant_id=5164');
    expect(accountRequest?.method).toBe('GET');
    expect(new Headers(accountRequest?.headers).get('Authorization')).toBe('Bearer eric-jwt');
  });

  it('keeps the real balance on repeat login while suppressing the one-time gift message', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(exchangeResponse(false))
      .mockResolvedValueOnce(accountResponse(500));
    vi.stubGlobal('fetch', fetchMock);

    const result = await liveAuthApi().resolveShopifyCallback(
      'shopify_auth=success&ticket=repeat-ticket',
    );

    expect(result.balance).toBe(500);
    expect(result.welcomeCreditsGranted).toBe(0);
  });

  it('revokes the ERiC gateway session with the JWT', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ code: 200 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await liveAuthApi().logout('eric-jwt');

    const logoutUrl = String(fetchMock.mock.calls[0]?.[0]);
    const logoutRequest = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(logoutUrl).toMatch(/\/logout$/);
    expect(logoutRequest?.method).toBe('POST');
    expect(logoutRequest?.keepalive).toBe(true);
    expect(new Headers(logoutRequest?.headers).get('Authorization')).toBe('Bearer eric-jwt');
  });

  it('uses password login only to obtain a real ERiC session and account', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(passwordLoginResponse())
      .mockResolvedValueOnce(accountResponse(500));
    vi.stubGlobal('fetch', fetchMock);

    const result = await liveAuthApi().loginWithPassword('owner@example.com', 'temporary-password');

    expect(result).toMatchObject({
      user: {
        id: '42',
        email: 'owner@example.com',
        displayName: 'Alex Morgan',
        provider: 'eric-password',
        tenantId: 5164,
      },
      account: { tenantId: 5164, pointMargin: 500 },
      balance: 500,
      welcomeCreditsGranted: 0,
      sessionToken: 'password-eric-jwt',
    });

    const loginUrl = String(fetchMock.mock.calls[0]?.[0]);
    const loginRequest = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(typeof loginRequest?.body).toBe('string');
    const loginBody = JSON.parse(loginRequest?.body as string) as {
      account: string;
      password: string;
    };
    expect(loginUrl).toMatch(/\/login\/passwd$/);
    expect(loginRequest?.method).toBe('POST');
    expect(loginBody).toEqual({
      account: 'owner@example.com',
      password: 'rsa-encrypted:temporary-password',
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/account/account?tenant_id=5164');
  });

  it('surfaces the tenant password error without requesting account data', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ code: 0, success: false, message: 'Incorrect password', data: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      liveAuthApi().loginWithPassword('owner@example.com', 'wrong-password'),
    ).rejects.toThrow('Incorrect password');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not send a failed callback to the exchange endpoint', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      liveAuthApi().resolveShopifyCallback('shopify_auth=error&error=invalid_state'),
    ).rejects.toThrow('not completed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Shopify theme storefront session', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('returns customers to the exact workspace route after Shopify login', () => {
    document.body.innerHTML = `
      <div
        data-eric-root
        data-login-url="/customer_authentication/login?return_to=%2Fpages%2Fworkspace"
        data-workspace-url="/pages/workspace"
        data-tenant-api-base="https://tenant-api.example.com"
        data-account-endpoint="https://tenant-api.example.com/account/account"
        data-detection-api-base="https://compliance-api.example.com/Eric"
        data-logout-endpoint="https://tenant-api.example.com/logout"
      ></div>
    `;

    expect(storefrontAuthApi().getShopifyAuthorizationUrl('/pages/workspace?check=T001')).toBe(
      '/customer_authentication/login?return_to=%2Fpages%2Fworkspace%3Fcheck%3DT001',
    );
  });

  it('exchanges the signed App Proxy customer and loads the authoritative account', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(exchangeResponse())
      .mockResolvedValueOnce(accountResponse(500));
    vi.stubGlobal('fetch', fetchMock);
    const context: ShopifyStorefrontContext = {
      surface: 'homepage',
      customerLoggedIn: true,
      customerDisplayName: 'Alex Morgan',
      loginUrl: '/customer_authentication/login?return_to=/',
      logoutUrl: '/account/logout',
      proxyBase: '/apps/eric-test',
      apiEnvironment: 'sandbox',
      tenantApiBase: 'https://tenant-api.example.com',
      accountEndpoint: 'https://tenant-api.example.com/account/account',
      detectionApiBase: 'https://compliance-api.example.com/Eric',
      logoutEndpoint: 'https://tenant-api.example.com/logout',
      hideThemeChrome: true,
      homeUrl: '/',
      workspaceUrl: '/pages/workspace',
    };

    const result = await createShopifyStorefrontSession(context);

    expect(result).toMatchObject({
      user: { id: '42', displayName: 'Alex Morgan', tenantId: 5164 },
      balance: 500,
      sessionToken: 'eric-jwt',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/apps/eric-test/session',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      'https://tenant-api.example.com/account/account?tenant_id=5164',
    );
    expect(
      new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.headers).get(
        'Authorization',
      ),
    ).toBe('Bearer eric-jwt');
  });

  it('creates an isolated guest session and stores only its opaque resume credential', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(guestSessionResponse())
      .mockResolvedValueOnce(accountResponse(200, 9002));
    vi.stubGlobal('fetch', fetchMock);
    const context: ShopifyStorefrontContext = {
      surface: 'homepage',
      customerLoggedIn: false,
      customerDisplayName: '',
      loginUrl: '/customer_authentication/login?return_to=/',
      logoutUrl: '/account/logout',
      proxyBase: '/apps/eric-test',
      apiEnvironment: 'sandbox',
      tenantApiBase: 'https://tenant-api.example.com',
      accountEndpoint: 'https://tenant-api.example.com/account/account',
      detectionApiBase: 'https://compliance-api.example.com/Eric',
      logoutEndpoint: 'https://tenant-api.example.com/logout',
      hideThemeChrome: true,
      homeUrl: '/',
      workspaceUrl: '/pages/workspace',
    };

    const result = await createShopifyGuestSession(context, true);

    expect(result).toMatchObject({
      user: { id: '84', displayName: 'Guest demo', provider: 'shopify-guest', tenantId: 9002 },
      balance: 200,
      welcomeCreditsGranted: 200,
      sessionToken: 'guest-eric-jwt',
      demoSession: {
        sessionId: 'demo-session-one',
        refillPoints: 200,
        remainingRefills: 1,
      },
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(typeof request.body).toBe('string');
    const body = JSON.parse(request.body as string) as {
      device_id?: string;
      resume_token?: string;
    };
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/apps/eric-test/demo-session');
    expect(body.device_id).toMatch(/^[A-Za-z0-9._:-]{16,128}$/);
    expect(body.resume_token).toBeUndefined();
    expect(localStorage.getItem('eric-shopify-guest-v1')).toContain(
      'resume-token-that-is-long-enough-for-storage-123',
    );
    expect(localStorage.getItem('eric-shopify-guest-v1')).not.toContain('guest-eric-jwt');
  });

  it('resumes the same guest without creating a new browser identity', async () => {
    localStorage.setItem('eric-shopify-guest-device-v1', 'existing-browser-device-1234');
    localStorage.setItem(
      'eric-shopify-guest-v1',
      JSON.stringify({
        deviceId: 'existing-browser-device-1234',
        resumeToken: 'existing-resume-token-that-is-long-enough-123',
        expiresAt: '2099-08-26T12:00:00+08:00',
      }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(guestSessionResponse(false))
      .mockResolvedValueOnce(accountResponse(135, 9002));
    vi.stubGlobal('fetch', fetchMock);
    const context: ShopifyStorefrontContext = {
      surface: 'workspace',
      customerLoggedIn: false,
      customerDisplayName: '',
      loginUrl: '/account/login',
      logoutUrl: '/account/logout',
      proxyBase: '/apps/eric',
      apiEnvironment: 'production',
      tenantApiBase: 'https://tenant-api.example.com',
      accountEndpoint: 'https://tenant-api.example.com/account/account',
      detectionApiBase: 'https://compliance-api.example.com/Eric',
      logoutEndpoint: 'https://tenant-api.example.com/logout',
      hideThemeChrome: true,
      homeUrl: '/',
      workspaceUrl: '/pages/workspace',
    };

    const result = await createShopifyGuestSession(context);

    expect(result?.balance).toBe(135);
    expect(result?.welcomeCreditsGranted).toBe(0);
    const requestBody = (fetchMock.mock.calls[0]?.[1] as RequestInit).body;
    expect(typeof requestBody).toBe('string');
    const body = JSON.parse(requestBody as string) as {
      device_id: string;
      resume_token: string;
    };
    expect(body).toEqual({
      device_id: 'existing-browser-device-1234',
      resume_token: 'existing-resume-token-that-is-long-enough-123',
    });
  });

  it('explains when the storefront password gate intercepts the App Proxy', async () => {
    const parsePasswordPage = vi.fn();
    const passwordRedirect = {
      ok: true,
      redirected: true,
      url: 'https://shop.example.com/password',
      json: parsePasswordPage,
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(passwordRedirect));
    const context: ShopifyStorefrontContext = {
      surface: 'homepage',
      customerLoggedIn: true,
      customerDisplayName: 'Alex Morgan',
      loginUrl: '/customer_authentication/login?return_to=/',
      logoutUrl: '/account/logout',
      proxyBase: '/apps/eric-test',
      apiEnvironment: 'sandbox',
      tenantApiBase: 'https://tenant-api.example.com',
      accountEndpoint: 'https://tenant-api.example.com/account/account',
      detectionApiBase: 'https://compliance-api.example.com/Eric',
      logoutEndpoint: 'https://tenant-api.example.com/logout',
      hideThemeChrome: true,
      homeUrl: '/',
      workspaceUrl: '/pages/workspace',
    };

    await expect(createShopifyStorefrontSession(context)).rejects.toThrow('storefront password');
    expect(parsePasswordPage).not.toHaveBeenCalled();
  });

  it('identifies an HTML 403 returned before the App Proxy reaches ERiC', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><title>403 Forbidden</title></html>', {
          status: 403,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );
    const context: ShopifyStorefrontContext = {
      surface: 'homepage',
      customerLoggedIn: true,
      customerDisplayName: 'Alex Morgan',
      loginUrl: '/customer_authentication/login?return_to=/',
      logoutUrl: '/account/logout',
      proxyBase: '/apps/eric-test',
      apiEnvironment: 'sandbox',
      tenantApiBase: 'https://tenant-api.example.com',
      accountEndpoint: 'https://tenant-api.example.com/account/account',
      detectionApiBase: 'https://compliance-api.example.com/Eric',
      logoutEndpoint: 'https://tenant-api.example.com/logout',
      hideThemeChrome: true,
      homeUrl: '/',
      workspaceUrl: '/pages/workspace',
    };

    await expect(createShopifyStorefrontSession(context)).rejects.toThrow(
      'network gateway blocked the Shopify App Proxy request',
    );
  });
});
