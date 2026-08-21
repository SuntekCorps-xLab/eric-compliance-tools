import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSafeWordSuggestions } from './safe-words';

const auth = { sessionToken: 'eric-jwt', userId: '42', tenantId: 5164 };

describe('T002 safer wording contract', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('deduplicates requested terms and normalizes successful and failed suggestions', async () => {
    vi.stubEnv('VITE_DETECTION_API_BASE_URL', 'https://example.test/eric/Eric');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          data: {
            id: 9876,
            data: [
              {
                word: 'ARC',
                is_success: true,
                replace_word: 'CURVED',
                failed_words: ['BEND'],
              },
              { word: 'LAMP', is_success: false, replace_word: null, failed_words: [] },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSafeWordSuggestions('9876', [' ARC ', 'ARC', 'LAMP'], auth)).resolves.toEqual([
      { source: 'ARC', replacement: 'CURVED', success: true, failedWords: ['BEND'] },
      { source: 'LAMP', replacement: '', success: false, failedWords: [] },
    ]);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/Eric\/v4\/trademark\/safe-words$/);
    expect(JSON.parse(request.body as string)).toEqual({
      work_space_id: 9876,
      trademark: ['ARC', 'LAMP'],
    });
  });
});
