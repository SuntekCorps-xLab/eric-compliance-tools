import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildDetectionHistoryPayload,
  getDetectionHistory,
  normalizeDetectionHistoryPage,
} from './history';

const auth = {
  sessionToken: 'eric-jwt',
  userId: '5170',
  tenantId: 5164,
};

describe('ERiC detection history contract', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('builds a server-paginated workspace request with filters', () => {
    expect(
      buildDetectionHistoryPayload({
        page: 2,
        pageSize: 20,
        code: 'T001',
        status: 'COMPLETED',
        keyword: '  lamp  ',
        beginDate: '2026-08-01',
        endDate: '2026-08-10',
      }),
    ).toEqual({
      ews_type: 2,
      sort: 1,
      page: 2,
      page_size: 20,
      time_column: 'create_time',
      mode_list: ['trademark'],
      task_status: 3,
      keyword: 'lamp',
      begin_time: '2026-08-01',
      end_time: '2026-08-10',
    });
  });

  it('includes every live mode by default and supports a P002 filter', () => {
    expect(buildDetectionHistoryPayload({ page: 1, pageSize: 20 })).toMatchObject({
      mode_list: ['design', 'invention', 'logo', 'trademark', 'copyright', 'policy'],
    });
    expect(buildDetectionHistoryPayload({ page: 1, pageSize: 20, code: 'P002' })).toMatchObject({
      mode_list: ['policy'],
    });
  });

  it('normalizes workspace modes, statuses, timestamps, and pagination', () => {
    expect(
      normalizeDetectionHistoryPage(
        {
          list: {
            current_page: 1,
            last_page: 3,
            per_page: 2,
            total: 5,
            from: 1,
            to: 2,
            data: [
              {
                ews_id: 9876,
                title: 'Arc lamp',
                sku: 'LAMP-1',
                params: ['trademark'],
                check_status: [
                  { id: 15, mode: 'trademark', status: 3 },
                  { id: 10, mode: 'trademark', status: 1 },
                ],
                create_time: '2026-08-10 09:00:00',
                update_time: '2026-08-10 09:01:00',
              },
              {
                work_space_id: '9877',
                title: 'Folding bracket',
                params: ['invention'],
                check_status: [{ mode: 'invention', status: 2 }],
                create_time: '2026-08-09 11:00:00',
              },
              {
                ews_id: 9878,
                title: 'Magnetic building set',
                params: ['policy'],
                check_status: [{ mode: 'policy', status: 3 }],
                create_time: '2026-08-08 12:00:00',
              },
              { ews_id: 9999, params: ['design'] },
            ],
          },
        },
        { page: 1, pageSize: 2 },
        'history-request',
      ),
    ).toEqual({
      items: [
        {
          workspaceId: '9876',
          code: 'T001',
          title: 'Arc lamp',
          sku: 'LAMP-1',
          status: 'COMPLETED',
          imageUrl: '',
          createdAt: '2026-08-10 09:00:00',
          updatedAt: '2026-08-10 09:01:00',
        },
        {
          workspaceId: '9877',
          code: 'I001',
          title: 'Folding bracket',
          sku: '',
          status: 'FAILED',
          imageUrl: '',
          createdAt: '2026-08-09 11:00:00',
          updatedAt: '2026-08-09 11:00:00',
        },
        {
          workspaceId: '9878',
          code: 'P002',
          title: 'Magnetic building set',
          sku: '',
          status: 'COMPLETED',
          imageUrl: '',
          createdAt: '2026-08-08 12:00:00',
          updatedAt: '2026-08-08 12:00:00',
        },
        {
          workspaceId: '9999',
          code: 'D001',
          title: 'ERiC workspace 9999',
          sku: '',
          status: 'COMPLETED',
          imageUrl: '',
          createdAt: '',
          updatedAt: '',
        },
      ],
      page: 1,
      pageSize: 2,
      lastPage: 3,
      total: 5,
      from: 1,
      to: 2,
      requestId: 'history-request',
    });
  });

  it('loads history with the Shopify ERiC session headers', async () => {
    vi.stubEnv('VITE_DETECTION_API_BASE_URL', 'https://example.test/eric/Eric');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          code: 200,
          request_id: 'request-history',
          data: {
            list: {
              current_page: 1,
              last_page: 1,
              per_page: 20,
              total: 1,
              from: 1,
              to: 1,
              data: [
                {
                  ews_id: 9876,
                  title: 'Arc lamp',
                  params: ['trademark'],
                  check_status: [{ mode: 'trademark', status: 1 }],
                },
              ],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getDetectionHistory({ page: 1, pageSize: 20 }, auth)).resolves.toMatchObject({
      requestId: 'request-history',
      total: 1,
      items: [{ workspaceId: '9876', code: 'T001', status: 'RUNNING' }],
    });
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/Eric\/v3\/work-space\/list$/);
    const requestHeaders = new Headers(request.headers);
    expect(requestHeaders.get('Authorization')).toBe('Bearer eric-jwt');
    expect(requestHeaders.get('user_id')).toBe('5170');
    expect(requestHeaders.get('user_last_login_tenant')).toBe('5164');
  });
});
