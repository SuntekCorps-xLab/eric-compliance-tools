import { describe, expect, it } from 'vitest';
import type { PolicyResultItem } from '../../services/detection';
import { groupPolicyResultsByPlatform } from './policy-result-groups';

function policy(
  id: string,
  platform: string,
  site: string,
  status: PolicyResultItem['status'],
): PolicyResultItem {
  return {
    id,
    platform,
    site,
    status,
    title: `Policy ${id}`,
    titleCn: '',
    reason: '',
    contentUrl: '',
  };
}

describe('groupPolicyResultsByPlatform', () => {
  it('merges platform variants while preserving item order and unique sites', () => {
    const groups = groupPolicyResultsByPlatform([
      policy('1', 'Temu', 'US', 'clear'),
      policy('2', ' temu ', 'us', 'prohibited'),
      policy('3', 'Amazon', 'UK', 'restricted'),
    ]);

    expect(groups.map((group) => group.label)).toEqual(['Temu', 'Amazon']);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(['1', '2']);
    expect(groups[0]?.sites).toEqual(['US']);
    expect(groups[0]?.counts).toEqual({ prohibited: 1, restricted: 0, clear: 1 });
  });

  it('uses a stable fallback for blank platform and omits blank sites', () => {
    const [group] = groupPolicyResultsByPlatform([
      policy('1', ' ', '', 'clear'),
      policy('2', '', '  ', 'restricted'),
    ]);

    expect(group?.label).toBe('Marketplace');
    expect(group?.sites).toEqual([]);
    expect(group?.items).toHaveLength(2);
  });
});
