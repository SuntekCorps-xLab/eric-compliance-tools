import type { DetectionCode, Market } from '../domain/prototype';
import {
  EricApiError,
  ericWebApiBase,
  ericWebHeaders,
  readEricEnvelope,
  type EricWebAuth,
} from './eric-api';
import {
  list,
  normalizeCopyrightResult,
  normalizeDesignResult,
  normalizeGraphicTrademarkResult,
  normalizeInventionResult,
  normalizePolicyResult,
  normalizeRestrictedProductResult,
  normalizeSimilarity,
  normalizeTrademarkResult,
  record,
  text,
} from './detection-normalizers';

export type LiveDetectionCode = Extract<
  DetectionCode,
  'D001' | 'I001' | 'L001' | 'T001' | 'C001' | 'P001' | 'P002'
>;
export type AsyncDetectionCode = Exclude<LiveDetectionCode, 'P001'>;
export type ImageDetectionCode = Extract<LiveDetectionCode, 'D001' | 'L001' | 'C001' | 'P001'>;

// `/v3/design/regular/list`: 1 = physical, 2 = line drawing, 3 = hybrid.
const DESIGN_RESULT_QUERY_MODE_HYBRID = 3;

export type DetectionAuth = EricWebAuth;
export { EricApiError as EricDetectionError };

export interface DetectionInput {
  code: AsyncDetectionCode;
  title: string;
  description: string;
  sku: string;
  markets: Market[];
  image?: {
    url: string;
    width: number;
    height: number;
  };
  radar?: boolean;
  platformSites?: Record<string, string[]>;
  featureWordIds?: number[];
}

export interface DetectionSubmission {
  workspaceId: string;
  requestId: string;
}

export interface DetectionStatus {
  state: 'running' | 'completed' | 'failed';
  mode: 'design' | 'invention' | 'logo' | 'trademark' | 'copyright' | 'policy';
  rawStatus?: number;
  requestId: string;
}

export type DetectionRisk = 'high' | 'medium' | 'low';

export type TrademarkRecordStatus = 'active' | 'pending' | 'ended' | 'unknown';

export interface TrademarkNiceClass {
  code: string;
  name: string;
  related: boolean;
}

export interface TrademarkRegistrationRecord {
  id: string;
  holder: string;
  status: TrademarkRecordStatus;
  score?: number;
  regions: string[];
  applicationNumbers: string[];
  registrationNumbers: string[];
  niceClasses: TrademarkNiceClass[];
  activeLitigant: boolean;
  famousMark: boolean;
  amazonBrand: boolean;
}

export interface TrademarkResultItem {
  id: string;
  word: string;
  score?: number;
  risk: DetectionRisk;
  regions: string[];
  registrations: {
    active: number;
    pending: number;
    ended: number;
    total: number;
  };
  explanation: string;
  blacklisted: boolean;
  whitelisted: boolean;
  records: TrademarkRegistrationRecord[];
}

export interface TrademarkDetectionResult {
  kind: 'trademark';
  workspaceId: string;
  requestId: string;
  title: string;
  items: TrademarkResultItem[];
  riskCounts: Record<DetectionRisk, number>;
}

export interface InventionResultItem {
  id: string;
  title: string;
  similarity?: number;
  publicationNumber: string;
  applicationNumber: string;
  region: string;
  patentStatus: string;
  inventors: string[];
}

export interface InventionDetectionResult {
  kind: 'invention';
  workspaceId: string;
  requestId: string;
  title: string;
  total: number;
  items: InventionResultItem[];
}

export interface PolicyResultItem {
  id: string;
  platform: string;
  site: string;
  title: string;
  titleCn: string;
  status: 'prohibited' | 'restricted' | 'clear';
  reason: string;
  contentUrl: string;
}

export interface PolicyDetectionResult {
  kind: 'policy';
  workspaceId: string;
  requestId: string;
  risk: DetectionRisk;
  items: PolicyResultItem[];
  riskFeatureCount: number;
}

export interface DesignResultItem {
  id: string;
  title: string;
  publicationNumber: string;
  region: string;
  status: string;
  holder: string;
  similarity?: number;
  imageUrl: string;
  risk: DetectionRisk;
}

export interface DesignDetectionResult {
  kind: 'design';
  workspaceId: string;
  requestId: string;
  title: string;
  total: number;
  risk: DetectionRisk;
  items: DesignResultItem[];
}

export interface GraphicTrademarkResultItem {
  id: string;
  name: string;
  registrationNumber: string;
  region: string;
  status: string;
  holder: string;
  similarity?: number;
  imageUrl: string;
  risk: DetectionRisk;
}

export interface GraphicTrademarkDetectionResult {
  kind: 'graphic-trademark';
  workspaceId: string;
  requestId: string;
  total: number;
  risk: DetectionRisk;
  items: GraphicTrademarkResultItem[];
}

export interface CopyrightResultItem {
  id: string;
  rightsOwner: string;
  similarity?: number;
  imageUrl: string;
  sourceUrl: string;
  sourceName: string;
  risk: DetectionRisk;
}

export interface CopyrightDetectionResult {
  kind: 'copyright';
  workspaceId: string;
  requestId: string;
  total: number;
  risk: DetectionRisk;
  items: CopyrightResultItem[];
}

export interface RestrictedProductResultItem {
  id: string;
  title: string;
  titleCn: string;
  similarity?: number;
  imageUrl: string;
}

export interface RestrictedProductDetectionResult {
  kind: 'restricted-product';
  workspaceId: string;
  requestId: string;
  total: number;
  risk: DetectionRisk;
  items: RestrictedProductResultItem[];
}

export type LiveDetectionResult =
  | TrademarkDetectionResult
  | InventionDetectionResult
  | PolicyDetectionResult
  | DesignDetectionResult
  | GraphicTrademarkDetectionResult
  | CopyrightDetectionResult
  | RestrictedProductDetectionResult;

interface SaveCheckPayload {
  id?: number | string;
  work_space_id?: number | string;
  checkData?: { id?: number | string };
}

interface UploadPayload {
  file_url?: string;
}

const liveCodes = new Set<DetectionCode>(['D001', 'I001', 'L001', 'T001', 'C001', 'P001', 'P002']);

export function isLiveDetectionCode(code: DetectionCode): code is LiveDetectionCode {
  return liveCodes.has(code);
}

export function isAsyncDetectionCode(code: LiveDetectionCode): code is AsyncDetectionCode {
  return code !== 'P001';
}

export function supportedMarkets(code: LiveDetectionCode): Market[] {
  if (code === 'I001') return ['US'];
  if (code === 'C001' || code === 'P001' || code === 'P002') return [];
  return ['US', 'UK', 'EU'];
}

export function modeForDetection(code: AsyncDetectionCode): DetectionStatus['mode'] {
  if (code === 'D001') return 'design';
  if (code === 'T001') return 'trademark';
  if (code === 'L001') return 'logo';
  if (code === 'C001') return 'copyright';
  if (code === 'P002') return 'policy';
  return 'invention';
}

function regionsFor(input: DetectionInput): string[] {
  if (input.code === 'I001') return ['US'];
  if (input.code === 'C001') return [];
  const euCode = input.code === 'D001' ? 'EU' : 'EM';
  return input.markets.map((market) => ({ US: 'US', UK: 'GB', EU: euCode })[market]);
}

export function buildDetectionPayload(input: DetectionInput): Record<string, unknown> {
  const title = input.title.trim();
  const description = input.description.trim();
  const textLimit = input.code === 'I001' ? 30000 : 5000;
  const text = [title, description].filter(Boolean).join('\n\n').slice(0, textLimit);
  const regions = input.code === 'P002' ? [] : regionsFor(input);
  const common = {
    title,
    text,
    sku: input.sku.trim(),
    region: regions,
    check_type: 'radio',
  };

  if (input.code === 'D001' || input.code === 'L001' || input.code === 'C001') {
    const image = input.image;
    if (!image) throw new EricApiError('Upload one product image before running this check.');
    const crop = {
      image_id: 1000,
      image: image.url,
      image_url: image.url,
      big_image: image.url,
      left: 0,
      top: 0,
      width: image.width,
      height: image.height,
      points: [
        [0, 0],
        [image.width, 0],
        [image.width, image.height],
        [0, image.height],
      ],
      original: false,
      check: true,
      operate_type: 3,
    };
    if (input.code === 'D001') {
      return {
        ...common,
        mode: ['design'],
        images: [image.url],
        design: {
          images: [image.url],
          custom: [crop],
          yolo: [],
          operate_type: 3,
          is_picture_only: !title,
          enable_dpas: Boolean(input.radar),
          dpas_number: 20,
        },
      };
    }
    if (input.code === 'L001') {
      return {
        ...common,
        mode: ['logo'],
        images: [image.url],
        logo: {
          product_name: title,
          trademark: description,
          images: [image.url],
          custom: [crop],
          yolo: [],
          operate_type: 3,
          region: regions,
          enable_radar: Boolean(input.radar),
        },
      };
    }
    return {
      ...common,
      mode: ['copyright'],
      images: [image.url],
      copyright: {
        images: [image.url],
        custom: [crop],
        yolo: [],
        operate_type: 3,
        is_cas: Boolean(input.radar),
        is_analyze: false,
      },
    };
  }

  if (input.code === 'T001') {
    return {
      ...common,
      mode: ['trademark'],
      trademark: {
        region: regions,
        enable_blacklist: true,
        enable_whitelist: true,
      },
    };
  }
  if (input.code === 'P002') {
    return {
      ...common,
      mode: ['policy'],
      policy: {
        product_title: title,
        product_description: description,
        feature_word_ids: [...new Set(input.featureWordIds ?? [])],
        platform_sites: input.platformSites ?? {},
      },
    };
  }

  return {
    ...common,
    mode: ['invention'],
    invention: {
      product_title: title,
      product_description: description,
      regions,
      custom: [],
      enable_radar: false,
    },
  };
}

export async function submitDetection(
  input: DetectionInput,
  auth: DetectionAuth,
  signal?: AbortSignal,
): Promise<DetectionSubmission> {
  const requiresTitle = input.code === 'T001' || input.code === 'I001' || input.code === 'P002';
  if (requiresTitle && !input.title.trim()) {
    throw new EricApiError('Enter a product title before running a check.');
  }
  const titleLimit =
    input.code === 'I001' ? 500 : input.code === 'D001' || input.code === 'L001' ? 200 : 300;
  if (input.title.trim().length > titleLimit) {
    throw new EricApiError(
      input.code === 'I001'
        ? 'I001 product titles can contain at most 500 characters.'
        : `${input.code} product titles can contain at most ${titleLimit} characters.`,
    );
  }
  if (input.description.trim().length > (input.code === 'I001' ? 30000 : 5000)) {
    throw new EricApiError(
      input.code === 'I001'
        ? 'I001 product descriptions can contain at most 30,000 characters.'
        : `${input.code} product descriptions can contain at most 5,000 characters.`,
    );
  }
  if (input.code === 'D001' || input.code === 'L001' || input.code === 'C001') {
    if (!input.image?.url) {
      throw new EricApiError('Upload one product image before running this check.');
    }
  }
  if (input.code === 'P002') {
    const selectedSites = Object.values(input.platformSites ?? {})
      .flat()
      .filter(Boolean);
    if (selectedSites.length === 0) {
      throw new EricApiError('Choose at least one marketplace site.');
    }
  } else if (supportedMarkets(input.code).length > 0 && input.markets.length === 0) {
    throw new EricApiError('Choose at least one supported market.');
  } else if (
    supportedMarkets(input.code).length > 0 &&
    input.markets.some((market) => !supportedMarkets(input.code).includes(market))
  ) {
    throw new EricApiError(
      input.code === 'I001'
        ? 'I001 currently supports United States detection only.'
        : 'Choose a supported market.',
    );
  }

  const response = await fetch(`${ericWebApiBase()}/v5/save-check`, {
    method: 'POST',
    credentials: 'omit',
    headers: ericWebHeaders(auth),
    body: JSON.stringify(buildDetectionPayload(input)),
    signal,
  });
  const payload = await readEricEnvelope<SaveCheckPayload>(
    response,
    'ERiC could not submit the detection request.',
  );
  const workspaceId = String(
    payload.data?.id ?? payload.data?.work_space_id ?? payload.data?.checkData?.id ?? '',
  ).trim();
  if (!workspaceId) {
    throw new EricApiError('ERiC accepted the request without returning a workspace ID.');
  }
  return { workspaceId, requestId: payload.request_id?.trim() || '' };
}

function uploadHeaders(auth: DetectionAuth): Headers {
  const headers = new Headers(ericWebHeaders(auth));
  headers.delete('Content-Type');
  return headers;
}

export async function uploadDetectionImage(
  file: File,
  auth: DetectionAuth,
  signal?: AbortSignal,
): Promise<string> {
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    throw new EricApiError('Choose a JPG or PNG image.');
  }
  if (file.size > 4 * 1024 * 1024) {
    throw new EricApiError('The product image must be 4 MB or smaller.');
  }
  const formData = new FormData();
  formData.append('file[]', file, file.name);
  const response = await fetch(`${ericWebApiBase()}/upload`, {
    method: 'POST',
    credentials: 'omit',
    headers: uploadHeaders(auth),
    body: formData,
    signal,
  });
  const payload = await readEricEnvelope<UploadPayload[]>(
    response,
    'ERiC could not upload this image.',
  );
  const imageUrl = payload.data?.map((item) => item.file_url?.trim()).find(Boolean) ?? '';
  if (!imageUrl) throw new EricApiError('ERiC uploaded the image without returning its URL.');
  return imageUrl;
}

export async function runRestrictedProductDetection(
  imageUrl: string,
  auth: DetectionAuth,
  signal?: AbortSignal,
): Promise<RestrictedProductDetectionResult> {
  const response = await fetch(`${ericWebApiBase()}/v3/policy-compliance/search/gun-parts`, {
    method: 'POST',
    credentials: 'omit',
    headers: ericWebHeaders(auth),
    body: JSON.stringify({ image: imageUrl }),
    signal,
  });
  const payload = await readEricEnvelope<unknown>(
    response,
    'ERiC could not complete the restricted-product image search.',
  );
  const directData = record(payload.data);
  const matches = (Array.isArray(payload.data) ? list(payload.data) : list(directData.list))
    .map(record)
    .filter((item) => (normalizeSimilarity(item.cosine ?? item.similarity) ?? 0) >= 40);
  const matchIds = matches.map((item) => item.id).filter((id) => text(id));
  let evidence: unknown[] = matches;
  if (matchIds.length) {
    const detailResponse = await fetch(
      `${ericWebApiBase()}/v3/policy-compliance/bi-gun-part/get-by-cropped-uid`,
      {
        method: 'POST',
        credentials: 'omit',
        headers: ericWebHeaders(auth),
        body: JSON.stringify({ uid: matchIds }),
        signal,
      },
    );
    const detailPayload = await readEricEnvelope<unknown>(
      detailResponse,
      'ERiC found a restricted-product match but could not load its evidence.',
    );
    const details = list(detailPayload.data).map(record);
    if (details.length) {
      evidence = details.map((detail) => {
        const detailId = text(detail.pd_img_cropped_bi_uid) || text(detail.id);
        const match = matches.find((candidate) => text(candidate.id) === detailId) ?? {};
        return {
          ...match,
          ...detail,
          cosine: match.cosine ?? match.similarity ?? detail.cosine ?? detail.similarity,
        };
      });
    }
  }
  return normalizeRestrictedProductResult(
    text(directData.id),
    payload.request_id?.trim() || '',
    evidence,
  );
}

export async function getDetectionStatus(
  workspaceId: string,
  mode: DetectionStatus['mode'],
  auth: DetectionAuth,
  signal?: AbortSignal,
): Promise<DetectionStatus> {
  const url = new URL(`${ericWebApiBase()}/v5/get-check-status`);
  url.searchParams.set('work_space_id', workspaceId);
  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'omit',
    headers: ericWebHeaders(auth),
    signal,
  });
  const payload = await readEricEnvelope<Record<string, number | string>>(
    response,
    'ERiC could not load the detection status.',
  );
  const value = payload.data?.[mode];
  const rawStatus = value === undefined ? undefined : Number(value);
  const state = rawStatus === 3 ? 'completed' : rawStatus === 2 ? 'failed' : 'running';
  return {
    state,
    mode,
    rawStatus: Number.isFinite(rawStatus) ? rawStatus : undefined,
    requestId: payload.request_id?.trim() || '',
  };
}

export async function waitForDetection(
  workspaceId: string,
  mode: DetectionStatus['mode'],
  auth: DetectionAuth,
  options: { signal?: AbortSignal; intervalMs?: number; maxAttempts?: number } = {},
): Promise<DetectionStatus> {
  const intervalMs = options.intervalMs ?? 2000;
  const maxAttempts = options.maxAttempts ?? 45;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = await getDetectionStatus(workspaceId, mode, auth, options.signal);
    if (status.state === 'completed') return status;
    if (status.state === 'failed') {
      throw new EricApiError(
        'ERiC could not complete this detection task. You can edit the input and retry.',
      );
    }
    if (attempt < maxAttempts - 1) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          window.clearTimeout(timer);
          reject(new DOMException('The request was cancelled.', 'AbortError'));
        };
        const timer = window.setTimeout(() => {
          options.signal?.removeEventListener('abort', onAbort);
          resolve();
        }, intervalMs);
        if (options.signal?.aborted) onAbort();
        else options.signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
  }
  throw new EricApiError(
    'The ERiC task is still running. Keep the workspace ID and check again shortly; no duplicate task was created.',
  );
}

export async function getDetectionResult(
  code: AsyncDetectionCode,
  workspaceId: string,
  auth: DetectionAuth,
  signal?: AbortSignal,
): Promise<LiveDetectionResult> {
  const isTrademark = code === 'T001';
  const isPolicy = code === 'P002';
  const resultPath = {
    D001: '/v3/design/regular/list',
    I001: '/v5/invention/list',
    L001: '/v3/graphic-trademark/list',
    T001: '/v4/trademark/detail',
    C001: '/v3/copyright/list',
    P002: '/v3/policy-compliance/detail',
  }[code];
  const requestBody =
    code === 'D001'
      ? {
          work_space_id: Number(workspaceId),
          page: 1,
          per_page: 20,
          mode: DESIGN_RESULT_QUERY_MODE_HYBRID,
          keywords_filter: [],
        }
      : code === 'L001'
        ? {
            id: '',
            work_space_id: Number(workspaceId),
            page: 1,
            per_page: 20,
            trademark: '',
          }
        : isTrademark || isPolicy
          ? { work_space_id: Number(workspaceId) }
          : { work_space_id: Number(workspaceId), page: 1, per_page: code === 'C001' ? 20 : 10 };
  const response = await fetch(`${ericWebApiBase()}${resultPath}`, {
    method: 'POST',
    credentials: 'omit',
    headers: ericWebHeaders(auth),
    body: JSON.stringify(requestBody),
    signal,
  });
  const payload = await readEricEnvelope<unknown>(
    response,
    'ERiC could not load the detection result.',
  );
  const requestId = payload.request_id?.trim() || '';
  if (isTrademark) return normalizeTrademarkResult(workspaceId, requestId, payload.data);
  if (isPolicy) return normalizePolicyResult(workspaceId, requestId, payload.data);
  if (code === 'D001') return normalizeDesignResult(workspaceId, requestId, payload.data);
  if (code === 'L001') {
    return normalizeGraphicTrademarkResult(workspaceId, requestId, payload.data);
  }
  if (code === 'C001') return normalizeCopyrightResult(workspaceId, requestId, payload.data);
  return normalizeInventionResult(workspaceId, requestId, payload.data);
}
