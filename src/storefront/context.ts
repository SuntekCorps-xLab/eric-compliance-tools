export type StorefrontSurface = 'homepage' | 'workspace';

export interface ShopifyStorefrontContext {
  surface: StorefrontSurface;
  customerLoggedIn: boolean;
  customerDisplayName: string;
  loginUrl: string;
  logoutUrl: string;
  proxyBase: string;
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
  if (!candidate.startsWith('/') || candidate.startsWith('//') || /[\\?#]/.test(candidate))
    return '/apps/eric';
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

function localRoute(value: string | undefined, fallback: string): string {
  try {
    const parsed = new URL(value?.trim() || fallback, window.location.origin);
    if (
      parsed.origin !== window.location.origin ||
      parsed.pathname.startsWith('//') ||
      parsed.username ||
      parsed.password
    )
      return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function optionalPublicLink(value: string | undefined): string {
  if (!value?.trim()) return '';
  try {
    const parsed = new URL(value.trim(), window.location.origin);
    if (parsed.username || parsed.password || parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function storefrontPublicLinks() {
  const root = document.querySelector<HTMLElement>('[data-eric-root]:not([data-eric-invalid])');
  const email = root?.dataset.supportEmail?.trim() || '';
  return {
    termsUrl: optionalPublicLink(root?.dataset.termsUrl),
    privacyUrl: optionalPublicLink(root?.dataset.privacyUrl),
    supportEmail: /^[A-Za-z0-9._+-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(
      email,
    )
      ? email
      : '',
  };
}

export function readShopifyStorefrontContext(
  root: HTMLElement | null = document.querySelector<HTMLElement>(
    '[data-eric-root]:not([data-eric-invalid])',
  ),
): ShopifyStorefrontContext {
  if (!root) throw new Error('The ERiC Shopify storefront root is missing.');

  return {
    surface: root.dataset.surface === 'workspace' ? 'workspace' : 'homepage',
    customerLoggedIn: root.dataset.customerLoggedIn === 'true',
    customerDisplayName: root.dataset.customerDisplayName?.trim() || '',
    loginUrl: localRoute(root.dataset.loginUrl, '/account/login'),
    logoutUrl: localRoute(root.dataset.logoutUrl, '/account/logout'),
    proxyBase: sameOriginProxyBase(root.dataset.proxyBase),
    tenantApiBase: publicHttpsUrl(root.dataset.tenantApiBase, 'Tenant API base'),
    accountEndpoint: publicHttpsUrl(root.dataset.accountEndpoint, 'Account endpoint'),
    detectionApiBase: publicHttpsUrl(root.dataset.detectionApiBase, 'Compliance API base'),
    logoutEndpoint: publicHttpsUrl(root.dataset.logoutEndpoint, 'Logout endpoint'),
    hideThemeChrome: root.dataset.hideThemeChrome === 'true',
    homeUrl: localRoute(root.dataset.homeUrl, '/'),
    workspaceUrl: localRoute(root.dataset.workspaceUrl, '/pages/workspace'),
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
