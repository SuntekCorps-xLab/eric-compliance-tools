import type { PolicyResultItem } from '../../services/detection';

export interface PolicyPlatformGroup {
  key: string;
  label: string;
  sites: string[];
  items: PolicyResultItem[];
  counts: {
    prohibited: number;
    restricted: number;
    clear: number;
  };
}

function normalizedLabel(value: string, fallback: string): string {
  return value.trim().replace(/\s+/g, ' ') || fallback;
}

export function groupPolicyResultsByPlatform(items: PolicyResultItem[]): PolicyPlatformGroup[] {
  const groups = new Map<string, PolicyPlatformGroup>();

  items.forEach((item) => {
    const label = normalizedLabel(item.platform, 'Marketplace');
    const key = label.toLocaleLowerCase('en-US');
    const site = normalizedLabel(item.site, '');
    const group = groups.get(key) ?? {
      key,
      label,
      sites: [],
      items: [],
      counts: { prohibited: 0, restricted: 0, clear: 0 },
    };

    group.items.push(item);
    group.counts[item.status] += 1;
    if (
      site &&
      !group.sites.some(
        (candidate) => candidate.toLocaleLowerCase('en-US') === site.toLocaleLowerCase('en-US'),
      )
    ) {
      group.sites.push(site);
    }
    groups.set(key, group);
  });

  return [...groups.values()];
}
