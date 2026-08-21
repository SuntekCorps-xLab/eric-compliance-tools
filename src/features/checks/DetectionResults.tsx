import { useId, useMemo, useState } from 'react';
import type {
  CopyrightDetectionResult,
  DetectionRisk,
  DesignDetectionResult,
  GraphicTrademarkDetectionResult,
  InventionDetectionResult,
  PolicyDetectionResult,
  RestrictedProductDetectionResult,
  TrademarkDetectionResult,
  TrademarkRecordStatus,
  TrademarkRegistrationRecord,
} from '../../services/detection';
import { groupPolicyResultsByPlatform } from './policy-result-groups';

export interface SafeWordState {
  status: 'loading' | 'success' | 'error';
  replacement?: string;
  message?: string;
}

function riskClass(risk: DetectionRisk): string {
  return risk === 'high' ? 'risk-high' : risk === 'medium' ? 'risk-review' : 'risk-low';
}
function safeExternalUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

type TrademarkRecordFilter = 'all' | Exclude<TrademarkRecordStatus, 'unknown'>;

function recordStatusLabel(status: TrademarkRecordStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'pending') return 'Pending';
  if (status === 'ended') return 'Ended';
  return 'Status unavailable';
}

function recordValues(values: string[]): string {
  return values.length ? values.join(' · ') : 'Not returned';
}

function TrademarkRecordEvidence({
  term,
  records,
  registrations,
}: {
  term: string;
  records: TrademarkRegistrationRecord[];
  registrations: TrademarkDetectionResult['items'][number]['registrations'];
}) {
  const panelId = useId();
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TrademarkRecordFilter>('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(6);
  const statusSegments = [
    { status: 'active' as const, label: 'Active', count: registrations.active },
    { status: 'pending' as const, label: 'Pending', count: registrations.pending },
    { status: 'ended' as const, label: 'Ended', count: registrations.ended },
  ];
  const chartTotal = statusSegments.reduce((total, segment) => total + segment.count, 0);
  const returnedStatusCounts = useMemo(
    () =>
      records.reduce(
        (counts, record) => {
          if (record.status !== 'unknown') counts[record.status] += 1;
          return counts;
        },
        { active: 0, pending: 0, ended: 0 },
      ),
    [records],
  );
  const regions = useMemo(
    () => [...new Set(records.flatMap((record) => record.regions))].sort(),
    [records],
  );
  const filteredRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          (statusFilter === 'all' || record.status === statusFilter) &&
          (regionFilter === 'all' || record.regions.includes(regionFilter)),
      ),
    [records, regionFilter, statusFilter],
  );
  const totalRecords = Math.max(registrations.total, records.length);
  const summaryDiffersFromRecords =
    records.length > 0 &&
    (registrations.total !== records.length ||
      statusSegments.some((segment) => segment.count !== returnedStatusCounts[segment.status]));

  const selectStatus = (status: TrademarkRecordFilter) => {
    setStatusFilter(status);
    setVisibleCount(6);
    setOpen(true);
  };

  const selectRegion = (region: string) => {
    setRegionFilter(region);
    setVisibleCount(6);
  };

  return (
    <section className="trademark-records" aria-labelledby={headingId}>
      <div className="trademark-records-heading">
        <div>
          <small>Registration evidence</small>
          <h6 id={headingId}>Trademark records</h6>
        </div>
        <span>
          {records.length
            ? `${records.length} record${records.length === 1 ? '' : 's'} returned`
            : `${totalRecords} record${totalRecords === 1 ? '' : 's'} reported`}
        </span>
      </div>
      {chartTotal ? (
        <div
          className="record-status-chart"
          role="img"
          aria-label={`${term} registration status: ${registrations.active} active, ${registrations.pending} pending, ${registrations.ended} ended.`}
        >
          {statusSegments.map((segment) =>
            segment.count ? (
              <span
                className={`record-status-segment status-${segment.status}`}
                key={segment.status}
                style={{ flexGrow: segment.count }}
                title={`${segment.label}: ${segment.count}`}
              />
            ) : null,
          )}
        </div>
      ) : null}
      <div className="record-status-legend" aria-label="Registration status summary">
        {statusSegments.map((segment) => (
          <button
            className={statusFilter === segment.status ? 'active' : undefined}
            type="button"
            key={segment.status}
            disabled={returnedStatusCounts[segment.status] === 0}
            aria-pressed={statusFilter === segment.status}
            onClick={() => selectStatus(segment.status)}
          >
            <i className={`status-${segment.status}`} aria-hidden="true" />
            <span>{segment.label}</span>
            <strong>{segment.count}</strong>
          </button>
        ))}
      </div>
      {summaryDiffersFromRecords ? (
        <p className="record-count-note" role="status">
          ERiC returned {records.length} record details while the summary reports{' '}
          {registrations.total}. Filters apply to the returned records.
        </p>
      ) : null}
      {records.length ? (
        <>
          <button
            className="record-disclosure"
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((current) => !current)}
          >
            <span>{open ? 'Hide registration records' : `Review ${records.length} records`}</span>
            <b aria-hidden="true">{open ? '−' : '+'}</b>
          </button>
          <div className="record-panel" id={panelId} hidden={!open}>
            <div className="record-filter-row">
              <div
                className="record-status-filters"
                role="group"
                aria-label="Filter records by status"
              >
                <button
                  type="button"
                  className={statusFilter === 'all' ? 'active' : undefined}
                  aria-pressed={statusFilter === 'all'}
                  onClick={() => selectStatus('all')}
                >
                  All <span>{records.length}</span>
                </button>
                {statusSegments.map((segment) => (
                  <button
                    type="button"
                    key={segment.status}
                    className={statusFilter === segment.status ? 'active' : undefined}
                    disabled={returnedStatusCounts[segment.status] === 0}
                    aria-pressed={statusFilter === segment.status}
                    onClick={() => selectStatus(segment.status)}
                  >
                    {segment.label} <span>{returnedStatusCounts[segment.status]}</span>
                  </button>
                ))}
              </div>
              <label className="record-region-filter">
                <span>Market</span>
                <select
                  aria-label={`Filter ${term} records by market`}
                  value={regionFilter}
                  onChange={(event) => selectRegion(event.target.value)}
                >
                  <option value="all">All markets</option>
                  {regions.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {filteredRecords.length ? (
              <ol className="trademark-record-list" data-testid="trademark-record-list">
                {filteredRecords.slice(0, visibleCount).map((record, index) => (
                  <li key={record.id}>
                    <span className="record-index" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <article>
                      <header>
                        <div>
                          <small>Rights holder</small>
                          <h6>{record.holder}</h6>
                        </div>
                        <div className="record-flags">
                          <span className={`record-status-chip status-${record.status}`}>
                            {recordStatusLabel(record.status)}
                          </span>
                          {record.activeLitigant ? (
                            <span className="record-alert-chip">Active litigant</span>
                          ) : null}
                          {record.famousMark ? <span>Famous mark</span> : null}
                          {record.amazonBrand ? <span>Amazon brand</span> : null}
                        </div>
                      </header>
                      <dl className="record-metadata">
                        <div>
                          <dt>Market</dt>
                          <dd>{recordValues(record.regions)}</dd>
                        </div>
                        <div>
                          <dt>Risk score</dt>
                          <dd>{record.score ?? 'Not returned'}</dd>
                        </div>
                        <div>
                          <dt>Application no.</dt>
                          <dd title={recordValues(record.applicationNumbers)}>
                            {recordValues(record.applicationNumbers)}
                          </dd>
                        </div>
                        <div>
                          <dt>Registration no.</dt>
                          <dd title={recordValues(record.registrationNumbers)}>
                            {recordValues(record.registrationNumbers)}
                          </dd>
                        </div>
                      </dl>
                      {record.niceClasses.length ? (
                        <div className="record-classes">
                          <small>Nice classes</small>
                          <div>
                            {record.niceClasses.slice(0, 6).map((niceClass) => (
                              <span
                                className={niceClass.related ? 'related' : undefined}
                                key={`${niceClass.code}-${niceClass.name}`}
                                title={niceClass.name || undefined}
                              >
                                {niceClass.code || niceClass.name}
                              </span>
                            ))}
                            {record.niceClasses.length > 6 ? (
                              <span>+{record.niceClasses.length - 6}</span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="record-filter-empty" role="status">
                No records match the selected status and market.
              </div>
            )}
            {visibleCount < filteredRecords.length ? (
              <button
                className="record-load-more"
                type="button"
                onClick={() => setVisibleCount((current) => current + 6)}
              >
                Show 6 more <span>{filteredRecords.length - visibleCount} remaining</span>
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="record-unavailable">
          ERiC reported {totalRecords} registrations, but record-level details were not returned for
          this workspace.
        </p>
      )}
    </section>
  );
}

export function TrademarkResults({
  result,
  safeWords,
  onGenerateSafeWord,
}: {
  result: TrademarkDetectionResult;
  safeWords: Record<string, SafeWordState>;
  onGenerateSafeWord: (itemId: string, word: string) => void;
}) {
  return (
    <section className="live-results" aria-labelledby="trademark-results-title">
      <div className="live-results-heading">
        <div>
          <p className="prototype-label">Live T001 evidence</p>
          <h4 id="trademark-results-title">Trademark risk terms</h4>
        </div>
        <span>{result.items.length} terms returned</span>
      </div>
      <dl className="result-summary-grid">
        <div>
          <dt>Total terms</dt>
          <dd>{result.items.length}</dd>
        </div>
        <div className="summary-high">
          <dt>High risk</dt>
          <dd>{result.riskCounts.high}</dd>
        </div>
        <div className="summary-medium">
          <dt>Medium risk</dt>
          <dd>{result.riskCounts.medium}</dd>
        </div>
        <div>
          <dt>Low risk</dt>
          <dd>{result.riskCounts.low}</dd>
        </div>
      </dl>
      {result.items.length ? (
        <ol className="evidence-list" data-testid="trademark-results">
          {result.items.map((item) => {
            const safeWord = safeWords[item.id];
            const canGenerate = item.risk === 'high' || item.risk === 'medium';
            return (
              <li key={`${result.workspaceId}-${item.id}`}>
                <div className="evidence-title">
                  <div>
                    <small>Detected term</small>
                    <h5>{item.word}</h5>
                  </div>
                  <span className={`risk-chip ${riskClass(item.risk)}`}>{item.risk} risk</span>
                </div>
                <dl className="evidence-metadata">
                  <div>
                    <dt>Risk score</dt>
                    <dd>{item.score ?? 'Not returned'}</dd>
                  </div>
                  <div>
                    <dt>Active</dt>
                    <dd>{item.registrations.active}</dd>
                  </div>
                  <div>
                    <dt>Pending</dt>
                    <dd>{item.registrations.pending}</dd>
                  </div>
                  <div>
                    <dt>Total records</dt>
                    <dd>{item.registrations.total}</dd>
                  </div>
                </dl>
                <p>
                  <strong>Markets:</strong>{' '}
                  {item.regions.length ? item.regions.join(' · ') : 'Not returned'}
                  {item.blacklisted ? (
                    <span className="evidence-flag flag-block">Private blacklist match</span>
                  ) : null}
                  {item.whitelisted ? (
                    <span className="evidence-flag flag-allow">Private whitelist match</span>
                  ) : null}
                </p>
                {item.explanation ? (
                  <p className="evidence-explanation">{item.explanation}</p>
                ) : null}
                <TrademarkRecordEvidence
                  term={item.word}
                  records={item.records}
                  registrations={item.registrations}
                />
                {canGenerate ? (
                  <div className="safe-word-action">
                    <button
                      className="button button-small"
                      type="button"
                      disabled={safeWord?.status === 'loading'}
                      onClick={() => onGenerateSafeWord(item.id, item.word)}
                    >
                      {safeWord?.status === 'loading'
                        ? 'Generating…'
                        : safeWord?.status === 'success'
                          ? 'Generate another · 1 credit'
                          : 'Generate safer wording · 1 credit'}
                    </button>
                    {safeWord?.status === 'success' ? (
                      <p className="safe-word-result" role="status">
                        <span>Suggested replacement</span>
                        <strong>{safeWord.replacement}</strong>
                      </p>
                    ) : null}
                    {safeWord?.status === 'error' ? (
                      <p className="safe-word-error" role="alert">
                        {safeWord.message}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="result-empty" data-testid="trademark-results-empty">
          <strong>No trademark risk terms were returned.</strong>
          <p>
            ERiC completed this workspace for the submitted text and selected markets. Review the
            source listing before making a final decision.
          </p>
        </div>
      )}
    </section>
  );
}

export function PolicyResults({ result }: { result: PolicyDetectionResult }) {
  const prohibited = result.items.filter((item) => item.status === 'prohibited').length;
  const restricted = result.items.filter((item) => item.status === 'restricted').length;
  const platformGroups = useMemo(
    () =>
      groupPolicyResultsByPlatform(result.items).sort((left, right) => {
        const leftAttention = left.counts.prohibited + left.counts.restricted;
        const rightAttention = right.counts.prohibited + right.counts.restricted;
        return rightAttention - leftAttention;
      }),
    [result.items],
  );
  const [activePlatformKey, setActivePlatformKey] = useState(platformGroups[0]?.key ?? '');
  const platformPanelId = useId();
  const activePlatform =
    platformGroups.find((group) => group.key === activePlatformKey) ?? platformGroups[0];
  const activePlatformIndex = Math.max(
    0,
    platformGroups.findIndex((group) => group.key === activePlatform?.key),
  );

  const renderPolicyItems = (
    items: typeof result.items,
    group: NonNullable<typeof activePlatform>,
  ) => (
    <ol className="policy-platform-policies">
      {items.map((item, itemIndex) => {
        const contentUrl = safeExternalUrl(item.contentUrl);
        const showItemSite = group.sites.length > 1 && item.site.trim();
        return (
          <li key={item.id}>
            <div className="evidence-title">
              <div>
                <small>{showItemSite || `Policy ${String(itemIndex + 1).padStart(2, '0')}`}</small>
                <h6>{item.title}</h6>
                {item.titleCn ? <span className="policy-title-cn">{item.titleCn}</span> : null}
              </div>
              <span
                className={`risk-chip ${
                  item.status === 'prohibited'
                    ? 'risk-high'
                    : item.status === 'restricted'
                      ? 'risk-review'
                      : 'risk-low'
                }`}
              >
                {item.status}
              </span>
            </div>
            {item.reason ? <p className="evidence-explanation">{item.reason}</p> : null}
            {contentUrl ? (
              <a className="policy-source-link" href={contentUrl} target="_blank" rel="noreferrer">
                Review source policy ↗
              </a>
            ) : null}
          </li>
        );
      })}
    </ol>
  );

  return (
    <section className="live-results" aria-labelledby="policy-results-title">
      <div className="live-results-heading">
        <div>
          <p className="prototype-label">Live P002 evidence</p>
          <h4 id="policy-results-title">Marketplace policy findings</h4>
        </div>
        <span>
          {result.items.length} policies · {platformGroups.length}{' '}
          {platformGroups.length === 1 ? 'platform' : 'platforms'}
        </span>
      </div>
      <dl className="result-summary-grid policy-summary-grid">
        <div>
          <dt>Overall risk</dt>
          <dd className={`policy-risk-value ${riskClass(result.risk)}`}>{result.risk}</dd>
        </div>
        <div className="summary-high">
          <dt>Prohibited</dt>
          <dd>{prohibited}</dd>
        </div>
        <div className="summary-medium">
          <dt>Restricted</dt>
          <dd>{restricted}</dd>
        </div>
        <div>
          <dt>Feature matches</dt>
          <dd>{result.riskFeatureCount}</dd>
        </div>
      </dl>
      {result.items.length ? (
        <div className="policy-platform-results" data-testid="policy-results">
          <div
            className="policy-platform-switcher"
            role="tablist"
            aria-label="Marketplace result groups"
          >
            {platformGroups.map((group, groupIndex) => {
              const attentionCount = group.counts.prohibited + group.counts.restricted;
              const active = group.key === activePlatform?.key;
              return (
                <button
                  className={`policy-platform-tab${active ? ' active' : ''}`}
                  key={group.key}
                  id={`${platformPanelId}-${groupIndex}-tab`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`${platformPanelId}-panel`}
                  onClick={() => setActivePlatformKey(group.key)}
                >
                  <span>
                    <strong>{group.label}</strong>
                    <small>{group.sites.join(' · ') || 'All sites'}</small>
                  </span>
                  <span>
                    <b>{group.items.length}</b> policies
                    <i className={attentionCount ? 'attention' : ''}>
                      {attentionCount ? `${attentionCount} review` : 'Clear'}
                    </i>
                  </span>
                </button>
              );
            })}
          </div>
          {activePlatform ? (
            <section
              className="policy-platform-group"
              id={`${platformPanelId}-panel`}
              role="tabpanel"
              aria-labelledby={`${platformPanelId}-${activePlatformIndex}-tab`}
            >
              <header className="policy-platform-heading">
                <div>
                  <p>Selected marketplace</p>
                  <h5>{activePlatform.label}</h5>
                  <div
                    className="policy-platform-sites"
                    aria-label={`${activePlatform.label} sites`}
                  >
                    {activePlatform.sites.length ? (
                      activePlatform.sites.map((site) => <span key={site}>{site}</span>)
                    ) : (
                      <span>Site not returned</span>
                    )}
                  </div>
                </div>
                <dl aria-label={`${activePlatform.label} policy counts`}>
                  <div>
                    <dt>Policies</dt>
                    <dd>{activePlatform.items.length}</dd>
                  </div>
                  <div className="summary-high">
                    <dt>Prohibited</dt>
                    <dd>{activePlatform.counts.prohibited}</dd>
                  </div>
                  <div className="summary-medium">
                    <dt>Restricted</dt>
                    <dd>{activePlatform.counts.restricted}</dd>
                  </div>
                  <div>
                    <dt>Clear</dt>
                    <dd>{activePlatform.counts.clear}</dd>
                  </div>
                </dl>
              </header>
              {activePlatform.counts.prohibited + activePlatform.counts.restricted > 0 ? (
                <div className="policy-attention-results">
                  <div className="policy-result-section-heading">
                    <strong>Needs attention</strong>
                    <span>
                      {activePlatform.counts.prohibited + activePlatform.counts.restricted} findings
                    </span>
                  </div>
                  {renderPolicyItems(
                    activePlatform.items.filter((item) => item.status !== 'clear'),
                    activePlatform,
                  )}
                </div>
              ) : (
                <div className="policy-platform-clear">
                  <strong>No findings require attention on {activePlatform.label}.</strong>
                  <p>Clear policy checks remain available below for audit review.</p>
                </div>
              )}
              {activePlatform.counts.clear ? (
                <details className="policy-clear-results">
                  <summary>
                    <span>Clear policy checks</span>
                    <strong>{activePlatform.counts.clear}</strong>
                  </summary>
                  {renderPolicyItems(
                    activePlatform.items.filter((item) => item.status === 'clear'),
                    activePlatform,
                  )}
                </details>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : (
        <div className="result-empty" data-testid="policy-results-empty">
          <strong>No policy risks were returned.</strong>
          <p>ERiC completed the selected marketplace-site review for this listing copy.</p>
        </div>
      )}
    </section>
  );
}

export function InventionResults({ result }: { result: InventionDetectionResult }) {
  return (
    <section className="live-results" aria-labelledby="invention-results-title">
      <div className="live-results-heading">
        <div>
          <p className="prototype-label">Live I001 evidence</p>
          <h4 id="invention-results-title">Similar utility patents</h4>
        </div>
        <span>{result.total} records found</span>
      </div>
      {result.items.length ? (
        <ol className="evidence-list invention-evidence" data-testid="invention-results">
          {result.items.map((item) => (
            <li key={item.id}>
              <div className="evidence-title">
                <div>
                  <small>
                    {item.publicationNumber || item.applicationNumber || 'Patent record'}
                  </small>
                  <h5>{item.title}</h5>
                </div>
                <span className="similarity-value">
                  {item.similarity === undefined ? '—' : `${Math.round(item.similarity)}%`}
                  <small>similarity</small>
                </span>
              </div>
              <dl className="evidence-metadata invention-metadata">
                <div>
                  <dt>Publication</dt>
                  <dd>{item.publicationNumber || 'Not returned'}</dd>
                </div>
                <div>
                  <dt>Application</dt>
                  <dd>{item.applicationNumber || 'Not returned'}</dd>
                </div>
                <div>
                  <dt>Region</dt>
                  <dd>{item.region || 'Not returned'}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{item.patentStatus || 'Not returned'}</dd>
                </div>
              </dl>
              {item.inventors.length ? (
                <p>
                  <strong>Inventors:</strong> {item.inventors.join(', ')}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <div className="result-empty" data-testid="invention-results-empty">
          <strong>No similar utility patents were returned.</strong>
          <p>
            ERiC completed the US search for this workspace. This result is screening evidence, not
            a legal clearance opinion.
          </p>
        </div>
      )}
    </section>
  );
}

function VisualEvidenceImage({ src, alt }: { src: string; alt: string }) {
  const safeUrl = safeExternalUrl(src);
  return safeUrl ? (
    <img src={safeUrl} alt={alt} loading="lazy" referrerPolicy="no-referrer" />
  ) : (
    <span className="visual-evidence-placeholder" aria-hidden="true">
      ⌁
    </span>
  );
}

export function DesignResults({ result }: { result: DesignDetectionResult }) {
  return (
    <section className="live-results" aria-labelledby="design-results-title">
      <div className="live-results-heading">
        <div>
          <p className="prototype-label">Live D001 evidence</p>
          <h4 id="design-results-title">Similar design patents</h4>
        </div>
        <span>{result.total} records found</span>
      </div>
      <dl className="visual-result-summary">
        <div>
          <dt>Overall risk</dt>
          <dd className={riskClass(result.risk)}>{result.risk}</dd>
        </div>
        <div>
          <dt>Returned</dt>
          <dd>{result.items.length}</dd>
        </div>
        <div>
          <dt>Highest similarity</dt>
          <dd>{Math.round(Math.max(0, ...result.items.map((item) => item.similarity ?? 0)))}%</dd>
        </div>
      </dl>
      {result.items.length ? (
        <ol className="visual-evidence-grid" data-testid="design-results">
          {result.items.map((item) => (
            <li key={item.id}>
              <VisualEvidenceImage src={item.imageUrl} alt="Similar design patent" />
              <article>
                <div className="visual-evidence-title">
                  <div>
                    <small>{item.publicationNumber || 'Patent record'}</small>
                    <h5>{item.title}</h5>
                  </div>
                  <span className={`risk-chip ${riskClass(item.risk)}`}>{item.risk}</span>
                </div>
                <dl>
                  <div>
                    <dt>Similarity</dt>
                    <dd>
                      {item.similarity === undefined ? '—' : `${Math.round(item.similarity)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt>Region</dt>
                    <dd>{item.region || '—'}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{item.status || '—'}</dd>
                  </div>
                  <div>
                    <dt>Rights holder</dt>
                    <dd>{item.holder || '—'}</dd>
                  </div>
                </dl>
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <div className="result-empty" data-testid="design-results-empty">
          <strong>No similar design patents were returned.</strong>
          <p>ERiC completed the selected-market image search for this workspace.</p>
        </div>
      )}
    </section>
  );
}

export function GraphicTrademarkResults({ result }: { result: GraphicTrademarkDetectionResult }) {
  return (
    <section className="live-results" aria-labelledby="graphic-results-title">
      <div className="live-results-heading">
        <div>
          <p className="prototype-label">Live L001 evidence</p>
          <h4 id="graphic-results-title">Similar graphic trademarks</h4>
        </div>
        <span>{result.total} records found</span>
      </div>
      <dl className="visual-result-summary">
        <div>
          <dt>Overall risk</dt>
          <dd className={riskClass(result.risk)}>{result.risk}</dd>
        </div>
        <div>
          <dt>Returned</dt>
          <dd>{result.items.length}</dd>
        </div>
        <div>
          <dt>Highest similarity</dt>
          <dd>{Math.round(Math.max(0, ...result.items.map((item) => item.similarity ?? 0)))}%</dd>
        </div>
      </dl>
      {result.items.length ? (
        <ol className="visual-evidence-grid" data-testid="graphic-trademark-results">
          {result.items.map((item) => (
            <li key={item.id}>
              <VisualEvidenceImage src={item.imageUrl} alt="Similar registered graphic trademark" />
              <article>
                <div className="visual-evidence-title">
                  <div>
                    <small>{item.registrationNumber || 'Trademark record'}</small>
                    <h5>{item.name}</h5>
                  </div>
                  <span className={`risk-chip ${riskClass(item.risk)}`}>{item.risk}</span>
                </div>
                <dl>
                  <div>
                    <dt>Similarity</dt>
                    <dd>
                      {item.similarity === undefined ? '—' : `${Math.round(item.similarity)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt>Region</dt>
                    <dd>{item.region || '—'}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{item.status || '—'}</dd>
                  </div>
                  <div>
                    <dt>Rights holder</dt>
                    <dd>{item.holder || '—'}</dd>
                  </div>
                </dl>
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <div className="result-empty" data-testid="graphic-trademark-results-empty">
          <strong>No similar graphic trademarks were returned.</strong>
          <p>ERiC completed the selected-market logo search for this workspace.</p>
        </div>
      )}
    </section>
  );
}

export function CopyrightResults({ result }: { result: CopyrightDetectionResult }) {
  return (
    <section className="live-results" aria-labelledby="copyright-results-title">
      <div className="live-results-heading">
        <div>
          <p className="prototype-label">Live C001 evidence</p>
          <h4 id="copyright-results-title">Similar copyright images</h4>
        </div>
        <span>{result.total} records found</span>
      </div>
      <dl className="visual-result-summary">
        <div>
          <dt>Overall risk</dt>
          <dd className={riskClass(result.risk)}>{result.risk}</dd>
        </div>
        <div>
          <dt>Returned</dt>
          <dd>{result.items.length}</dd>
        </div>
        <div>
          <dt>Highest similarity</dt>
          <dd>{Math.round(Math.max(0, ...result.items.map((item) => item.similarity ?? 0)))}%</dd>
        </div>
      </dl>
      {result.items.length ? (
        <ol className="visual-evidence-grid" data-testid="copyright-results">
          {result.items.map((item) => {
            const sourceUrl = safeExternalUrl(item.sourceUrl);
            return (
              <li key={item.id}>
                <VisualEvidenceImage src={item.imageUrl} alt="Similar copyright image" />
                <article>
                  <div className="visual-evidence-title">
                    <div>
                      <small>{item.id}</small>
                      <h5>{item.rightsOwner}</h5>
                    </div>
                    <span className={`risk-chip ${riskClass(item.risk)}`}>{item.risk}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Similarity</dt>
                      <dd>
                        {item.similarity === undefined ? '—' : `${Math.round(item.similarity)}%`}
                      </dd>
                    </div>
                    <div>
                      <dt>Source</dt>
                      <dd>{item.sourceName || 'Not returned'}</dd>
                    </div>
                  </dl>
                  {sourceUrl ? (
                    <a
                      className="policy-source-link"
                      href={sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Review source ↗
                    </a>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="result-empty" data-testid="copyright-results-empty">
          <strong>No similar copyright images were returned.</strong>
          <p>ERiC completed the visual copyright search for this workspace.</p>
        </div>
      )}
    </section>
  );
}

export function RestrictedProductResults({ result }: { result: RestrictedProductDetectionResult }) {
  return (
    <section className="live-results" aria-labelledby="restricted-results-title">
      <div className="live-results-heading">
        <div>
          <p className="prototype-label">Live P001 evidence</p>
          <h4 id="restricted-results-title">Restricted-product image matches</h4>
        </div>
        <span>{result.total} matches found</span>
      </div>
      {result.items.length ? (
        <ol className="visual-evidence-grid" data-testid="restricted-product-results">
          {result.items.map((item) => (
            <li key={item.id}>
              <VisualEvidenceImage src={item.imageUrl} alt="Similar restricted product" />
              <article>
                <div className="visual-evidence-title">
                  <div>
                    <small>Restricted-product reference</small>
                    <h5>{item.title}</h5>
                  </div>
                  <span
                    className={`risk-chip ${(item.similarity ?? 0) >= 40 ? 'risk-high' : 'risk-review'}`}
                  >
                    {item.similarity === undefined ? 'match' : `${Math.round(item.similarity)}%`}
                  </span>
                </div>
                {item.titleCn ? <p className="evidence-explanation">{item.titleCn}</p> : null}
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <div className="result-empty" data-testid="restricted-product-results-empty">
          <strong>No similar restricted products were returned.</strong>
          <p>An empty P001 result is a normal completed response.</p>
        </div>
      )}
    </section>
  );
}
