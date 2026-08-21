import type { LiveDetectionCode } from './detection';
import { ericWebApiBase, ericWebHeaders, readEricEnvelope, type EricWebAuth } from './eric-api';

export type DetectionHistoryStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';
export type HistoryDetectionCode = Exclude<LiveDetectionCode, 'P001'>;

export interface DetectionHistoryItem {
  workspaceId: string;
  code: LiveDetectionCode;
  title: string;
  sku: string;
  status: DetectionHistoryStatus;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface DetectionHistoryQuery {
  page: number;
  pageSize: number;
  code?: HistoryDetectionCode;
  status?: DetectionHistoryStatus;
  keyword?: string;
  beginDate?: string;
  endDate?: string;
}

export interface DetectionHistoryPage {
  items: DetectionHistoryItem[];
  page: number;
  pageSize: number;
  lastPage: number;
  total: number;
  from: number;
  to: number;
  requestId: string;
}

type UnknownRecord = Record<string, unknown>;

const modeByCode: Record<
  HistoryDetectionCode,
  'design' | 'invention' | 'logo' | 'trademark' | 'copyright' | 'policy'
> = {
  D001: 'design',
  T001: 'trademark',
  I001: 'invention',
  L001: 'logo',
  C001: 'copyright',
  P002: 'policy',
};

const codeByMode: Record<string, HistoryDetectionCode | undefined> = {
  design: 'D001',
  trademark: 'T001',
  invention: 'I001',
  logo: 'L001',
  graphic: 'L001',
  graphic_trademark: 'L001',
  copyright: 'C001',
  policy: 'P002',
};

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function integer(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function modesFor(item: UnknownRecord): string[] {
  const params = list(item.params).map(text).filter(Boolean);
  const statuses = list(item.check_status)
    .map((entry) => text(record(entry).mode))
    .filter(Boolean);
  return [...new Set([...params, ...statuses])];
}

function codeFor(item: UnknownRecord): HistoryDetectionCode | null {
  for (const mode of modesFor(item)) {
    const code = codeByMode[mode];
    if (code) return code;
  }
  return null;
}

function statusFor(item: UnknownRecord, code: HistoryDetectionCode): DetectionHistoryStatus {
  const mode = modeByCode[code];
  const matchingStatuses = list(item.check_status)
    .map(record)
    .filter((entry) => text(entry.mode) === mode);
  const statusesWithIds = matchingStatuses.filter((entry) => integer(entry.id, 0) > 0);
  const latestStatus = statusesWithIds.length
    ? statusesWithIds.reduce((latest, entry) =>
        integer(entry.id, 0) > integer(latest.id, 0) ? entry : latest,
      )
    : matchingStatuses.at(-1);
  const rawStatus = integer(latestStatus?.status, 0);
  if (rawStatus === 3) return 'COMPLETED';
  if (rawStatus === 2) return 'FAILED';
  if (rawStatus === 1) return 'RUNNING';

  // Older workspace rows can omit check_status. In that shape state=1 means the task is running;
  // otherwise the viewed marker is only assigned after the task has left the queue.
  return integer(item.state, 0) === 1 || integer(item.viewed, 0) === 1 ? 'RUNNING' : 'COMPLETED';
}

export function buildDetectionHistoryPayload(
  query: DetectionHistoryQuery,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ews_type: 2,
    sort: 1,
    page: Math.max(1, Math.trunc(query.page)),
    page_size: Math.min(100, Math.max(1, Math.trunc(query.pageSize))),
    time_column: 'create_time',
    mode_list: query.code
      ? [modeByCode[query.code]]
      : ['design', 'invention', 'logo', 'trademark', 'copyright', 'policy'],
  };
  const keyword = query.keyword?.trim();
  if (keyword) payload.keyword = keyword.slice(0, 100);
  if (query.beginDate) payload.begin_time = query.beginDate;
  if (query.endDate) payload.end_time = query.endDate;
  if (query.status) {
    payload.task_status = { RUNNING: 1, FAILED: 2, COMPLETED: 3 }[query.status];
  }
  return payload;
}

export function normalizeDetectionHistoryPage(
  value: unknown,
  query: DetectionHistoryQuery,
  requestId = '',
): DetectionHistoryPage {
  const data = record(value);
  const paginator = record(data.list);
  const items = list(paginator.data)
    .map(record)
    .map((item): DetectionHistoryItem | null => {
      const code = codeFor(item);
      const workspaceId = text(item.ews_id) || text(item.work_space_id) || text(item.id);
      if (!code || !workspaceId) return null;
      return {
        workspaceId,
        code,
        title: text(item.title) || `ERiC workspace ${workspaceId}`,
        sku: text(item.sku),
        status: statusFor(item, code),
        imageUrl: text(item.images_maps),
        createdAt: text(item.create_time),
        updatedAt: text(item.update_time) || text(item.create_time),
      };
    })
    .filter((item): item is DetectionHistoryItem => item !== null);
  const page = integer(paginator.current_page, Math.max(1, query.page));
  const pageSize = integer(paginator.per_page, Math.max(1, query.pageSize));
  const total = integer(paginator.total, items.length);
  return {
    items,
    page,
    pageSize,
    lastPage: Math.max(1, integer(paginator.last_page, Math.ceil(total / pageSize) || 1)),
    total,
    from: integer(paginator.from, items.length ? (page - 1) * pageSize + 1 : 0),
    to: integer(paginator.to, items.length ? (page - 1) * pageSize + items.length : 0),
    requestId,
  };
}

export async function getDetectionHistory(
  query: DetectionHistoryQuery,
  auth: EricWebAuth,
  signal?: AbortSignal,
): Promise<DetectionHistoryPage> {
  const response = await fetch(`${ericWebApiBase()}/v3/work-space/list`, {
    method: 'POST',
    credentials: 'omit',
    headers: ericWebHeaders(auth),
    body: JSON.stringify(buildDetectionHistoryPayload(query)),
    signal,
  });
  const payload = await readEricEnvelope<unknown>(
    response,
    'ERiC could not load detection history.',
  );
  return normalizeDetectionHistoryPage(payload.data, query, payload.request_id?.trim() || '');
}
