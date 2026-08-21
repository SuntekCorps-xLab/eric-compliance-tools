export type StorefrontApiEnvironment = 'sandbox' | 'production';
export type StorefrontSurface = 'homepage' | 'workspace';

export interface ShopifyStorefrontContext {
  surface: StorefrontSurface;
  customerLoggedIn: boolean;
  customerDisplayName: string;
  loginUrl: string;
  logoutUrl: string;
  proxyBase: string;
  apiEnvironment: StorefrontApiEnvironment;
  tenantApiBase: string;
  accountEndpoint: string;
  detectionApiBase: string;
  logoutEndpoint: string;
  hideThemeChrome: boolean;
  homeUrl: string;
  workspaceUrl: string;
}

function sameOriginProxyBase(value: string | undefined): string {
  const candidate = value?.trim() || '/apps/eric';
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return '/apps/eric';
  return candidate.replace(/\/$/, '');
}

function publicHttpsUrl(value: string | undefined, label: string): string {
  const candidate = value?.trim() || '';
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error();
    return parsed.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${label} must be configured as a public HTTPS URL in the theme editor.`);
  }
}

export function readShopifyStorefrontContext(
  root: HTMLElement | null = document.querySelector<HTMLElement>('[data-eric-root]'),
): ShopifyStorefrontContext {
  if (!root) throw new Error('The ERiC Shopify storefront root is missing.');

  const apiEnvironment: StorefrontApiEnvironment =
    root.dataset.apiEnvironment === 'production' ? 'production' : 'sandbox';

  return {
    surface: root.dataset.surface === 'workspace' ? 'workspace' : 'homepage',
    customerLoggedIn: root.dataset.customerLoggedIn === 'true',
    customerDisplayName: root.dataset.customerDisplayName?.trim() || '',
    loginUrl: root.dataset.loginUrl?.trim() || '/account/login',
    logoutUrl: root.dataset.logoutUrl?.trim() || '/account/logout',
    proxyBase: sameOriginProxyBase(root.dataset.proxyBase),
    apiEnvironment,
    tenantApiBase: publicHttpsUrl(root.dataset.tenantApiBase, 'Tenant API base'),
    accountEndpoint: publicHttpsUrl(root.dataset.accountEndpoint, 'Account endpoint'),
    detectionApiBase: publicHttpsUrl(root.dataset.detectionApiBase, 'Compliance API base'),
    logoutEndpoint: publicHttpsUrl(root.dataset.logoutEndpoint, 'Logout endpoint'),
    hideThemeChrome: root.dataset.hideThemeChrome === 'true',
    homeUrl: root.dataset.homeUrl?.trim() || '/',
    workspaceUrl: root.dataset.workspaceUrl?.trim() || '/pages/workspace',
  };
}

export function storefrontLoginUrl(): string {
  return readShopifyStorefrontContext().loginUrl;
}

export function storefrontLogoutUrl(): string {
  return readShopifyStorefrontContext().logoutUrl;
}

export function storefrontHomeUrl(): string {
  return readShopifyStorefrontContext().homeUrl;
}

export function storefrontWorkspaceUrl(): string {
  return readShopifyStorefrontContext().workspaceUrl;
}
