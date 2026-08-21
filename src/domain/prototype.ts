export const creditPacks = {
  starter: { id: 'starter', name: 'Starter', credits: 50, price: 1 },
  growth: { id: 'growth', name: 'Growth', credits: 120, price: 2 },
  business: { id: 'business', name: 'Business', credits: 210, price: 3 },
} as const;

export type CreditPackId = keyof typeof creditPacks;
export type Market = 'US' | 'UK' | 'EU';
export type DetectionInput = 'image' | 'text' | 'term' | 'term-library';

export const detectionDefinitions = {
  D001: { label: 'Design patent check', baseCost: 10, radarCost: 15, input: 'image' },
  I001: { label: 'Utility patent check', baseCost: 10, input: 'text' },
  L001: { label: 'Graphic trademark check', baseCost: 10, radarCost: 15, input: 'image' },
  T001: { label: 'Text trademark check', baseCost: 1, input: 'text' },
  T002: {
    label: 'Safer wording suggestions',
    baseCost: 1,
    variable: 'safeWordCount',
    input: 'term',
  },
  C001: { label: 'Copyright image check', baseCost: 1, radarCost: 2, input: 'image' },
  P001: { label: 'Restricted-product image check', baseCost: 1, input: 'image' },
  P002: {
    label: 'Marketplace policy check',
    baseCost: 5,
    variable: 'featureTerms',
    input: 'text',
  },
  'P004-P007': { label: 'Private risk-term library', baseCost: 0, input: 'term-library' },
} as const satisfies Record<
  string,
  {
    label: string;
    baseCost: number;
    radarCost?: number;
    variable?: 'featureTerms' | 'safeWordCount';
    input: DetectionInput;
  }
>;

export type DetectionCode = keyof typeof detectionDefinitions;

export interface RegistrationProfile {
  fullName: string;
  companyName: string;
  market: Market | '';
  email: string;
  acceptedTerms: boolean;
}

export interface DetectionSelection {
  code: DetectionCode;
  radar: boolean;
  featureTerms: number;
  safeWordCount: number;
  markets: Market[];
}

export interface PrototypeJob {
  id: string;
  status: 'QUEUED' | 'SUCCEEDED';
  cost: number;
  selection: DetectionSelection;
}

export interface PrototypeReport {
  prototype: true;
  taskId: string;
  status: string;
  creditsUsed: number;
  markets: Market[];
  subject: string;
  summary: string;
  matches: Array<{
    publicationNumber: string;
    similarity: number;
    risk: 'High' | 'Review' | 'Low';
  }>;
}

export interface PrototypeState {
  balance: number;
  jobs: PrototypeJob[];
  idempotencyKeys: string[];
  insufficientCredits: boolean;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function validateEmail(value: unknown): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stringValue(value).trim());
}

export function validateOtp(value: unknown): boolean {
  return stringValue(value).trim() === '123456';
}

const sellingMarkets = new Set<Market>(['US', 'UK', 'EU']);

export function validateRegistrationProfile(profile: RegistrationProfile): string {
  if (!profile.fullName.trim()) return 'Enter your full name.';
  if (!profile.companyName.trim()) return 'Enter your company name.';
  if (!profile.market || !sellingMarkets.has(profile.market)) {
    return 'Choose your primary selling market.';
  }
  if (!validateEmail(profile.email)) return 'Enter a valid work email address.';
  if (!profile.acceptedTerms) return 'Accept the Terms and Privacy notice to continue.';
  return '';
}

function nonNegativeInteger(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

export function calculateDetectionCost(selection: DetectionSelection): number {
  const definition = detectionDefinitions[selection.code];
  if ('radarCost' in definition && selection.radar) return definition.radarCost;
  if ('variable' in definition && definition.variable === 'featureTerms') {
    return definition.baseCost + nonNegativeInteger(selection.featureTerms) * 2;
  }
  if ('variable' in definition && definition.variable === 'safeWordCount') {
    return definition.baseCost * Math.max(1, nonNegativeInteger(selection.safeWordCount, 1));
  }
  return definition.baseCost;
}

export function createPrototypeState(balance = 25): PrototypeState {
  return {
    balance,
    jobs: [],
    idempotencyKeys: [],
    insufficientCredits: false,
  };
}

export function purchaseCredits(state: PrototypeState, packId: CreditPackId): PrototypeState {
  const pack = creditPacks[packId];
  return {
    ...state,
    balance: state.balance + pack.credits,
    insufficientCredits: false,
  };
}

export function submitDemoJob(
  state: PrototypeState,
  selection: DetectionSelection,
  idempotencyKey: string,
): PrototypeState {
  if (!idempotencyKey) throw new TypeError('An idempotency key is required.');
  if (state.idempotencyKeys.includes(idempotencyKey)) return state;

  const cost = calculateDetectionCost(selection);
  if (cost > state.balance) return { ...state, insufficientCredits: true };

  const job: PrototypeJob = {
    id: `DEMO-${String(state.jobs.length + 1).padStart(4, '0')}`,
    status: 'QUEUED',
    cost,
    selection: { ...selection, markets: [...selection.markets] },
  };

  return {
    ...state,
    balance: state.balance - cost,
    jobs: [job, ...state.jobs],
    idempotencyKeys: [...state.idempotencyKeys, idempotencyKey],
    insufficientCredits: false,
  };
}

export function getSampleReport(job: PrototypeJob): PrototypeReport {
  return {
    prototype: true,
    taskId: job.id,
    status: 'Review recommended',
    creditsUsed: job.cost,
    markets: job.selection.markets.length ? [...job.selection.markets] : ['US'],
    subject: 'Arc desk lamp',
    summary: 'One close visual match and one related design should be reviewed before listing.',
    matches: [
      { publicationNumber: 'SAMPLE-US-D1045821', similarity: 0.87, risk: 'High' },
      { publicationNumber: 'SAMPLE-GB-6294012', similarity: 0.68, risk: 'Review' },
      { publicationNumber: 'SAMPLE-WO-2026-01842', similarity: 0.42, risk: 'Low' },
    ],
  };
}
