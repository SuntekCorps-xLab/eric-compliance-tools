import type {
  CopyrightDetectionResult,
  CopyrightResultItem,
  DesignDetectionResult,
  DesignResultItem,
  DetectionRisk,
  GraphicTrademarkDetectionResult,
  GraphicTrademarkResultItem,
  InventionDetectionResult,
  InventionResultItem,
  PolicyDetectionResult,
  PolicyResultItem,
  RestrictedProductDetectionResult,
  RestrictedProductResultItem,
  TrademarkDetectionResult,
  TrademarkNiceClass,
  TrademarkRecordStatus,
  TrademarkRegistrationRecord,
  TrademarkResultItem,
} from './detection';

type UnknownRecord = Record<string, unknown>;
export function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function number(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integer(value: unknown): number {
  return Math.max(0, Math.trunc(number(value) ?? 0));
}

function stringList(value: unknown): string[] {
  return list(value).map(text).filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function boolean(value: unknown): boolean {
  if (value === true || value === 1) return true;
  const normalized = text(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function trademarkRecordStatus(value: unknown): TrademarkRecordStatus {
  const normalized = text(value).toLowerCase();
  if (normalized === 'active' || normalized === 'registered') return 'active';
  if (normalized === 'pending' || normalized === 'filed') return 'pending';
  if (normalized === 'end' || normalized === 'ended' || normalized === 'expired') return 'ended';
  return 'unknown';
}

function topTrademarkRecordStatus(values: unknown[]): TrademarkRecordStatus {
  const statuses = values.map(trademarkRecordStatus);
  if (statuses.includes('active')) return 'active';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.includes('ended')) return 'ended';
  return 'unknown';
}

function trademarkNiceClasses(person: UnknownRecord): TrademarkNiceClass[] {
  const classes = new Map<string, TrademarkNiceClass>();
  const collect = (entries: unknown[], related: boolean) => {
    entries.forEach((entry) => {
      list(record(entry).nc).forEach((niceClass) => {
        const detail = record(niceClass);
        const code = text(detail.code) || text(niceClass);
        const name = text(detail.full_name) || text(detail.name);
        if (!code && !name) return;
        const key = `${code.toLowerCase()}|${name.toLowerCase()}`;
        const existing = classes.get(key);
        classes.set(key, {
          code,
          name,
          related: related || existing?.related === true,
        });
      });
    });
  };

  collect(list(person.related_arr), true);
  collect(list(person.unrelated_arr), false);
  collect(list(person.country_arr), false);
  return [...classes.values()];
}

function trademarkRegistrationRecords(
  itemId: string,
  item: UnknownRecord,
): TrademarkRegistrationRecord[] {
  return list(item.person_data).map((entry, index) => {
    const person = record(entry);
    const countries = list(person.country_arr).map(record);
    const scoreCandidates = [person.score, ...countries.map((country) => country.score)]
      .map(number)
      .filter((value): value is number => value !== undefined);
    return {
      id: text(person.id) || `${itemId}-record-${index + 1}`,
      holder: text(person.name) || text(person.holder) || `Trademark holder ${index + 1}`,
      status: topTrademarkRecordStatus([
        person.status,
        ...countries.map((country) => country.status),
      ]),
      score: scoreCandidates.length ? Math.max(...scoreCandidates) : undefined,
      regions: uniqueStrings([text(person.oo), ...countries.map((country) => text(country.oo))]),
      applicationNumbers: uniqueStrings([
        text(person.application_number),
        ...countries.map((country) => text(country.application_number)),
      ]),
      registrationNumbers: uniqueStrings([
        text(person.registration_number),
        ...countries.map((country) => text(country.registration_number)),
      ]),
      niceClasses: trademarkNiceClasses(person),
      activeLitigant: boolean(person.tro_holder) || boolean(person.activist),
      famousMark: boolean(person.famous_company) || boolean(person.famous),
      amazonBrand: boolean(person.amazon_brand),
    };
  });
}

function trademarkRegions(item: UnknownRecord): string[] {
  const regions = new Set(stringList(item.region));
  list(item.person_data).forEach((person) => {
    list(record(person).country_arr).forEach((country) => {
      const code = text(record(country).oo);
      if (code) regions.add(code);
    });
  });
  return [...regions];
}

function trademarkRisk(score: number | undefined, blacklisted: boolean): DetectionRisk {
  if (blacklisted || (score ?? 0) >= 5) return 'high';
  if ((score ?? 0) >= 3) return 'medium';
  return 'low';
}

export function normalizeTrademarkResult(
  workspaceId: string,
  requestId: string,
  value: unknown,
): TrademarkDetectionResult {
  const data = record(value);
  const checkData = record(data.checkData);
  const items = list(data.wordArr).map((entry, index): TrademarkResultItem => {
    const item = record(entry);
    const statistics = record(item.status_statistics);
    const score = number(item.score);
    const libraryFlags = list(item.bw_info).map((flag) => number(flag));
    const blacklisted = libraryFlags.includes(1);
    const whitelisted = libraryFlags.includes(2);
    const active = integer(statistics.active);
    const pending = integer(statistics.pending);
    const ended = integer(statistics.ended);
    const itemId = text(item.id) || `${workspaceId}-${index + 1}`;
    return {
      id: itemId,
      word: text(item.word) || text(item.origin_word) || `Finding ${index + 1}`,
      score,
      risk: trademarkRisk(score, blacklisted),
      regions: trademarkRegions(item),
      registrations: {
        active,
        pending,
        ended,
        total:
          number(statistics.total) === undefined
            ? active + pending + ended
            : integer(statistics.total),
      },
      explanation: text(item.trademark_explanation),
      blacklisted,
      whitelisted,
      records: trademarkRegistrationRecords(itemId, item),
    };
  });
  return {
    kind: 'trademark',
    workspaceId,
    requestId,
    title: text(checkData.title),
    items,
    riskCounts: {
      high: items.filter((item) => item.risk === 'high').length,
      medium: items.filter((item) => item.risk === 'medium').length,
      low: items.filter((item) => item.risk === 'low').length,
    },
  };
}

export function normalizeSimilarity(value: unknown): number | undefined {
  const parsed = number(value);
  if (parsed === undefined) return undefined;
  return Math.min(100, Math.max(0, parsed <= 1 ? parsed * 100 : parsed));
}

export function normalizeInventionResult(
  workspaceId: string,
  requestId: string,
  value: unknown,
): InventionDetectionResult {
  const data = record(value);
  const input = record(data.input_params);
  const items = list(data.data).map((entry, index): InventionResultItem => {
    const item = record(entry);
    return {
      id: text(item.global_utility_id) || text(item.id) || `${workspaceId}-${index + 1}`,
      title: text(item.title) || `Patent result ${index + 1}`,
      similarity: normalizeSimilarity(item.similarity),
      publicationNumber: text(item.publication_number),
      applicationNumber: text(item.application_number),
      region: text(item.region),
      patentStatus: text(item.patent_status),
      inventors: stringList(item.inventors),
    };
  });
  return {
    kind: 'invention',
    workspaceId,
    requestId,
    title: text(input.title) || text(input.product_title),
    total: number(data.total) === undefined ? items.length : integer(data.total),
    items,
  };
}

export function normalizePolicyResult(
  workspaceId: string,
  requestId: string,
  value: unknown,
): PolicyDetectionResult {
  const data = record(value);
  const items = list(data.info).flatMap((group, groupIndex) => {
    const countryGroup = record(group);
    const fallbackSite = text(countryGroup.country);
    return list(countryGroup.list).map((entry, itemIndex): PolicyResultItem => {
      const item = record(entry);
      const prohibited = integer(item.prohibited) === 1;
      const restricted = integer(item.compliance) === 1;
      return {
        id: text(item.code) || `${workspaceId}-${groupIndex + 1}-${itemIndex + 1}`,
        platform: text(item.platform) || 'Marketplace',
        site: text(item.site) || text(item.country) || fallbackSite,
        title:
          text(item.name) || text(item.policy) || text(item.product_name) || 'Marketplace policy',
        titleCn: text(item.name_cn),
        status: prohibited ? 'prohibited' : restricted ? 'restricted' : 'clear',
        reason: text(item.reason) || text(item.reason_title),
        contentUrl:
          text(item.content_url) || text(item.prohibited_link) || text(item.compliance_link),
      };
    });
  });
  const rawRisk = text(data.risk).toLowerCase();
  const risk = items.some((item) => item.status === 'prohibited')
    ? 'high'
    : items.some((item) => item.status === 'restricted')
      ? 'medium'
      : rawRisk.includes('high')
        ? 'high'
        : rawRisk.includes('medium') || rawRisk.includes('mid')
          ? 'medium'
          : 'low';
  return {
    kind: 'policy',
    workspaceId,
    requestId,
    risk,
    items,
    riskFeatureCount: list(data.risk_feature_list).length,
  };
}

function firstText(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).find(Boolean) ?? '';
  const direct = text(value);
  if (!direct || !direct.startsWith('[')) return direct;
  try {
    return list(JSON.parse(direct)).map(text).find(Boolean) ?? direct;
  } catch {
    return direct;
  }
}

function firstImageUrl(item: UnknownRecord): string {
  return (
    firstText(item.image) ||
    firstText(item.images) ||
    firstText(item.path_thumb) ||
    firstText(item.path) ||
    firstText(item.patent_image_url) ||
    firstText(item.pd_img_oss_url)
  );
}

function riskFromValue(value: unknown, similarity?: number): DetectionRisk {
  const normalized = text(value).toLowerCase();
  if (
    normalized.includes('high') ||
    normalized === '2' ||
    normalized === 'true' ||
    (similarity !== undefined && similarity >= 80)
  ) {
    return 'high';
  }
  if (
    normalized.includes('medium') ||
    normalized.includes('mid') ||
    normalized.includes('review') ||
    normalized === '1' ||
    (similarity !== undefined && similarity >= 60)
  ) {
    return 'medium';
  }
  return 'low';
}

function highestRisk(items: Array<{ risk: DetectionRisk }>): DetectionRisk {
  if (items.some((item) => item.risk === 'high')) return 'high';
  if (items.some((item) => item.risk === 'medium')) return 'medium';
  return 'low';
}

export function normalizeDesignResult(
  workspaceId: string,
  requestId: string,
  value: unknown,
): DesignDetectionResult {
  const data = record(value);
  const input = record(data.input_params);
  const select = record(data.select);
  const items = list(data.data ?? data.list).map((entry, index): DesignResultItem => {
    const item = record(entry);
    const similarity = normalizeSimilarity(item.similarity ?? item.distance ?? item.cosine);
    const radar = record(item.radar_result);
    const risk = riskFromValue(
      item.dpas ?? item.risk ?? item.radar_risk ?? radar.level ?? radar.same,
      similarity,
    );
    return {
      id: text(item.global_patent_id) || text(item.id) || `${workspaceId}-${index + 1}`,
      title:
        text(item.patent_prod) ||
        text(item.prod) ||
        text(item.title) ||
        `Design patent ${index + 1}`,
      publicationNumber:
        text(item.publication_number) ||
        text(item.registration_number) ||
        text(item.application_number),
      region: text(item.registration_office_code) || text(item.country) || text(item.region),
      status: text(item.patent_validity) || text(item.status) || text(item.patent_status),
      holder: firstText(item.applicants) || text(item.hol) || firstText(item.applicant_name),
      similarity,
      imageUrl: firstImageUrl(item),
      risk,
    };
  });
  return {
    kind: 'design',
    workspaceId,
    requestId,
    title:
      text(input.title) ||
      text(input.product_title) ||
      text(select.product_keywords) ||
      text(select.recommend_title),
    total: number(data.total) === undefined ? items.length : integer(data.total),
    risk: highestRisk(items),
    items,
  };
}

export function normalizeGraphicTrademarkResult(
  workspaceId: string,
  requestId: string,
  value: unknown,
): GraphicTrademarkDetectionResult {
  const data = record(value);
  const rows = list(data.data).map(record);
  const items = rows.map((entry, index): GraphicTrademarkResultItem => {
    const item = record(entry);
    const trademark = record(list(item.trademarkData ?? item.trademark_data)[0]);
    const similarity = normalizeSimilarity(
      item.similarity ?? item.cosine ?? item.score ?? trademark.similarity ?? trademark.cosine,
    );
    const risk = riskFromValue(
      item.sub_radar_result ??
        item.risk ??
        item.infirngement ??
        item.infringement ??
        trademark.sub_radar_result ??
        trademark.risk,
      similarity,
    );
    return {
      id:
        text(item.group_id) ||
        firstText(item.new_bid) ||
        firstText(item.bid) ||
        text(item.id) ||
        firstText(trademark.new_bid) ||
        firstText(trademark.bid) ||
        `${workspaceId}-${index + 1}`,
      name:
        text(item.brand) ||
        text(item.trademark_name) ||
        text(item.name) ||
        text(trademark.brand) ||
        text(trademark.name) ||
        `Graphic trademark ${index + 1}`,
      registrationNumber:
        text(item.registration_number) ||
        firstText(item.new_bid) ||
        firstText(item.bid) ||
        text(trademark.registration_number) ||
        firstText(trademark.new_bid) ||
        firstText(trademark.bid),
      region:
        text(item.registration_office_code) ||
        firstText(item.oo) ||
        text(item.region) ||
        text(trademark.registration_office_code) ||
        firstText(trademark.oo),
      status:
        text(item.trade_mark_status) ||
        text(item.status) ||
        text(trademark.trade_mark_status) ||
        text(trademark.status),
      holder:
        firstText(item.applicant_name) ||
        text(item.hol) ||
        text(item.holder) ||
        firstText(trademark.applicant_name) ||
        text(trademark.hol),
      similarity,
      imageUrl:
        text(item.img) || firstImageUrl(item) || text(trademark.img) || firstImageUrl(trademark),
      risk,
    };
  });
  const result = record(data.result);
  const overallRisk = riskFromValue(result.risk ?? result.radar_result);
  return {
    kind: 'graphic-trademark',
    workspaceId,
    requestId,
    total: number(data.total) === undefined ? items.length : integer(data.total),
    risk: overallRisk === 'low' ? highestRisk(items) : overallRisk,
    items,
  };
}

export function normalizeCopyrightResult(
  workspaceId: string,
  requestId: string,
  value: unknown,
): CopyrightDetectionResult {
  const data = record(value);
  const select = record(data.select);
  const params = record(select.params);
  const items = list(data.data ?? data.list).map((entry, index): CopyrightResultItem => {
    const item = record(entry);
    const similarity = normalizeSimilarity(item.similarity ?? item.cosine);
    return {
      id: text(item.design_code) || text(item.id) || `${workspaceId}-${index + 1}`,
      rightsOwner: text(item.rights_owner) || text(item.holder) || 'Rights owner not returned',
      similarity,
      imageUrl: firstImageUrl(item),
      sourceUrl: text(item.design_url) || text(item.link) || text(item.copyright_url),
      sourceName: text(item.source) || text(item.link),
      risk: riskFromValue(item.cas_risk ?? item.sub_radar_result ?? item.risk, similarity),
    };
  });
  const overallRisk = riskFromValue(params.cas_risk ?? data.cas_risk);
  return {
    kind: 'copyright',
    workspaceId,
    requestId,
    total: number(data.total) === undefined ? items.length : integer(data.total),
    risk: overallRisk === 'low' ? highestRisk(items) : overallRisk,
    items,
  };
}

export function normalizeRestrictedProductResult(
  resultId: string,
  requestId: string,
  value: unknown,
): RestrictedProductDetectionResult {
  const items = list(value).map((entry, index): RestrictedProductResultItem => {
    const item = record(entry);
    return {
      id: text(item.id) || text(item.uid) || `P001-${index + 1}`,
      title: text(item.pd_title) || text(item.title) || `Restricted-product match ${index + 1}`,
      titleCn: text(item.pd_title_CHN_censored) || text(item.pd_title_cn),
      similarity: normalizeSimilarity(item.cosine ?? item.similarity),
      imageUrl: firstImageUrl(item),
    };
  });
  return {
    kind: 'restricted-product',
    workspaceId: resultId || requestId || 'P001-direct-result',
    requestId,
    total: items.length,
    risk: items.some((item) => (item.similarity ?? 0) >= 40) ? 'high' : 'low',
    items,
  };
}
