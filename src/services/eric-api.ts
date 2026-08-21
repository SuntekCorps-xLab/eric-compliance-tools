import { readShopifyStorefrontContext } from '../storefront/context';
import { isShopifyStorefront } from './auth';

export interface EricWebAuth {
  sessionToken: string;
  userId: string;
  tenantId: number;
}

export interface EricEnvelope<T> {
  success?: boolean;
  code?: number;
  message?: string;
  data?: T;
  request_id?: string;
}

export class EricApiError extends Error {
  constructor(
    message: string,
    readonly invalidSession = false,
  ) {
    super(message);
    this.name = 'EricApiError';
  }
}

const invalidSessionCodes = new Set([10, 20, 101, 401, 601, 602, 70004]);

export function ericWebApiBase(): string {
  if (isShopifyStorefront) return readShopifyStorefrontContext().detectionApiBase;
  const configured = import.meta.env.VITE_DETECTION_API_BASE_URL?.trim();
  if (!configured) {
    throw new EricApiError('The ERiC detection API is not configured for this environment.');
  }
  return configured.replace(/\/$/, '');
}

export function ericWebHeaders(auth: EricWebAuth): HeadersInit {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${auth.sessionToken}`,
    'Content-Type': 'application/json',
    language: 'en',
    user_id: auth.userId,
    user_last_login_tenant: String(auth.tenantId),
  };
}

export async function readEricEnvelope<T>(
  response: Response,
  fallbackMessage = 'ERiC could not complete the request.',
): Promise<EricEnvelope<T>> {
  let payload: EricEnvelope<T>;
  try {
    payload = (await response.json()) as EricEnvelope<T>;
  } catch {
    throw new EricApiError(`ERiC returned an unreadable response (HTTP ${response.status}).`);
  }

  const code = Number(payload.code ?? response.status);
  if (!response.ok || payload.success === false || code !== 200) {
    throw new EricApiError(
      payload.message || fallbackMessage,
      response.status === 401 || invalidSessionCodes.has(code),
    );
  }
  return payload;
}
