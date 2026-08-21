import { ericWebApiBase, ericWebHeaders, readEricEnvelope, type EricWebAuth } from './eric-api';

export interface PolicySite {
  platform: string;
  site: string;
}

export interface PolicyFeatureWord {
  id: number;
  word: string;
  pullStatus: 'processing' | 'ready' | 'failed';
  createdAt: string;
}

export interface PolicyFeatureWordPage {
  items: PolicyFeatureWord[];
  page: number;
  pageSize: number;
  lastPage: number;
  total: number;
}

export interface PolicyWordSuggestion {
  words: string[];
  status: -2 | -1 | 0;
  usedToday: number;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function integer(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function post<T>(
  path: string,
  body: Record<string, unknown>,
  auth: EricWebAuth,
  signal?: AbortSignal,
) {
  return fetch(`${ericWebApiBase()}${path}`, {
    method: 'POST',
    credentials: 'omit',
    headers: ericWebHeaders(auth),
    body: JSON.stringify(body),
    signal,
  }).then((response) =>
    readEricEnvelope<T>(response, 'ERiC could not complete the policy request.'),
  );
}

export async function getPolicySites(
  auth: EricWebAuth,
  signal?: AbortSignal,
): Promise<PolicySite[]> {
  const payload = await post<unknown>('/v3/policy-compliance/sites', {}, auth, signal);
  return (Array.isArray(payload.data) ? payload.data : [])
    .map(record)
    .map((item) => ({ platform: text(item.platform).toLowerCase(), site: text(item.site) }))
    .filter((item) => item.platform && item.site);
}

export async function getPolicyFeatureWords(
  page: number,
  pageSize: number,
  auth: EricWebAuth,
  signal?: AbortSignal,
): Promise<PolicyFeatureWordPage> {
  const payload = await post<unknown>(
    '/v5/policy-compliance/feature-word-list',
    { page: Math.max(1, page), per_page: Math.min(100, Math.max(1, pageSize)) },
    auth,
    signal,
  );
  const paginator = record(payload.data);
  const items = (Array.isArray(paginator.data) ? paginator.data : []).map(record).map((item) => ({
    id: integer(item.id),
    word: text(item.words),
    pullStatus:
      integer(item.pull_status) === 1
        ? ('ready' as const)
        : integer(item.pull_status) === 2
          ? ('failed' as const)
          : ('processing' as const),
    createdAt: text(item.create_time),
  }));
  const currentPage = Math.max(1, integer(paginator.current_page, page));
  const perPage = Math.max(1, integer(paginator.per_page, pageSize));
  const total = integer(paginator.total, items.length);
  return {
    items,
    page: currentPage,
    pageSize: perPage,
    lastPage: Math.max(1, Math.ceil(total / perPage)),
    total,
  };
}

export async function suggestPolicyFeatureWords(
  word: string,
  auth: EricWebAuth,
  signal?: AbortSignal,
): Promise<PolicyWordSuggestion> {
  const payload = await post<unknown>(
    '/v5/policy-compliance/feature-word-suggestion',
    { word: word.trim() },
    auth,
    signal,
  );
  const data = record(payload.data);
  const rawStatus = Number(data.status);
  return {
    words: (Array.isArray(data.word_arr) ? data.word_arr : []).map(text).filter(Boolean),
    status: rawStatus === -2 || rawStatus === -1 ? rawStatus : 0,
    usedToday: integer(data.suggestionNum ?? data.suggestion_num),
  };
}

export async function savePolicyFeatureWord(
  word: string,
  auth: EricWebAuth,
  signal?: AbortSignal,
): Promise<number> {
  const payload = await post<unknown>(
    '/v5/policy-compliance/feature-word-save',
    { word: word.trim() },
    auth,
    signal,
  );
  return integer(record(payload.data).id ?? payload.data);
}

export async function deletePolicyFeatureWord(
  id: number,
  auth: EricWebAuth,
  signal?: AbortSignal,
): Promise<void> {
  await post('/v5/policy-compliance/feature-word-delete', { id }, auth, signal);
}
