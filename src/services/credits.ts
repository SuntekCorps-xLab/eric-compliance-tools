import { readShopifyStorefrontContext } from '../storefront/context';
import { type EricWebAuth, EricApiError, ericWebHeaders, readEricEnvelope } from './eric-api';

export interface ShopifyPointPack {
  code: string;
  name: string;
  points: number;
  currency: string;
  priceMinor: number;
  price: string;
  expireDays: number;
}

export type ShopifyPointPurchaseStatus =
  'processing' | 'granted' | 'refund_pending' | 'reversed' | 'manual_review';

export interface ShopifyPointPurchase {
  id: number;
  intentId: number;
  status: ShopifyPointPurchaseStatus;
  orderId: string;
  points: number;
  currency: string;
  paidAmountMinor: number;
  paidAt: string;
  grantedAt: string;
}

export interface GuestDemoRefill {
  points: number;
  remainingRefills: number;
  expiresAt: string;
}

interface PointPackPayload {
  code?: string;
  name?: string;
  points?: number | string;
  currency?: string;
  price_minor?: number | string;
  price?: string;
  expire_days?: number | string;
}

interface CheckoutIntentPayload {
  intent_id?: number;
  draft_order_id?: string | number;
  checkout_url?: string;
  expires_at?: string;
  pack?: PointPackPayload;
}

interface PointPurchasePayload {
  id?: number | string;
  intent_id?: number | string;
  status?: ShopifyPointPurchaseStatus;
  order_id?: string | number;
  points?: number | string;
  currency?: string;
  paid_amount_minor?: number | string;
  paid_at?: string;
  granted_at?: string;
}

interface GuestDemoRefillPayload {
  points?: number | string;
  remaining_refills?: number | string;
  expires_at?: string;
}

export interface PendingShopifyCheckout {
  intentId: number;
  packCode: string;
  createdAt: number;
}

const pendingCheckoutKey = 'eric-shopify-checkout-pending-v1';

function asNumber(value: number | string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function tenantApiBase(): string {
  return readShopifyStorefrontContext().tenantApiBase.replace(/\/$/, '');
}

export function isShopifyInvoiceUrl(
  url: URL,
  storefrontHostname: string = window.location.hostname,
): boolean {
  const hostname = url.hostname.toLowerCase();
  const currentStorefront = storefrontHostname.trim().toLowerCase().replace(/\.$/, '');
  return (
    hostname.endsWith('.myshopify.com') ||
    (currentStorefront !== '' && hostname === currentStorefront)
  );
}

function pointPack(payload: PointPackPayload): ShopifyPointPack | null {
  const code = payload.code?.trim() || '';
  const points = asNumber(payload.points);
  const priceMinor = asNumber(payload.price_minor);
  const currency = payload.currency?.trim().toUpperCase() || '';
  if (!code || points <= 0 || priceMinor <= 0 || currency !== 'USD') {
    return null;
  }
  return {
    code,
    name: payload.name?.trim() || `${points.toLocaleString()} credits`,
    points,
    currency,
    priceMinor,
    price: payload.price?.trim() || (priceMinor / 100).toFixed(2),
    expireDays: asNumber(payload.expire_days),
  };
}

export async function listShopifyPointPacks(auth: EricWebAuth): Promise<ShopifyPointPack[]> {
  const response = await fetch(`${tenantApiBase()}/shopify/points/packs`, {
    method: 'GET',
    credentials: 'omit',
    headers: ericWebHeaders(auth),
  });
  const envelope = await readEricEnvelope<PointPackPayload[]>(
    response,
    'ERiC could not load the Shopify credit packs.',
  );
  return (Array.isArray(envelope.data) ? envelope.data : [])
    .map(pointPack)
    .filter((pack): pack is ShopifyPointPack => pack !== null);
}

export async function refillShopifyGuestDemo(auth: EricWebAuth): Promise<GuestDemoRefill> {
  const response = await fetch(`${tenantApiBase()}/shopify/demo/refill`, {
    method: 'POST',
    credentials: 'omit',
    headers: ericWebHeaders(auth),
  });
  const envelope = await readEricEnvelope<GuestDemoRefillPayload>(
    response,
    'ERiC could not add guest demo credits.',
  );
  const points = asNumber(envelope.data?.points);
  if (points <= 0) throw new EricApiError('ERiC returned an invalid guest demo refill.');

  return {
    points,
    remainingRefills: Math.max(0, asNumber(envelope.data?.remaining_refills)),
    expiresAt: envelope.data?.expires_at?.trim() || '',
  };
}

export async function createShopifyCheckoutIntent(
  auth: EricWebAuth,
  packCode: string,
): Promise<CheckoutIntentPayload> {
  const response = await fetch(`${tenantApiBase()}/shopify/points/checkout-intents`, {
    method: 'POST',
    credentials: 'omit',
    headers: ericWebHeaders(auth),
    body: JSON.stringify({ pack_code: packCode }),
  });
  const envelope = await readEricEnvelope<CheckoutIntentPayload>(
    response,
    'ERiC could not prepare Shopify Checkout.',
  );
  const intent = envelope.data;
  if (!intent) {
    throw new EricApiError('ERiC returned an invalid Shopify Checkout intent.');
  }
  const checkoutUrl = intent?.checkout_url?.trim() || '';
  let checkout: URL;
  try {
    checkout = new URL(checkoutUrl);
  } catch {
    throw new EricApiError('ERiC returned an invalid Shopify Checkout URL.');
  }
  if (
    Number(intent?.intent_id ?? 0) <= 0 ||
    !/^\d+$/.test(String(intent?.draft_order_id ?? '')) ||
    checkout.protocol !== 'https:' ||
    checkout.username !== '' ||
    checkout.password !== '' ||
    !isShopifyInvoiceUrl(checkout) ||
    !pointPack(intent.pack ?? {})
  ) {
    throw new EricApiError('ERiC returned an invalid Shopify Checkout intent.');
  }
  return intent;
}

export async function prepareShopifyPointCheckout(
  auth: EricWebAuth,
  packCode: string,
): Promise<string> {
  const intent = await createShopifyCheckoutIntent(auth, packCode);
  sessionStorage.setItem(
    pendingCheckoutKey,
    JSON.stringify({
      intentId: Number(intent.intent_id),
      packCode,
      createdAt: Date.now(),
    } satisfies PendingShopifyCheckout),
  );
  return String(intent.checkout_url);
}

export function pendingShopifyCheckout(): PendingShopifyCheckout | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(pendingCheckoutKey) ?? '',
    ) as Partial<PendingShopifyCheckout>;
    const intentId = Number(value.intentId ?? 0);
    const createdAt = Number(value.createdAt ?? 0);
    if (intentId <= 0 || createdAt <= 0 || Date.now() - createdAt > 35 * 60 * 1000) {
      clearPendingShopifyCheckout();
      return null;
    }
    return { intentId, packCode: String(value.packCode ?? ''), createdAt };
  } catch {
    clearPendingShopifyCheckout();
    return null;
  }
}

export function clearPendingShopifyCheckout(): void {
  sessionStorage.removeItem(pendingCheckoutKey);
}

export async function latestShopifyPointPurchase(
  auth: EricWebAuth,
): Promise<ShopifyPointPurchase | null> {
  const response = await fetch(`${tenantApiBase()}/shopify/points/purchases/latest`, {
    method: 'GET',
    credentials: 'omit',
    headers: ericWebHeaders(auth),
  });
  const envelope = await readEricEnvelope<PointPurchasePayload | []>(
    response,
    'ERiC could not load the latest Shopify purchase.',
  );
  if (!envelope.data || Array.isArray(envelope.data)) return null;
  const payload = envelope.data;
  const id = asNumber(payload.id);
  const points = asNumber(payload.points);
  if (id <= 0 || points <= 0 || !payload.status) return null;
  return {
    id,
    intentId: asNumber(payload.intent_id),
    status: payload.status,
    orderId: String(payload.order_id ?? ''),
    points,
    currency: payload.currency?.trim().toUpperCase() || 'USD',
    paidAmountMinor: asNumber(payload.paid_amount_minor),
    paidAt: payload.paid_at?.trim() || '',
    grantedAt: payload.granted_at?.trim() || '',
  };
}
