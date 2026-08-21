import {
  readShopifyStorefrontContext,
  storefrontLoginUrl,
  type ShopifyStorefrontContext,
} from '../storefront/context';

export type AuthProvider = 'shopify' | 'shopify-guest' | 'eric-password' | 'prototype-email';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  account?: string;
  realName?: string;
  companyName?: string;
  provider: AuthProvider;
  shopDomain?: string;
  shopId?: string;
  tenantId: number;
}

export interface GuestDemoSession {
  sessionId: string;
  expiresAt: string;
  idleExpiresAt: string;
  initialPoints: number;
  refillPoints: number;
  remainingRefills: number;
}

export interface EricPermission {
  id: number;
  name: string;
  description: string;
  url: string;
  checked: boolean;
  limitCount: number;
}

export interface SessionAccount {
  tenantId: number;
  tenantName: string;
  pointTotal: number;
  pointMargin: number;
  permissions: EricPermission[];
  webApiEnabled: true;
  externalApiServiceEnabled: boolean;
  externalApiTokenEnabled: boolean;
  apiExpireTime: string;
}

export interface AuthSessionResult {
  user: AuthenticatedUser;
  account: SessionAccount;
  balance: number;
  welcomeCreditsGranted: number;
  welcomeCreditsExpireDays: number;
  sessionToken?: string;
  demoSession?: GuestDemoSession;
}

export interface AuthApi {
  getShopifyAuthorizationUrl(returnTo: string): string;
  resolveShopifyCallback(search: string): Promise<AuthSessionResult>;
  loginWithPassword(account: string, password: string): Promise<AuthSessionResult>;
  getAccount(sessionToken: string, tenantId: number, userId?: string): Promise<SessionAccount>;
  logout(sessionToken: string): Promise<void>;
}

interface EricEnvelope<T> {
  code?: number;
  message?: string;
  data?: T;
  token?: string;
  user?: EricUserPayload;
}

interface EricUserPayload {
  id?: number | string;
  account?: string;
  real_name?: string;
  email?: string;
  last_login_tenant?: number | string;
}

interface AccountPayload {
  id?: number;
  company_name?: string;
  point_total?: number | string;
  point_margin?: number | string;
  permissions?: Array<{
    id?: number;
    name?: string;
    description?: string;
    url?: string;
    checked?: boolean | number;
    limit_count?: number;
  }>;
  is_api_service_enable?: number | boolean;
  is_api_token_enable?: number | boolean;
  api_expire_time?: string;
}

interface ExchangePayload {
  user?: EricUserPayload;
  shopify?: {
    shop_id?: string;
    storefront_domain?: string;
    display_name?: string;
    is_first_register?: boolean;
    gift_status?: string;
    gift_points?: number;
    gift_expire_days?: number;
  };
  demo?: {
    is_demo?: boolean;
    session_id?: string;
    resume_token?: string;
    display_name?: string;
    is_first_session?: boolean;
    initial_points?: number | string;
    refill_points?: number | string;
    remaining_refills?: number | string;
    expires_at?: string;
    idle_expires_at?: string;
  };
}

interface PasswordLoginPayload {
  user?: EricUserPayload;
}

export class EricSessionError extends Error {
  constructor(
    message: string,
    readonly invalidSession = false,
  ) {
    super(message);
    this.name = 'EricSessionError';
  }
}

const mode = import.meta.env.VITE_API_MODE ?? 'mock';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
const authorizationPath = import.meta.env.VITE_SHOPIFY_AUTHORIZE_PATH ?? '/auth/shopify/login';
const exchangePath = import.meta.env.VITE_SHOPIFY_EXCHANGE_PATH ?? '/auth/shopify/exchange';
const passwordLoginPath = import.meta.env.VITE_ERIC_LOGIN_PATH ?? '/login/passwd';
const accountPath = import.meta.env.VITE_ACCOUNT_PATH ?? '/account/account';
const logoutPath = import.meta.env.VITE_LOGOUT_PATH ?? '/logout';
const guestCredentialKey = 'eric-shopify-guest-v1';
const guestDeviceKey = 'eric-shopify-guest-device-v1';
let passwordEncryptor: ((password: string) => string) | undefined;

interface StoredGuestCredential {
  deviceId: string;
  resumeToken: string;
  expiresAt: string;
}

export const isLiveShopifyAuth = mode === 'live';
export const isShopifyStorefront = mode === 'storefront';
export const isConnectedShopifyAuth = isLiveShopifyAuth || isShopifyStorefront;
export const isPasswordDemoLoginEnabled =
  isLiveShopifyAuth && import.meta.env.VITE_PASSWORD_DEMO_LOGIN === 'true';

export function configurePasswordLoginEncryption(encryptor: (password: string) => string): void {
  passwordEncryptor = encryptor;
}

function asNumber(value: number | string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newGuestDeviceId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function guestDeviceId(): string {
  const existing = localStorage.getItem(guestDeviceKey)?.trim() || '';
  if (/^[A-Za-z0-9._:-]{16,128}$/.test(existing)) return existing;
  const created = newGuestDeviceId();
  localStorage.setItem(guestDeviceKey, created);
  return created;
}

function readGuestCredential(): StoredGuestCredential | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(guestCredentialKey) ?? '',
    ) as Partial<StoredGuestCredential>;
    const deviceId = value.deviceId?.trim() || '';
    const resumeToken = value.resumeToken?.trim() || '';
    const expiresAt = value.expiresAt?.trim() || '';
    if (!deviceId || !resumeToken || !expiresAt || Date.parse(expiresAt) <= Date.now()) {
      clearShopifyGuestCredentials();
      return null;
    }
    return { deviceId, resumeToken, expiresAt };
  } catch {
    clearShopifyGuestCredentials();
    return null;
  }
}

function saveGuestCredential(credential: StoredGuestCredential): void {
  localStorage.setItem(guestCredentialKey, JSON.stringify(credential));
}

export function clearShopifyGuestCredentials(): void {
  localStorage.removeItem(guestCredentialKey);
}

export function hasShopifyGuestCredentials(): boolean {
  return readGuestCredential() !== null;
}

function gatewayBaseUrl(): string {
  const configured = import.meta.env.VITE_GATEWAY_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (!apiBaseUrl) return window.location.origin;

  const url = new URL(apiBaseUrl, window.location.origin);
  const segments = url.pathname.split('/').filter(Boolean);
  segments.pop();
  url.pathname = `/${segments.join('/')}`;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function mapAccount(payload: AccountPayload, tenantId: number): SessionAccount {
  return {
    tenantId: asNumber(payload.id) || tenantId,
    tenantName: payload.company_name?.trim() || `ERiC tenant #${tenantId}`,
    pointTotal: asNumber(payload.point_total),
    pointMargin: asNumber(payload.point_margin),
    permissions: (payload.permissions ?? []).map((permission) => ({
      id: asNumber(permission.id),
      name: permission.name?.trim() || 'ERiC permission',
      description: permission.description?.trim() || '',
      url: permission.url?.trim() || '',
      checked: Boolean(permission.checked),
      limitCount: asNumber(permission.limit_count),
    })),
    webApiEnabled: true,
    externalApiServiceEnabled: Boolean(payload.is_api_service_enable),
    externalApiTokenEnabled: Boolean(payload.is_api_token_enable),
    apiExpireTime: payload.api_expire_time?.trim() || '',
  };
}

async function readEnvelope<T>(response: Response): Promise<EricEnvelope<T>> {
  const responsePath = (() => {
    if (!response.url) return '';
    try {
      return new URL(response.url, window.location.origin).pathname;
    } catch {
      return '';
    }
  })();

  if (response.redirected && responsePath === '/password') {
    throw new EricSessionError(
      'Shopify is blocking the ERiC request with the storefront password. Open the password page, choose “Enter using password” (not the email signup), then return here and retry.',
    );
  }

  const responseContentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const responseIsJson =
    responseContentType.includes('application/json') || responseContentType.includes('+json');
  if (response.status === 403 && !responseIsJson) {
    throw new EricSessionError(
      'The ERiC network gateway blocked the Shopify App Proxy request (HTTP 403) before it reached the application.',
    );
  }

  let payload: EricEnvelope<T>;
  try {
    payload = (await response.json()) as EricEnvelope<T>;
  } catch {
    throw new EricSessionError('ERiC returned an unreadable response.');
  }
  if (!response.ok) {
    const invalidSession =
      response.status === 401 ||
      response.status === 403 ||
      [10, 20, 101, 601, 602, 70004].includes(payload.code ?? 0);
    throw new EricSessionError(
      payload.message || 'ERiC could not complete the request.',
      invalidSession,
    );
  }
  return payload;
}

async function getLiveAccount(
  sessionToken: string,
  tenantId: number,
  userId?: string,
): Promise<SessionAccount> {
  return getAccountFromEndpoint(
    new URL(`${apiBaseUrl}${accountPath}`, window.location.origin).toString(),
    sessionToken,
    tenantId,
    userId,
  );
}

async function getAccountFromEndpoint(
  endpoint: string,
  sessionToken: string,
  tenantId: number,
  userId?: string,
): Promise<SessionAccount> {
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set('tenant_id', String(tenantId));
  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${sessionToken}`,
      user_last_login_tenant: String(tenantId),
      ...(userId ? { user_id: userId } : {}),
    },
  });
  const payload = await readEnvelope<AccountPayload>(response);
  if (payload.code !== 200 || !payload.data) {
    const invalidSession = [10, 20, 101, 601, 602, 70004].includes(payload.code ?? 0);
    throw new EricSessionError(
      payload.message || 'The ERiC session is no longer available.',
      invalidSession,
    );
  }
  return mapAccount(payload.data, tenantId);
}

function mapAuthenticatedSession(
  payload: EricEnvelope<ExchangePayload>,
  account: SessionAccount,
): AuthSessionResult {
  const userPayload = payload.data?.user;
  const shopify = payload.data?.shopify;
  const demo = payload.data?.demo;
  const tenantId = asNumber(userPayload?.last_login_tenant);
  if (payload.code !== 200 || !userPayload?.id || !payload.token || tenantId <= 0) {
    throw new EricSessionError(
      payload.message || 'The Shopify session is invalid or expired.',
      true,
    );
  }

  const welcomeCreditsGranted =
    demo?.is_demo && demo.is_first_session
      ? asNumber(demo.initial_points) || 200
      : shopify?.gift_status === 'granted' && shopify.is_first_register === true
        ? (shopify.gift_points ?? 200)
        : 0;

  const demoSession = demo?.is_demo
    ? {
        sessionId: demo.session_id?.trim() || '',
        expiresAt: demo.expires_at?.trim() || '',
        idleExpiresAt: demo.idle_expires_at?.trim() || '',
        initialPoints: asNumber(demo.initial_points) || 200,
        refillPoints: asNumber(demo.refill_points) || 200,
        remainingRefills: Math.max(0, asNumber(demo.remaining_refills)),
      }
    : undefined;

  return {
    user: {
      id: String(userPayload.id),
      email: userPayload.email?.trim() || '',
      displayName:
        demo?.display_name?.trim() ||
        shopify?.display_name?.trim() ||
        userPayload.real_name?.trim() ||
        userPayload.account?.trim() ||
        'Shopify customer',
      account: userPayload.account?.trim() || '',
      realName: userPayload.real_name?.trim() || '',
      companyName: account.tenantName,
      provider: demoSession ? 'shopify-guest' : 'shopify',
      shopDomain: shopify?.storefront_domain?.trim(),
      shopId: shopify?.shop_id?.trim(),
      tenantId,
    },
    account,
    balance: account.pointMargin,
    welcomeCreditsGranted,
    welcomeCreditsExpireDays: demoSession ? 7 : Number(shopify?.gift_expire_days ?? 7),
    sessionToken: payload.token,
    demoSession,
  };
}

function encryptLoginPassword(password: string): string {
  if (!passwordEncryptor) {
    throw new EricSessionError('ERiC password sign-in is not initialized.');
  }
  return passwordEncryptor(password);
}

function passwordAuthenticatedSession(
  payload: EricEnvelope<PasswordLoginPayload>,
  account: SessionAccount,
  userPayload: EricUserPayload,
): AuthSessionResult {
  const tenantId = asNumber(userPayload.last_login_tenant);
  if (payload.code !== 200 || !userPayload.id || !payload.token || tenantId <= 0) {
    throw new EricSessionError(payload.message || 'ERiC sign-in failed.', true);
  }

  return {
    user: {
      id: String(userPayload.id),
      email: userPayload.email?.trim() || '',
      displayName:
        userPayload.real_name?.trim() ||
        userPayload.account?.trim() ||
        userPayload.email?.trim() ||
        'ERiC user',
      account: userPayload.account?.trim() || '',
      realName: userPayload.real_name?.trim() || '',
      companyName: account.tenantName,
      provider: 'eric-password',
      tenantId,
    },
    account,
    balance: account.pointMargin,
    welcomeCreditsGranted: 0,
    welcomeCreditsExpireDays: 0,
    sessionToken: payload.token,
  };
}

function mockAccount(balance = 200): SessionAccount {
  return {
    tenantId: 9001,
    tenantName: 'Northstar Commerce',
    pointTotal: balance,
    pointMargin: balance,
    permissions: [],
    webApiEnabled: true,
    externalApiServiceEnabled: false,
    externalApiTokenEnabled: false,
    apiExpireTime: '',
  };
}

function mockAuthApi(): AuthApi {
  return {
    getShopifyAuthorizationUrl(returnTo) {
      const params = new URLSearchParams({
        provider: 'shopify',
        mode: 'mock',
        new_account: '1',
        return_to: returnTo,
      });
      return `/auth/callback?${params.toString()}`;
    },
    async resolveShopifyCallback(search) {
      const params = new URLSearchParams(search);
      if (params.get('error'))
        throw new Error(params.get('error_description') ?? 'Authorization failed.');
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      const account = mockAccount();
      return {
        user: {
          id: 'mock-shopify-user',
          email: 'owner@northstar-demo.myshopify.com',
          displayName: 'Alex Morgan',
          account: 'shopify-demo',
          companyName: account.tenantName,
          provider: 'shopify',
          shopDomain: 'northstar-demo.myshopify.com',
          shopId: 'mock-shop',
          tenantId: account.tenantId,
        },
        account,
        balance: account.pointMargin,
        welcomeCreditsGranted: params.get('new_account') === '1' ? 200 : 0,
        welcomeCreditsExpireDays: 7,
        sessionToken: 'mock-eric-session',
      };
    },
    loginWithPassword() {
      return Promise.reject(
        new EricSessionError('Password sign-in is not available in prototype mode.'),
      );
    },
    getAccount() {
      return Promise.resolve(mockAccount());
    },
    async logout() {
      return Promise.resolve();
    },
  };
}

export function liveAuthApi(): AuthApi {
  return {
    getShopifyAuthorizationUrl() {
      return new URL(`${apiBaseUrl}${authorizationPath}`, window.location.origin).toString();
    },
    async resolveShopifyCallback(search) {
      const params = new URLSearchParams(search);
      if (params.get('shopify_auth') === 'error' || params.get('error')) {
        throw new Error('Shopify authorization was not completed. Please try again.');
      }
      const ticket = params.get('ticket');
      if (!ticket) throw new Error('The Shopify login ticket is missing or has expired.');

      const response = await fetch(`${apiBaseUrl}${exchangePath}`, {
        method: 'POST',
        credentials: 'omit',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket }),
      });
      const payload = await readEnvelope<ExchangePayload>(response);
      const userPayload = payload.data?.user;
      const tenantId = asNumber(userPayload?.last_login_tenant);
      if (payload.code !== 200 || !userPayload?.id || !payload.token || tenantId <= 0) {
        throw new EricSessionError(
          payload.message || 'The Shopify login ticket is invalid or expired.',
          true,
        );
      }

      const userId = String(userPayload.id);
      const account = await getLiveAccount(payload.token, tenantId, userId);
      return mapAuthenticatedSession(payload, account);
    },
    async loginWithPassword(accountName, password) {
      const response = await fetch(`${apiBaseUrl}${passwordLoginPath}`, {
        method: 'POST',
        credentials: 'omit',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: accountName,
          password: encryptLoginPassword(password),
        }),
      });
      const payload = await readEnvelope<PasswordLoginPayload>(response);
      const userPayload = payload.data?.user ?? payload.user;
      const tenantId = asNumber(userPayload?.last_login_tenant);
      if (payload.code !== 200 || !userPayload?.id || !payload.token || tenantId <= 0) {
        throw new EricSessionError(
          payload.message || 'ERiC account or password is incorrect.',
          true,
        );
      }

      const userId = String(userPayload.id);
      const account = await getLiveAccount(payload.token, tenantId, userId);
      return passwordAuthenticatedSession(payload, account, userPayload);
    },
    getAccount(sessionToken, tenantId, userId) {
      return getLiveAccount(sessionToken, tenantId, userId);
    },
    async logout(sessionToken) {
      const response = await fetch(`${gatewayBaseUrl()}${logoutPath}`, {
        method: 'POST',
        credentials: 'omit',
        keepalive: true,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      if (!response.ok) throw new Error('ERiC could not revoke the remote session.');
    },
  };
}

export async function createShopifyStorefrontSession(
  context: ShopifyStorefrontContext,
): Promise<AuthSessionResult> {
  const response = await fetch(`${context.proxyBase}/session`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const payload = await readEnvelope<ExchangePayload>(response);
  const userPayload = payload.data?.user;
  const tenantId = asNumber(userPayload?.last_login_tenant);
  if (payload.code !== 200 || !userPayload?.id || !payload.token || tenantId <= 0) {
    throw new EricSessionError(
      payload.message || 'Shopify could not create an ERiC storefront session.',
      true,
    );
  }

  const userId = String(userPayload.id);
  const account = await getAccountFromEndpoint(
    context.accountEndpoint,
    payload.token,
    tenantId,
    userId,
  );
  return mapAuthenticatedSession(payload, account);
}

export async function createShopifyGuestSession(
  context: ShopifyStorefrontContext,
  createIfMissing = false,
): Promise<AuthSessionResult | null> {
  const stored = readGuestCredential();
  if (!stored && !createIfMissing) return null;

  const response = await fetch(`${context.proxyBase}/demo-session`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: stored?.deviceId || guestDeviceId(),
      ...(stored?.resumeToken ? { resume_token: stored.resumeToken } : {}),
    }),
  });

  try {
    const payload = await readEnvelope<ExchangePayload>(response);
    const userPayload = payload.data?.user;
    const demo = payload.data?.demo;
    const tenantId = asNumber(userPayload?.last_login_tenant);
    if (
      payload.code !== 200 ||
      !userPayload?.id ||
      !payload.token ||
      tenantId <= 0 ||
      demo?.is_demo !== true ||
      !demo.resume_token?.trim() ||
      !demo.expires_at?.trim()
    ) {
      throw new EricSessionError(
        payload.message || 'ERiC could not create the guest demo session.',
        payload.code === 200 || [401, 403, 429].includes(payload.code ?? 0),
      );
    }

    saveGuestCredential({
      deviceId: stored?.deviceId || guestDeviceId(),
      resumeToken: demo.resume_token.trim(),
      expiresAt: demo.expires_at.trim(),
    });

    const userId = String(userPayload.id);
    let account = await getAccountFromEndpoint(
      context.accountEndpoint,
      payload.token,
      tenantId,
      userId,
    );
    if (demo.is_first_session && account.pointMargin < asNumber(demo.initial_points)) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
        account = await getAccountFromEndpoint(
          context.accountEndpoint,
          payload.token,
          tenantId,
          userId,
        );
        if (account.pointMargin >= asNumber(demo.initial_points)) break;
      }
    }

    return mapAuthenticatedSession(payload, account);
  } catch (error) {
    if (stored && error instanceof EricSessionError && error.invalidSession) {
      clearShopifyGuestCredentials();
    }
    throw error;
  }
}

export async function revokeShopifyGuestSession(
  sessionToken: string,
  user: Pick<AuthenticatedUser, 'id' | 'tenantId'>,
): Promise<void> {
  const context = readShopifyStorefrontContext();
  const response = await fetch(`${context.tenantApiBase}/shopify/demo/revoke`, {
    method: 'POST',
    credentials: 'omit',
    keepalive: true,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${sessionToken}`,
      user_id: user.id,
      user_last_login_tenant: String(user.tenantId),
    },
  });
  const payload = await readEnvelope<{ revoked?: boolean }>(response);
  if (payload.code !== 200) throw new Error('ERiC could not end the guest demo session.');
}

export function storefrontAuthApi(): AuthApi {
  return {
    getShopifyAuthorizationUrl(returnTo) {
      const context = readShopifyStorefrontContext();
      const loginUrl = new URL(storefrontLoginUrl(), window.location.origin);
      const requested = new URL(returnTo || context.workspaceUrl, window.location.origin);
      const safeReturnTo =
        requested.origin === window.location.origin
          ? `${requested.pathname}${requested.search}${requested.hash}`
          : context.workspaceUrl;
      loginUrl.searchParams.set('return_to', safeReturnTo);
      return `${loginUrl.pathname}${loginUrl.search}`;
    },
    resolveShopifyCallback() {
      return Promise.reject(
        new EricSessionError(
          'The Shopify storefront completes login through the native customer account page.',
        ),
      );
    },
    loginWithPassword() {
      return Promise.reject(
        new EricSessionError('Password sign-in is not available in the Shopify storefront.'),
      );
    },
    getAccount(sessionToken, tenantId, userId) {
      const context = readShopifyStorefrontContext();
      return getAccountFromEndpoint(context.accountEndpoint, sessionToken, tenantId, userId);
    },
    async logout(sessionToken) {
      const context = readShopifyStorefrontContext();
      const response = await fetch(context.logoutEndpoint, {
        method: 'POST',
        credentials: 'omit',
        keepalive: true,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      if (!response.ok) throw new Error('ERiC could not revoke the remote session.');
    },
  };
}

export const authApi: AuthApi = isShopifyStorefront
  ? storefrontAuthApi()
  : isLiveShopifyAuth
    ? liveAuthApi()
    : mockAuthApi();
