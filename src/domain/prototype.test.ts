import { describe, expect, it } from 'vitest';
import {
  calculateDetectionCost,
  createPrototypeState,
  detectionDefinitions,
  getSampleReport,
  purchaseCredits,
  submitDemoJob,
  validateEmail,
  validateOtp,
  validateRegistrationProfile,
} from './prototype';

describe('prototype domain', () => {
  it('exposes every approved detection capability', () => {
    expect(Object.keys(detectionDefinitions)).toEqual([
      'D001',
      'I001',
      'L001',
      'T001',
      'T002',
      'C001',
      'P001',
      'P002',
      'P004-P007',
    ]);
  });

  it('validates prototype account fields', () => {
    expect(validateEmail('seller@example.com')).toBe(true);
    expect(validateEmail('not-an-email')).toBe(false);
    expect(validateOtp('123456')).toBe(true);
    expect(validateOtp('654321')).toBe(false);
    expect(
      validateRegistrationProfile({
        fullName: 'Alex Morgan',
        companyName: 'Northstar Commerce',
        market: 'US',
        email: 'alex@northstar.example',
        acceptedTerms: true,
      }),
    ).toBe('');
  });

  it('calculates fixed, radar, policy, and safer-word costs', () => {
    expect(
      calculateDetectionCost({
        code: 'D001',
        radar: false,
        featureTerms: 0,
        safeWordCount: 1,
        markets: ['US'],
      }),
    ).toBe(10);
    expect(
      calculateDetectionCost({
        code: 'D001',
        radar: true,
        featureTerms: 0,
        safeWordCount: 1,
        markets: ['US'],
      }),
    ).toBe(15);
    expect(
      calculateDetectionCost({
        code: 'C001',
        radar: true,
        featureTerms: 0,
        safeWordCount: 1,
        markets: ['US'],
      }),
    ).toBe(2);
    expect(
      calculateDetectionCost({
        code: 'P002',
        radar: false,
        featureTerms: 3,
        safeWordCount: 1,
        markets: ['EU'],
      }),
    ).toBe(11);
    expect(
      calculateDetectionCost({
        code: 'T002',
        radar: false,
        featureTerms: 0,
        safeWordCount: 2,
        markets: ['UK'],
      }),
    ).toBe(2);
  });

  it('purchases credits without mutating the source state', () => {
    const initial = createPrototypeState();
    const next = purchaseCredits(initial, 'growth');
    expect(initial.balance).toBe(25);
    expect(next.balance).toBe(145);
  });

  it('submits jobs idempotently and produces an explicit sample report', () => {
    const funded = purchaseCredits(createPrototypeState(), 'starter');
    const selection = {
      code: 'D001' as const,
      radar: true,
      featureTerms: 0,
      safeWordCount: 1,
      markets: ['US', 'UK'] as const,
    };
    const first = submitDemoJob(
      funded,
      { ...selection, markets: [...selection.markets] },
      'demo-1',
    );
    const repeated = submitDemoJob(
      first,
      { ...selection, markets: [...selection.markets] },
      'demo-1',
    );
    expect(first.balance).toBe(60);
    expect(repeated.jobs).toHaveLength(1);
    expect(getSampleReport(repeated.jobs[0]!)).toMatchObject({
      prototype: true,
      taskId: 'DEMO-0001',
    });
  });

  it('flags insufficient credits without creating a second job', () => {
    const selection = {
      code: 'D001' as const,
      radar: true,
      featureTerms: 0,
      safeWordCount: 1,
      markets: ['US'] as const,
    };
    const first = submitDemoJob(
      createPrototypeState(),
      { ...selection, markets: [...selection.markets] },
      'first',
    );
    const second = submitDemoJob(
      first,
      { ...selection, markets: [...selection.markets] },
      'second',
    );
    expect(second.insufficientCredits).toBe(true);
    expect(second.jobs).toHaveLength(1);
    expect(second.balance).toBe(10);
  });
});
