import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildDetectionPayload,
  getDetectionResult,
  modeForDetection,
  runRestrictedProductDetection,
  submitDetection,
  uploadDetectionImage,
  waitForDetection,
} from './detection';

const auth = {
  sessionToken: 'eric-jwt',
  userId: '42',
  tenantId: 5164,
};

describe('ERiC live detection contract', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps storefront markets to the T001 Web API contract', () => {
    expect(
      buildDetectionPayload({
        code: 'T001',
        title: ' Arc lamp ',
        description: ' Adjustable weighted base ',
        sku: ' LAMP-1 ',
        markets: ['US', 'UK', 'EU'],
      }),
    ).toEqual({
      title: 'Arc lamp',
      text: 'Arc lamp\n\nAdjustable weighted base',
      sku: 'LAMP-1',
      region: ['US', 'GB', 'EM'],
      mode: ['trademark'],
      check_type: 'radio',
      trademark: {
        region: ['US', 'GB', 'EM'],
        enable_blacklist: true,
        enable_whitelist: true,
      },
    });
  });

  it('uses the US-only I001 contract', () => {
    expect(
      buildDetectionPayload({
        code: 'I001',
        title: 'Arc lamp',
        description: 'Adjustable arm',
        sku: '',
        markets: ['US'],
      }),
    ).toMatchObject({
      region: ['US'],
      mode: ['invention'],
      invention: {
        product_title: 'Arc lamp',
        product_description: 'Adjustable arm',
        regions: ['US'],
        custom: [],
        enable_radar: false,
      },
    });
  });

  it('maps P002 marketplace sites and feature terms to the policy contract', () => {
    expect(
      buildDetectionPayload({
        code: 'P002',
        title: ' Kids magnetic building set ',
        description: ' Includes small magnetic pieces ',
        sku: ' MAG-1 ',
        markets: [],
        platformSites: { amazon: ['US', 'CA'], temu: ['US'] },
        featureWordIds: [17, 18, 17],
      }),
    ).toEqual({
      title: 'Kids magnetic building set',
      text: 'Kids magnetic building set\n\nIncludes small magnetic pieces',
      sku: 'MAG-1',
      region: [],
      mode: ['policy'],
      check_type: 'radio',
      policy: {
        product_title: 'Kids magnetic building set',
        product_description: 'Includes small magnetic pieces',
        feature_word_ids: [17, 18],
        platform_sites: { amazon: ['US', 'CA'], temu: ['US'] },
      },
    });
    expect(modeForDetection('T001')).toBe('trademark');
    expect(modeForDetection('I001')).toBe('invention');
    expect(modeForDetection('P002')).toBe('policy');
  });

  it('builds one-image D001, L001, and C001 save-check payloads', () => {
    const image = { url: 'https://cdn.example.test/product.png', width: 800, height: 600 };
    expect(
      buildDetectionPayload({
        code: 'D001',
        title: 'Arc lamp',
        description: '',
        sku: 'LAMP-1',
        markets: ['US', 'EU'],
        image,
        radar: true,
      }),
    ).toMatchObject({
      region: ['US', 'EU'],
      mode: ['design'],
      images: [image.url],
      design: {
        images: [image.url],
        enable_dpas: true,
        custom: [
          {
            image_id: 1000,
            image: image.url,
            big_image: image.url,
            width: 800,
            height: 600,
            check: true,
            operate_type: 3,
          },
        ],
      },
    });
    expect(
      buildDetectionPayload({
        code: 'L001',
        title: 'Arc lamp',
        description: 'ACME',
        sku: '',
        markets: ['UK', 'EU'],
        image,
        radar: false,
      }),
    ).toMatchObject({
      region: ['GB', 'EM'],
      mode: ['logo'],
      logo: {
        product_name: 'Arc lamp',
        trademark: 'ACME',
        region: ['GB', 'EM'],
        enable_radar: false,
      },
    });
    expect(
      buildDetectionPayload({
        code: 'C001',
        title: '',
        description: '',
        sku: '',
        markets: [],
        image,
        radar: true,
      }),
    ).toMatchObject({
      region: [],
      mode: ['copyright'],
      copyright: { images: [image.url], is_cas: true, is_analyze: false },
    });
    expect(modeForDetection('D001')).toBe('design');
    expect(modeForDetection('L001')).toBe('logo');
    expect(modeForDetection('C001')).toBe('copyright');
  });

  it('uploads a selected image without forcing a JSON content type', async () => {
    vi.stubEnv('VITE_DETECTION_API_BASE_URL', 'https://example.test/eric/Eric');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          data: [{ file_url: 'https://cdn.example.test/upload.png' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['image'], 'product.png', { type: 'image/png' });

    await expect(uploadDetectionImage(file, auth)).resolves.toBe(
      'https://cdn.example.test/upload.png',
    );
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/Eric\/upload$/);
    expect(request.body).toBeInstanceOf(FormData);
    const headers = new Headers(request.headers);
    expect(headers.get('Content-Type')).toBeNull();
    expect(headers.get('Authorization')).toBe('Bearer eric-jwt');
  });

  it('submits once with the existing ERiC JWT and tenant headers', async () => {
    vi.stubEnv('VITE_DETECTION_API_BASE_URL', 'https://compliance-api.example.com/Eric');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          code: 200,
          data: { id: 9876 },
          request_id: 'request-save',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitDetection(
        {
          code: 'T001',
          title: 'Arc lamp',
          description: 'Weighted base',
          sku: '',
          markets: ['US'],
        },
        auth,
      ),
    ).resolves.toEqual({ workspaceId: '9876', requestId: 'request-save' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/Eric\/v5\/save-check$/);
    expect(request.method).toBe('POST');
    const requestHeaders = new Headers(request.headers);
    expect(requestHeaders.get('Authorization')).toBe('Bearer eric-jwt');
    expect(requestHeaders.get('user_id')).toBe('42');
    expect(requestHeaders.get('user_last_login_tenant')).toBe('5164');
    expect(requestHeaders.get('language')).toBe('en');
  });

  it('polls status without creating a second task', async () => {
    vi.stubEnv('VITE_DETECTION_API_BASE_URL', 'https://example.test/eric/Eric');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 200, data: { trademark: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, data: { trademark: 3 }, request_id: 'request-status' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      waitForDetection('9876', 'trademark', auth, { intervalMs: 0, maxAttempts: 2 }),
    ).resolves.toMatchObject({ state: 'completed', requestId: 'request-status' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes('/get-check-status'))).toBe(
      true,
    );
  });

  it('loads and normalizes the completed T001 evidence without resubmitting', async () => {
    vi.stubEnv('VITE_DETECTION_API_BASE_URL', 'https://example.test/eric/Eric');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          request_id: 'request-detail',
          data: {
            checkData: { title: 'Arc lamp' },
            wordArr: [
              {
                id: 81,
                word: 'ARC',
                score: 5,
                bw_info: [1],
                status_statistics: { active: 1, pending: 1, ended: 1, total: 3 },
                person_data: [
                  {
                    id: 'holder-1',
                    name: 'Arc Lighting LLC',
                    status: 'active',
                    score: 5,
                    tro_holder: 1,
                    famous_company: true,
                    country_arr: [
                      {
                        oo: 'US',
                        status: 'active',
                        score: 5,
                        application_number: 'US-APP-001',
                        registration_number: 'US-REG-001',
                        nc: [{ code: '11', full_name: 'Lighting apparatus' }],
                      },
                    ],
                    related_arr: [{ nc: [{ code: '11', full_name: 'Lighting apparatus' }] }],
                  },
                  {
                    id: 'holder-2',
                    name: 'Arc Goods Ltd',
                    status: 'filed',
                    amazon_brand: '1',
                    country_arr: [{ oo: 'GB', status: 'pending', application_number: 'GB-002' }],
                  },
                  {
                    id: 'holder-3',
                    name: 'Arc Europe GmbH',
                    country_arr: [{ oo: 'EM', status: 'expired', registration_number: 'EM-003' }],
                  },
                ],
                trademark_explanation: 'Registered marks require review.',
              },
              {
                id: 82,
                word: 'LAMP',
                score: 1,
                bw_info: [2],
                status_statistics: {},
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getDetectionResult('T001', '9876', auth)).resolves.toMatchObject({
      kind: 'trademark',
      workspaceId: '9876',
      requestId: 'request-detail',
      title: 'Arc lamp',
      riskCounts: { high: 1, medium: 0, low: 1 },
      items: [
        {
          word: 'ARC',
          risk: 'high',
          regions: ['US', 'GB', 'EM'],
          registrations: { active: 1, pending: 1, ended: 1, total: 3 },
          blacklisted: true,
          records: [
            {
              id: 'holder-1',
              holder: 'Arc Lighting LLC',
              status: 'active',
              score: 5,
              regions: ['US'],
              applicationNumbers: ['US-APP-001'],
              registrationNumbers: ['US-REG-001'],
              niceClasses: [{ code: '11', name: 'Lighting apparatus', related: true }],
              activeLitigant: true,
              famousMark: true,
            },
            {
              holder: 'Arc Goods Ltd',
              status: 'pending',
              regions: ['GB'],
              amazonBrand: true,
            },
            {
              holder: 'Arc Europe GmbH',
              status: 'ended',
              regions: ['EM'],
            },
          ],
        },
        {
          word: 'LAMP',
          risk: 'low',
          whitelisted: true,
          records: [],
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/Eric\/v4\/trademark\/detail$/);
    expect(typeof request.body).toBe('string');
    expect(JSON.parse(request.body as string)).toEqual({ work_space_id: 9876 });
  });

  it('loads the first page of completed I001 patent evidence', async () => {
    vi.stubEnv('VITE_DETECTION_API_BASE_URL', 'https://example.test/eric/Eric');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          data: {
            total: 27,
            input_params: { title: 'Arc lamp' },
            data: [
              {
                global_utility_id: 'patent-1',
                title: 'Adjustable illumination device',
                similarity: 0.876,
                publication_number: 'US-2026-001',
                application_number: 'US-19-001',
                region: 'US',
                patent_status: 'Active',
                inventors: ['Ada Example'],
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getDetectionResult('I001', '9876', auth)).resolves.toMatchObject({
      kind: 'invention',
      workspaceId: '9876',
      title: 'Arc lamp',
      total: 27,
      items: [
        {
          id: 'patent-1',
          similarity: 87.6,
          publicationNumber: 'US-2026-001',
          patentStatus: 'Active',
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/Eric\/v5\/invention\/list$/);
    expect(typeof request.body).toBe('string');
    expect(JSON.parse(request.body as string)).toEqual({
      work_space_id: 9876,
      page: 1,
      per_page: 10,
    });
  });

  it('loads and normalizes completed P002 policy evidence', async () => {
    vi.stubEnv('VITE_DETECTION_API_BASE_URL', 'https://example.test/eric/Eric');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          request_id: 'request-policy',
          data: {
            info: [
              {
                country: 'US',
                list: [
                  {
                    code: 'PC101',
                    platform: 'Amazon',
                    country: 'US',
                    name: 'Magnet products',
                    name_cn: 'Magnetic product',
                    prohibited: 1,
                    compliance: 0,
                    reason_title: 'This product may be prohibited.',
                    prohibited_link: 'https://sellercentral.amazon.com/policy',
                  },
                  {
                    code: 'PC102',
                    platform: 'Amazon',
                    country: 'US',
                    policy: 'Children products',
                    prohibited: 0,
                    compliance: 1,
                    reason: 'Additional documentation may be required.',
                  },
                ],
              },
            ],
            risk_feature_list: [{ id: 17, words: 'magnetic' }],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getDetectionResult('P002', '9876', auth)).resolves.toMatchObject({
      kind: 'policy',
      workspaceId: '9876',
      requestId: 'request-policy',
      risk: 'high',
      riskFeatureCount: 1,
      items: [
        {
          id: 'PC101',
          platform: 'Amazon',
          site: 'US',
          title: 'Magnet products',
          titleCn: 'Magnetic product',
          status: 'prohibited',
          reason: 'This product may be prohibited.',
          contentUrl: 'https://sellercentral.amazon.com/policy',
        },
        {
          id: 'PC102',
          status: 'restricted',
          reason: 'Additional documentation may be required.',
        },
      ],
    });
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/Eric\/v3\/policy-compliance\/detail$/);
    expect(JSON.parse(request.body as string)).toEqual({ work_space_id: 9876 });
  });

  it('loads and normalizes D001, L001, C001, and direct P001 image evidence', async () => {
    vi.stubEnv('VITE_DETECTION_API_BASE_URL', 'https://example.test/eric/Eric');
    const json = (data: unknown, requestId = '') =>
      new Response(JSON.stringify({ code: 200, data, request_id: requestId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          total: 1,
          select: { product_keywords: 'Arc lamp' },
          data: [
            {
              global_patent_id: 'design-1',
              prod: 'Ornamental lamp',
              registration_number: 'USD123',
              country: 'US',
              status: 'ACT',
              hol: 'Example Lighting',
              distance: 0.91,
              images: ['https://cdn.example.test/design.png'],
              dpas: 'high_risk',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({
          total: 1,
          result: { risk: 'high_risk' },
          data: [
            {
              group_id: 'logo-1',
              brand: 'ACME',
              hol: 'Acme Inc.',
              new_bid: ['TM-001'],
              oo: ['US'],
              status: 'active',
              score: 0.84,
              img: 'https://cdn.example.test/logo.png',
              infirngement: true,
              trademarkData: [
                {
                  bid: 'TM-001',
                  name: 'ACME',
                  registration_number: 'TM-001',
                  oo: 'US',
                  status: 'active',
                  hol: 'Acme Inc.',
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({
          total: 1,
          select: { params: { cas_risk: 'high_risk' } },
          data: [
            {
              design_code: 'RB100',
              rights_owner: 'Artist',
              cosine: 0.72,
              path: 'https://cdn.example.test/art.png',
              design_url: 'https://source.example.test/art',
              cas_risk: 'high_risk',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json(
          [
            {
              id: 7,
              cosine: 0.51,
            },
            {
              id: 8,
              cosine: 0.2,
            },
          ],
          'request-p001',
        ),
      )
      .mockResolvedValueOnce(
        json([
          {
            pd_img_cropped_bi_uid: 7,
            pd_title: 'Restricted reference',
            pd_title_CHN_censored: 'Restricted product reference',
            pd_img_oss_url: 'https://cdn.example.test/restricted.png',
          },
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getDetectionResult('D001', '9876', auth)).resolves.toMatchObject({
      kind: 'design',
      title: 'Arc lamp',
      risk: 'high',
      items: [{ id: 'design-1', similarity: 91, holder: 'Example Lighting' }],
    });
    await expect(getDetectionResult('L001', '9877', auth)).resolves.toMatchObject({
      kind: 'graphic-trademark',
      risk: 'high',
      items: [{ id: 'logo-1', name: 'ACME', similarity: 84 }],
    });
    await expect(getDetectionResult('C001', '9878', auth)).resolves.toMatchObject({
      kind: 'copyright',
      risk: 'high',
      items: [{ id: 'RB100', rightsOwner: 'Artist', similarity: 72 }],
    });
    await expect(
      runRestrictedProductDetection('https://cdn.example.test/product.png', auth),
    ).resolves.toMatchObject({
      kind: 'restricted-product',
      workspaceId: 'request-p001',
      risk: 'high',
      items: [{ id: '7', similarity: 51 }],
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/v3\/design\/regular\/list$/);
    const [, designRequest] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(designRequest.body as string)).toEqual({
      work_space_id: 9876,
      page: 1,
      per_page: 20,
      mode: 3,
      keywords_filter: [],
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toMatch(/\/v3\/graphic-trademark\/list$/);
    expect(String(fetchMock.mock.calls[2]?.[0])).toMatch(/\/v3\/copyright\/list$/);
    expect(String(fetchMock.mock.calls[3]?.[0])).toMatch(
      /\/v3\/policy-compliance\/search\/gun-parts$/,
    );
    expect(String(fetchMock.mock.calls[4]?.[0])).toMatch(
      /\/v3\/policy-compliance\/bi-gun-part\/get-by-cropped-uid$/,
    );
    const [, detailRequest] = fetchMock.mock.calls[4] as [string, RequestInit];
    expect(JSON.parse(detailRequest.body as string)).toEqual({ uid: [7] });
  });

  it('requires at least one marketplace site for P002', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitDetection(
        {
          code: 'P002',
          title: 'Arc lamp',
          description: '',
          sku: '',
          markets: [],
          platformSites: {},
        },
        auth,
      ),
    ).rejects.toThrow('marketplace site');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported I001 markets before sending a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitDetection(
        {
          code: 'I001',
          title: 'Arc lamp',
          description: '',
          sku: '',
          markets: ['UK'],
        },
        auth,
      ),
    ).rejects.toThrow('United States');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves backend permission and session errors', async () => {
    vi.stubEnv('VITE_DETECTION_API_BASE_URL', 'https://example.test/eric/Eric');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, code: 401, message: 'Session expired' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const request = submitDetection(
      {
        code: 'T001',
        title: 'Arc lamp',
        description: '',
        sku: '',
        markets: ['US'],
      },
      auth,
    );
    await expect(request).rejects.toMatchObject({
      message: 'Session expired',
      invalidSession: true,
    });
  });

  it('shows permission errors without clearing an otherwise valid session', async () => {
    vi.stubEnv('VITE_DETECTION_API_BASE_URL', 'https://example.test/eric/Eric');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            code: 403,
            message: 'Please purchase this permission.',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const request = submitDetection(
      {
        code: 'T001',
        title: 'Arc lamp',
        description: '',
        sku: '',
        markets: ['US'],
      },
      auth,
    );
    await expect(request).rejects.toMatchObject({
      message: 'Please purchase this permission.',
      invalidSession: false,
    });
  });
});
