import { afterEach, describe, expect, it } from 'vitest';
import { readShopifyStorefrontContext } from './context';

describe('Shopify storefront context', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('maps trusted Liquid data and configured API endpoints', () => {
    document.body.innerHTML = `
      <div
        data-eric-root
        data-surface="workspace"
        data-customer-logged-in="true"
        data-customer-display-name="Alex Morgan"
        data-login-url="/customer_authentication/login?return_to=/"
        data-logout-url="/account/logout"
        data-proxy-base="/apps/eric/"
        data-api-environment="sandbox"
        data-tenant-api-base="https://tenant-api.example.com/"
        data-account-endpoint="https://tenant-api.example.com/account/account"
        data-detection-api-base="https://compliance-api.example.com/Eric/"
        data-logout-endpoint="https://tenant-api.example.com/logout"
        data-hide-theme-chrome="true"
        data-home-url="/"
        data-workspace-url="/pages/workspace"
      ></div>
    `;

    expect(readShopifyStorefrontContext()).toMatchObject({
      surface: 'workspace',
      customerLoggedIn: true,
      customerDisplayName: 'Alex Morgan',
      proxyBase: '/apps/eric',
      apiEnvironment: 'sandbox',
      tenantApiBase: 'https://tenant-api.example.com',
      accountEndpoint: 'https://tenant-api.example.com/account/account',
      detectionApiBase: 'https://compliance-api.example.com/Eric',
      hideThemeChrome: true,
      homeUrl: '/',
      workspaceUrl: '/pages/workspace',
    });
  });

  it('rejects an external proxy base and falls back to the same-origin path', () => {
    document.body.innerHTML = `
      <div
        data-eric-root
        data-proxy-base="https://attacker.example/proxy"
        data-tenant-api-base="https://tenant-api.example.com"
        data-account-endpoint="https://tenant-api.example.com/account/account"
        data-detection-api-base="https://compliance-api.example.com/Eric"
        data-logout-endpoint="https://tenant-api.example.com/logout"
      ></div>
    `;

    expect(readShopifyStorefrontContext().proxyBase).toBe('/apps/eric');
  });

  it('fails closed when a public API endpoint is missing or unsafe', () => {
    document.body.innerHTML = `
      <div
        data-eric-root
        data-tenant-api-base="javascript:alert(1)"
        data-account-endpoint="https://tenant-api.example.com/account/account"
        data-detection-api-base="https://compliance-api.example.com/Eric"
        data-logout-endpoint="https://tenant-api.example.com/logout"
      ></div>
    `;

    expect(() => readShopifyStorefrontContext()).toThrow(
      'Tenant API base must be configured as a public HTTPS URL',
    );
  });
});
