import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isShopifyInvoiceUrl,
  latestShopifyPointPurchase,
  listShopifyPointPacks,
  pendingShopifyCheckout,
  prepareShopifyPointCheckout,
  refillShopifyGuestDemo,
} from './credits';

const auth = { sessionToken: 'eric-jwt', userId: '5174', tenantId: 9001 };

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Shopify point checkout', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div
        data-eric-root
        data-api-environment="sandbox"
        data-tenant-api-base="https://tenant-api.example.com"
        data-account-endpoint="https://tenant-api.example.com/account/account"
        data-detection-api-base="https://compliance-api.example.com/Eric"
        data-logout-endpoint="https://tenant-api.example.com/logout"
      ></div>
    `;
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    sessionStorage.clear();
  });

  it('loads only server-approved packs with ERiC authentication', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        code: 200,
        success: true,
        data: [
          {
            code: 'demo-50',
            name: '50 credits',
            points: 50,
            currency: 'USD',
            price_minor: 100,
            price: '1.00',
            expire_days: 0,
          },
          { code: 'invalid', points: 999, currency: 'EUR', price_minor: 1 },
        ],
      }),
    );

    await expect(listShopifyPointPacks(auth)).resolves.toEqual([
      expect.objectContaining({ code: 'demo-50', points: 50, priceMinor: 100 }),
    ]);
    const [url, options] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe('https://tenant-api.example.com/shopify/points/packs');
    expect(options?.method).toBe('GET');
    const headers = new Headers(options?.headers);
    expect(headers.get('Authorization')).toBe('Bearer eric-jwt');
    expect(headers.get('user_id')).toBe('5174');
    expect(headers.get('user_last_login_tenant')).toBe('9001');
  });

  it('opens the server-created Draft Order checkout without reading or changing the cart', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        code: 200,
        success: true,
        data: {
          intent_id: 73,
          draft_order_id: '9001',
          checkout_url: 'https://demo-shop.myshopify.com/123/invoices/secure-token',
          pack: {
            code: 'demo-120',
            name: '120 credits',
            points: 120,
            currency: 'USD',
            price_minor: 200,
            price: '2.00',
            expire_days: 0,
          },
        },
      }),
    );

    await expect(prepareShopifyPointCheckout(auth, 'demo-120')).resolves.toBe(
      'https://demo-shop.myshopify.com/123/invoices/secure-token',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://tenant-api.example.com/shopify/points/checkout-intents',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ pack_code: 'demo-120' }) }),
    );
    expect(pendingShopifyCheckout()).toMatchObject({ intentId: 73, packCode: 'demo-120' });
  });

  it('accepts a Shopify invoice URL on the exact primary storefront domain', () => {
    expect(
      isShopifyInvoiceUrl(
        new URL('https://storefront.example.com/123456789/invoices/secure-token'),
        'storefront.example.com',
      ),
    ).toBe(true);
    expect(
      isShopifyInvoiceUrl(
        new URL('https://storefront.example.com.attacker.example/invoices/secure-token'),
        'storefront.example.com',
      ),
    ).toBe(false);
  });

  it('rejects a non-HTTPS checkout URL returned by Tenant', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        code: 200,
        success: true,
        data: {
          intent_id: 74,
          draft_order_id: '9002',
          checkout_url: 'http://attacker.example/checkout',
          pack: {
            code: 'demo-50',
            points: 50,
            currency: 'USD',
            price_minor: 100,
          },
        },
      }),
    );

    await expect(prepareShopifyPointCheckout(auth, 'demo-50')).rejects.toThrow(
      /invalid Shopify Checkout intent/i,
    );
    expect(pendingShopifyCheckout()).toBeNull();
  });

  it('rejects an HTTPS checkout URL outside Shopify', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        code: 200,
        success: true,
        data: {
          intent_id: 75,
          draft_order_id: '9003',
          checkout_url: 'https://checkout.attacker.example/invoices/secure-token',
          pack: {
            code: 'demo-50',
            points: 50,
            currency: 'USD',
            price_minor: 100,
          },
        },
      }),
    );

    await expect(prepareShopifyPointCheckout(auth, 'demo-50')).rejects.toThrow(
      /invalid Shopify Checkout intent/i,
    );
    expect(pendingShopifyCheckout()).toBeNull();
  });

  it('maps the purchase status used to refresh the authoritative balance', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        code: 200,
        success: true,
        data: {
          id: 9,
          intent_id: 73,
          status: 'granted',
          order_id: '6001',
          points: 120,
          currency: 'USD',
          paid_amount_minor: 200,
          paid_at: '2026-08-12 12:00:00',
          granted_at: '2026-08-12 12:00:05',
        },
      }),
    );

    await expect(latestShopifyPointPurchase(auth)).resolves.toMatchObject({
      id: 9,
      intentId: 73,
      status: 'granted',
      points: 120,
      paidAmountMinor: 200,
    });
  });

  it('uses the authenticated guest refill endpoint without creating Shopify checkout state', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        code: 200,
        success: true,
        data: {
          points: 200,
          remaining_refills: 0,
          expires_at: '2026-08-26T12:00:00+08:00',
        },
      }),
    );

    await expect(refillShopifyGuestDemo(auth)).resolves.toEqual({
      points: 200,
      remainingRefills: 0,
      expiresAt: '2026-08-26T12:00:00+08:00',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://tenant-api.example.com/shopify/demo/refill',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(pendingShopifyCheckout()).toBeNull();
  });
});
