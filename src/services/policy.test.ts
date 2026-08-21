import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deletePolicyFeatureWord,
  getPolicyFeatureWords,
  getPolicySites,
  savePolicyFeatureWord,
  suggestPolicyFeatureWords,
} from './policy';

const auth = { sessionToken: 'eric-jwt', userId: '42', tenantId: 5164 };

function response(data: unknown) {
  return new Response(JSON.stringify({ code: 200, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('P002 and P004-P007 policy contracts', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('loads normalized marketplace sites', async () => {
    vi.stubEnv('VITE_DETECTION_API_BASE_URL', 'https://example.test/eric/Eric');
    const fetchMock = vi.fn().mockResolvedValue(
      response([
        { platform: 'Amazon', site: 'US' },
        { platform: 'TEMU', site: 'CA' },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getPolicySites(auth)).resolves.toEqual([
      { platform: 'amazon', site: 'US' },
      { platform: 'temu', site: 'CA' },
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/Eric\/v3\/policy-compliance\/sites$/);
  });

  it('normalizes feature word pagination and processing states', async () => {
    vi.stubEnv('VITE_DETECTION_API_BASE_URL', 'https://example.test/eric/Eric');
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        current_page: 2,
        per_page: 10,
        total: 21,
        data: [
          { id: 17, words: 'magnetic toy', pull_status: 1, create_time: '2026-08-10' },
          { id: 18, words: 'restricted supplement', pull_status: 2 },
          { id: 19, words: 'laser pointer', pull_status: 0 },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getPolicyFeatureWords(2, 10, auth)).resolves.toMatchObject({
      page: 2,
      pageSize: 10,
      lastPage: 3,
      total: 21,
      items: [
        { id: 17, word: 'magnetic toy', pullStatus: 'ready' },
        { id: 18, pullStatus: 'failed' },
        { id: 19, pullStatus: 'processing' },
      ],
    });
  });

  it('suggests, saves, and deletes a tenant-scoped feature word', async () => {
    vi.stubEnv('VITE_DETECTION_API_BASE_URL', 'https://example.test/eric/Eric');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ word_arr: ['magnetic toy'], status: 0, suggestionNum: 2 }))
      .mockResolvedValueOnce(response({ id: 17 }))
      .mockResolvedValueOnce(response([]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(suggestPolicyFeatureWords(' magnet ', auth)).resolves.toEqual({
      words: ['magnetic toy'],
      status: 0,
      usedToday: 2,
    });
    await expect(savePolicyFeatureWord(' magnetic toy ', auth)).resolves.toBe(17);
    await expect(deletePolicyFeatureWord(17, auth)).resolves.toBeUndefined();

    const requestBodies: unknown[] = [];
    fetchMock.mock.calls.forEach(([, request]) => {
      requestBodies.push(JSON.parse((request as RequestInit).body as string) as unknown);
    });
    expect(requestBodies).toEqual([{ word: 'magnet' }, { word: 'magnetic toy' }, { id: 17 }]);
  });
});
