import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import copyrightIcon from '../../assets/icons/copyright.svg';
import designPatentIcon from '../../assets/icons/design-patent.svg';
import graphicTrademarkIcon from '../../assets/icons/graphic-trademark.svg';
import policyIcon from '../../assets/icons/policy.svg';
import reportIcon from '../../assets/icons/report.svg';
import textTrademarkIcon from '../../assets/icons/text-trademark.svg';
import utilityPatentIcon from '../../assets/icons/utility-patent.svg';
import {
  calculateDetectionCost,
  detectionDefinitions,
  getSampleReport,
  type DetectionCode,
  type DetectionSelection,
  type Market,
} from '../../domain/prototype';
import type { LiveActivity } from '../../domain/live-workspace';
import {
  EricDetectionError,
  getDetectionResult,
  isAsyncDetectionCode,
  isLiveDetectionCode,
  modeForDetection,
  runRestrictedProductDetection,
  submitDetection,
  supportedMarkets,
  uploadDetectionImage,
  waitForDetection,
  type AsyncDetectionCode,
  type LiveDetectionResult,
} from '../../services/detection';
import {
  getDetectionHistory,
  type DetectionHistoryItem,
  type DetectionHistoryPage,
  type DetectionHistoryStatus,
  type HistoryDetectionCode,
} from '../../services/history';
import { isConnectedShopifyAuth } from '../../services/auth';
import {
  getPolicyFeatureWords,
  getPolicySites,
  type PolicyFeatureWord,
  type PolicySite,
} from '../../services/policy';
import { getSafeWordSuggestions } from '../../services/safe-words';
import { useAppStore } from '../../store/app-store';
import {
  CopyrightResults,
  DesignResults,
  GraphicTrademarkResults,
  InventionResults,
  PolicyResults,
  RestrictedProductResults,
  TrademarkResults,
  type SafeWordState,
} from './DetectionResults';
import { PolicySettings } from './PolicySettings';

interface WorkspaceProps {
  onBuyCredits: () => void;
  onClosePolicySettings: () => void;
  onOpenPolicySettings: () => void;
  preferredCode?: DetectionCode;
  surface: 'workspace' | 'history' | 'policy-settings';
}

type ProgressMode = 'ready' | 'processing' | 'complete' | 'error';

interface HistoryFilters {
  code: 'ALL' | HistoryDetectionCode;
  status: 'ALL' | DetectionHistoryStatus;
  keyword: string;
  beginDate: string;
  endDate: string;
}

interface SelectedImage {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

interface HistoryQuery extends HistoryFilters {
  page: number;
}

const defaultSelection: DetectionSelection = {
  code: 'D001',
  radar: false,
  featureTerms: 0,
  safeWordCount: 1,
  markets: ['US'],
};

const defaultHistoryFilters: HistoryFilters = {
  code: 'ALL',
  status: 'ALL',
  keyword: '',
  beginDate: '',
  endDate: '',
};

const emptyHistoryPage: DetectionHistoryPage = {
  items: [],
  page: 1,
  pageSize: 20,
  lastPage: 1,
  total: 0,
  from: 0,
  to: 0,
  requestId: '',
};

const screeningCodes: DetectionCode[] = ['D001', 'I001', 'L001', 'T001', 'C001', 'P002'];
const supportingCodes: DetectionCode[] = ['T002', 'P001', 'P004-P007'];
const detectionIcons: Record<DetectionCode, string> = {
  D001: designPatentIcon,
  I001: utilityPatentIcon,
  L001: graphicTrademarkIcon,
  T001: textTrademarkIcon,
  T002: textTrademarkIcon,
  C001: copyrightIcon,
  P001: policyIcon,
  P002: policyIcon,
  'P004-P007': reportIcon,
};

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function readImageDimensions(previewUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('This image could not be read. Choose another file.'));
    image.src = previewUrl;
  });
}

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function historyStatusClass(status: DetectionHistoryStatus): string {
  if (status === 'COMPLETED') return 'risk-low';
  if (status === 'FAILED') return 'risk-high';
  return 'risk-review';
}

function formatHistoryDate(value: string): string {
  if (!value) return 'Not returned';
  const parsed = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

export function Workspace({
  onBuyCredits,
  onClosePolicySettings,
  onOpenPolicySettings,
  preferredCode,
  surface,
}: WorkspaceProps) {
  const balance = useAppStore((state) => state.balance);
  const jobs = useAppStore((state) => state.jobs);
  const report = useAppStore((state) => state.report);
  const user = useAppStore((state) => state.user);
  const sessionToken = useAppStore((state) => state.sessionToken);
  const sessionStatus = useAppStore((state) => state.sessionStatus);
  const sessionError = useAppStore((state) => state.sessionError);
  const welcomeCreditsGranted = useAppStore((state) => state.welcomeCreditsGranted);
  const welcomeCreditsExpireDays = useAppStore((state) => state.welcomeCreditsExpireDays);
  const refreshSession = useAppStore((state) => state.refreshSession);
  const resetSession = useAppStore((state) => state.resetSession);
  const queueJob = useAppStore((state) => state.queueJob);
  const completeJob = useAppStore((state) => state.completeJob);
  const storedLiveWorkspace = useAppStore((state) => state.liveWorkspace);
  const setStoredLiveWorkspace = useAppStore((state) => state.setLiveWorkspace);
  const liveMode =
    isConnectedShopifyAuth &&
    (user?.provider === 'shopify' ||
      user?.provider === 'shopify-guest' ||
      user?.provider === 'eric-password');
  const ericUserId = user?.id ?? '';
  const ericTenantId = user?.tenantId ?? 0;
  const ericAuth = useMemo(
    () =>
      sessionToken && ericUserId && ericTenantId
        ? { sessionToken, userId: ericUserId, tenantId: ericTenantId }
        : null,
    [ericTenantId, ericUserId, sessionToken],
  );
  const restoredActivity =
    liveMode && storedLiveWorkspace?.activity?.status === 'RUNNING'
      ? storedLiveWorkspace.activity
      : null;
  const initialCode =
    restoredActivity?.code ?? preferredCode ?? (liveMode ? 'T001' : defaultSelection.code);
  const [selection, setSelection] = useState<DetectionSelection>({
    ...defaultSelection,
    code: initialCode,
  });
  const [progress, setProgress] = useState(
    restoredActivity?.status === 'COMPLETED'
      ? `COMPLETED · Results ready for ERiC workspace ${restoredActivity.workspaceId}`
      : restoredActivity?.status === 'RUNNING'
        ? `RESTORING · ERiC workspace ${restoredActivity.workspaceId}`
        : restoredActivity?.status === 'FAILED'
          ? `FAILED · ERiC workspace ${restoredActivity.workspaceId}`
          : liveMode
            ? 'READY · Choose a live check and enter product details'
            : 'Ready for a prototype check',
  );
  const [progressMode, setProgressMode] = useState<ProgressMode>(
    restoredActivity?.status === 'COMPLETED'
      ? 'complete'
      : restoredActivity?.status === 'RUNNING'
        ? 'processing'
        : restoredActivity?.status === 'FAILED'
          ? 'error'
          : 'ready',
  );
  const [running, setRunning] = useState(false);
  const [resultPanelStarted, setResultPanelStarted] = useState(Boolean(restoredActivity));
  const [resultPanelOpen, setResultPanelOpen] = useState(Boolean(restoredActivity));
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [imageError, setImageError] = useState('');
  const [liveActivity, setLiveActivity] = useState<LiveActivity | null>(restoredActivity);
  const [liveResult, setLiveResult] = useState<LiveDetectionResult | null>(null);
  const [liveResultContext, setLiveResultContext] = useState<'workspace' | 'history' | null>(
    restoredActivity ? 'workspace' : null,
  );
  const [resultLoading, setResultLoading] = useState(false);
  const [resultError, setResultError] = useState('');
  const [safeWords, setSafeWords] = useState<Record<string, SafeWordState>>({});
  const [policySites, setPolicySites] = useState<PolicySite[]>([]);
  const [policyFeatureWords, setPolicyFeatureWords] = useState<PolicyFeatureWord[]>([]);
  const [policyConfigurationLoading, setPolicyConfigurationLoading] = useState(liveMode);
  const [policyConfigurationError, setPolicyConfigurationError] = useState('');
  const [policyRevision, setPolicyRevision] = useState(0);
  const [selectedPolicySites, setSelectedPolicySites] = useState<Record<string, string[]>>({});
  const [activePolicyPlatform, setActivePolicyPlatform] = useState('');
  const [selectedFeatureWordIds, setSelectedFeatureWordIds] = useState<number[]>([]);
  const [historyDraft, setHistoryDraft] = useState<HistoryFilters>(defaultHistoryFilters);
  const [historyQuery, setHistoryQuery] = useState<HistoryQuery>({
    ...defaultHistoryFilters,
    page: 1,
  });
  const [historyPage, setHistoryPage] = useState<DetectionHistoryPage>(emptyHistoryPage);
  const [historyLoading, setHistoryLoading] = useState(liveMode);
  const [historyError, setHistoryError] = useState('');
  const [historyRevision, setHistoryRevision] = useState(0);
  const [historyDetailOpen, setHistoryDetailOpen] = useState(false);
  const [historyPrototypeJobId, setHistoryPrototypeJobId] = useState('');
  const sequence = useRef(0);
  const reportRef = useRef<HTMLElement>(null);
  const historyReturnFocus = useRef<HTMLButtonElement | null>(null);
  const restoreHistoryRetryFocus = useRef(false);
  const restoreHistoryFocus = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const historyController = useRef<AbortController | null>(null);
  const policyController = useRef<AbortController | null>(null);
  const resultCollapseButton = useRef<HTMLButtonElement | null>(null);
  const resultReopenButton = useRef<HTMLButtonElement | null>(null);
  const recoveryStarted = useRef(!restoredActivity);

  useEffect(
    () => () => {
      if (selectedImage) URL.revokeObjectURL(selectedImage.previewUrl);
    },
    [selectedImage],
  );

  useEffect(
    () => () => {
      requestController.current?.abort();
      historyController.current?.abort();
      policyController.current?.abort();
    },
    [],
  );

  useEffect(() => {
    setSafeWords({});
  }, [liveActivity?.workspaceId]);

  useEffect(() => {
    if (historyDetailOpen || !restoreHistoryFocus.current) return;
    restoreHistoryFocus.current = false;
    historyReturnFocus.current?.focus();
  }, [historyDetailOpen]);

  useEffect(() => {
    if (surface === 'history') return;
    setHistoryDetailOpen(false);
    setHistoryPrototypeJobId('');
    if (liveResultContext === 'history') {
      requestController.current?.abort();
      requestController.current = null;
      setRunning(false);
      setResultPanelStarted(false);
      setResultPanelOpen(false);
      setLiveActivity(null);
      setLiveResult(null);
      setLiveResultContext(null);
      setResultError('');
      setResultLoading(false);
    }
  }, [liveResultContext, surface]);

  useEffect(() => {
    if (!liveMode || !ericAuth || surface !== 'workspace') return;
    const controller = new AbortController();
    policyController.current?.abort();
    policyController.current = controller;
    setPolicyConfigurationLoading(true);
    setPolicyConfigurationError('');

    void Promise.all([
      getPolicySites(ericAuth, controller.signal),
      getPolicyFeatureWords(1, 100, ericAuth, controller.signal),
    ])
      .then(([sites, featurePage]) => {
        if (policyController.current !== controller) return;
        setPolicySites(sites);
        setPolicyFeatureWords(featurePage.items);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (policyController.current !== controller) return;
        setPolicyConfigurationError(
          error instanceof Error ? error.message : 'ERiC could not load policy settings.',
        );
        if (error instanceof EricDetectionError && error.invalidSession) resetSession();
      })
      .finally(() => {
        if (policyController.current === controller) {
          policyController.current = null;
          setPolicyConfigurationLoading(false);
        }
      });

    return () => controller.abort();
  }, [ericAuth, liveMode, policyRevision, resetSession, surface]);

  useEffect(() => {
    const readyIds = new Set(
      policyFeatureWords.filter((item) => item.pullStatus === 'ready').map((item) => item.id),
    );
    setSelectedFeatureWordIds((current) => current.filter((id) => readyIds.has(id)));
  }, [policyFeatureWords]);

  useEffect(() => {
    setSelection((current) => ({ ...current, featureTerms: selectedFeatureWordIds.length }));
  }, [selectedFeatureWordIds]);

  useEffect(() => {
    if (!liveMode) return;
    if (liveResultContext !== 'workspace' || liveActivity?.status !== 'RUNNING') {
      setStoredLiveWorkspace(null);
      return;
    }
    setStoredLiveWorkspace({
      activity: liveActivity,
      result: null,
      savedAt: new Date().toISOString(),
    });
  }, [liveActivity, liveMode, liveResultContext, setStoredLiveWorkspace]);

  useEffect(() => {
    if (!liveMode || !sessionToken || !user || surface !== 'history') {
      return;
    }

    const controller = new AbortController();
    historyController.current?.abort();
    historyController.current = controller;
    setHistoryLoading(true);
    void getDetectionHistory(
      {
        page: historyQuery.page,
        pageSize: 20,
        code: historyQuery.code === 'ALL' ? undefined : historyQuery.code,
        status: historyQuery.status === 'ALL' ? undefined : historyQuery.status,
        keyword: historyQuery.keyword,
        beginDate: historyQuery.beginDate,
        endDate: historyQuery.endDate,
      },
      {
        sessionToken,
        userId: user.id,
        tenantId: user.tenantId,
      },
      controller.signal,
    )
      .then((page) => {
        if (historyController.current !== controller) return;
        setHistoryError('');
        setHistoryPage(page);
        if (restoreHistoryRetryFocus.current) {
          restoreHistoryRetryFocus.current = false;
          window.requestAnimationFrame(() =>
            document.getElementById('history-title')?.focus({ preventScroll: true }),
          );
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (historyController.current !== controller) return;
        setHistoryError(
          error instanceof Error ? error.message : 'ERiC could not load detection history.',
        );
        if (error instanceof EricDetectionError && error.invalidSession) resetSession();
      })
      .finally(() => {
        if (historyController.current === controller) {
          historyController.current = null;
          setHistoryLoading(false);
        }
      });

    return () => {
      controller.abort();
      if (historyController.current === controller) {
        historyController.current = null;
      }
    };
  }, [historyQuery, historyRevision, liveMode, resetSession, sessionToken, surface, user]);

  function refreshHistory() {
    setHistoryError('');
    setHistoryLoading(true);
    setHistoryRevision((current) => current + 1);
  }

  const detectionCodes = useMemo(
    () =>
      (Object.keys(detectionDefinitions) as DetectionCode[]).filter(
        (code) => !liveMode || (code !== 'T002' && code !== 'P004-P007'),
      ),
    [liveMode],
  );
  const definition = detectionDefinitions[selection.code];
  const radarAvailable = 'radarCost' in definition;
  const cost = useMemo(() => calculateDetectionCost(selection), [selection]);
  const liveCode = isLiveDetectionCode(selection.code) ? selection.code : null;
  const unavailableInLive = liveMode && !liveCode;
  const resultContextVisible =
    (surface === 'workspace' && liveResultContext === 'workspace') ||
    (surface === 'history' && historyDetailOpen && liveResultContext === 'history');
  const selectedLiveActivity =
    resultContextVisible && liveActivity?.code === selection.code ? liveActivity : null;
  const selectedLiveResult =
    selectedLiveActivity && liveResult?.workspaceId === selectedLiveActivity.workspaceId
      ? liveResult
      : null;
  const displayedProgress = progress;
  const displayedProgressMode = progressMode;
  const allowedMarkets = liveCode ? supportedMarkets(liveCode) : (['US', 'UK', 'EU'] as Market[]);
  const groupedPolicySites = useMemo(() => {
    const groups = new Map<string, string[]>();
    policySites.forEach(({ platform, site }) => {
      groups.set(platform, [...(groups.get(platform) ?? []), site]);
    });
    return [...groups.entries()];
  }, [policySites]);
  const activePolicySites =
    groupedPolicySites.find(([platform]) => platform === activePolicyPlatform) ??
    groupedPolicySites[0];
  const selectedPolicySiteCount = useMemo(
    () => Object.values(selectedPolicySites).reduce((total, sites) => total + sites.length, 0),
    [selectedPolicySites],
  );
  const readyPolicyFeatureWords = useMemo(
    () => policyFeatureWords.filter((item) => item.pullStatus === 'ready'),
    [policyFeatureWords],
  );

  function updateCode(code: DetectionCode) {
    if (code === selection.code) return;
    requestController.current?.abort();
    requestController.current = null;
    recoveryStarted.current = true;
    setRunning(false);
    setResultPanelStarted(false);
    setResultPanelOpen(false);
    setLiveActivity(null);
    setLiveResult(null);
    setLiveResultContext(null);
    setStoredLiveWorkspace(null);
    setResultError('');
    setResultLoading(false);
    const nextDefinition = detectionDefinitions[code];
    setSelection((current) => ({
      ...current,
      code,
      radar: 'radarCost' in nextDefinition ? current.radar : false,
      markets: code === 'I001' ? ['US'] : current.markets.length > 0 ? current.markets : ['US'],
    }));
    setProgressMode('ready');
    setProgress(
      liveMode && !isLiveDetectionCode(code)
        ? 'PENDING · This check is not connected to the live ERiC API yet'
        : liveMode
          ? 'READY · Enter product details to create one ERiC task'
          : 'Ready for a prototype check',
    );
  }

  function handleDetectionKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % detectionCodes.length;
    if (event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + detectionCodes.length) % detectionCodes.length;
    }
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = detectionCodes.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextCode = detectionCodes[nextIndex];
    if (!nextCode) return;
    updateCode(nextCode);
    window.requestAnimationFrame(() =>
      document.getElementById(`detection-tab-${nextCode}`)?.focus(),
    );
  }

  function updateMarket(market: Market, checked: boolean) {
    setSelection((current) => ({
      ...current,
      markets: checked
        ? Array.from(new Set([...current.markets, market]))
        : current.markets.filter((candidate) => candidate !== market),
    }));
  }

  async function selectProductImage(file: File | undefined) {
    setImageError('');
    if (!file) {
      setSelectedImage(null);
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setSelectedImage(null);
      setImageError('Choose a JPG or PNG image.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setSelectedImage(null);
      setImageError('The product image must be 4 MB or smaller.');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    try {
      const dimensions = await readImageDimensions(previewUrl);
      setSelectedImage({ file, previewUrl, ...dimensions });
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      setSelectedImage(null);
      setImageError(error instanceof Error ? error.message : 'This image could not be read.');
    }
  }

  function updatePolicySite(platform: string, site: string, checked: boolean) {
    setSelectedPolicySites((current) => {
      const currentSites = current[platform] ?? [];
      const nextSites = checked
        ? Array.from(new Set([...currentSites, site]))
        : currentSites.filter((candidate) => candidate !== site);
      const next = { ...current };
      if (nextSites.length) next[platform] = nextSites;
      else delete next[platform];
      return next;
    });
  }

  function updateFeatureWord(id: number, checked: boolean) {
    setSelectedFeatureWordIds((current) =>
      checked
        ? Array.from(new Set([...current, id]))
        : current.filter((candidate) => candidate !== id),
    );
  }

  const refreshAuthoritativeBalance = useCallback(
    async (previousBalance: number) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt > 0) await delay(attempt * 800);
        await refreshSession();
        if (useAppStore.getState().balance !== previousBalance) return;
      }
    },
    [refreshSession],
  );

  async function generateSafeWord(itemId: string, word: string) {
    if (!ericAuth || !liveActivity || liveActivity.code !== 'T001') return;
    setSafeWords((current) => ({ ...current, [itemId]: { status: 'loading' } }));
    const previousBalance = balance;
    try {
      const [suggestion] = await getSafeWordSuggestions(liveActivity.workspaceId, [word], ericAuth);
      if (!suggestion?.success || !suggestion.replacement) {
        throw new EricDetectionError(
          'ERiC could not find a suitable replacement. No point is charged for a failed suggestion.',
        );
      }
      setSafeWords((current) => ({
        ...current,
        [itemId]: { status: 'success', replacement: suggestion.replacement },
      }));
      await refreshAuthoritativeBalance(previousBalance);
    } catch (error) {
      setSafeWords((current) => ({
        ...current,
        [itemId]: {
          status: 'error',
          message:
            error instanceof Error ? error.message : 'ERiC could not generate safer wording.',
        },
      }));
      if (error instanceof EricDetectionError && error.invalidSession) resetSession();
      await refreshAuthoritativeBalance(previousBalance);
    }
  }

  const loadLiveResult = useCallback(
    async (activity: LiveActivity, signal?: AbortSignal) => {
      if (!sessionToken || !user) {
        setResultError('The ERiC session expired. Open a new session and load the result again.');
        resetSession();
        return;
      }
      if (!isAsyncDetectionCode(activity.code)) {
        setResultError('This direct P001 result cannot be reloaded from workspace history.');
        return;
      }
      setResultLoading(true);
      setResultError('');
      try {
        const result = await getDetectionResult(
          activity.code,
          activity.workspaceId,
          {
            sessionToken,
            userId: user.id,
            tenantId: user.tenantId,
          },
          signal,
        );
        setLiveResult(result);
        setProgress(`COMPLETED · Results ready for ERiC workspace ${activity.workspaceId}`);
        setProgressMode('complete');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        const message = error instanceof Error ? error.message : 'ERiC could not load the result.';
        setResultError(message);
        setProgress(
          `COMPLETED · Result needs to be loaded again for workspace ${activity.workspaceId}`,
        );
        setProgressMode('error');
        if (error instanceof EricDetectionError && error.invalidSession) resetSession();
      } finally {
        setResultLoading(false);
      }
    },
    [resetSession, sessionToken, user],
  );

  async function retryLiveResult() {
    if (!liveActivity || liveActivity.status !== 'COMPLETED' || resultLoading) return;
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    await loadLiveResult(liveActivity, controller.signal);
    if (requestController.current === controller) requestController.current = null;
  }

  const recoverLiveActivity = useCallback(
    async (activity: LiveActivity) => {
      if (!sessionToken || !user) return;
      if (!isAsyncDetectionCode(activity.code)) return;
      const controller = new AbortController();
      requestController.current?.abort();
      requestController.current = controller;
      setRunning(true);
      setProgress(
        activity.status === 'RUNNING'
          ? `RESTORING · Checking ERiC workspace ${activity.workspaceId}`
          : `RESTORING · Loading results for ERiC workspace ${activity.workspaceId}`,
      );
      setProgressMode('processing');

      try {
        let completedActivity = activity;
        if (activity.status === 'RUNNING') {
          const status = await waitForDetection(
            activity.workspaceId,
            modeForDetection(activity.code),
            {
              sessionToken,
              userId: user.id,
              tenantId: user.tenantId,
            },
            { signal: controller.signal },
          );
          completedActivity = {
            ...activity,
            requestId: status.requestId || activity.requestId,
            status: 'COMPLETED',
          };
          setLiveActivity(completedActivity);
        }
        await loadLiveResult(completedActivity, controller.signal);
        await refreshAuthoritativeBalance(balance);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        const message =
          error instanceof Error ? error.message : 'ERiC could not restore this workspace.';
        const remainsRunning = message.includes('still running');
        setProgress(`${remainsRunning ? 'RUNNING' : 'FAILED'} · ${message}`);
        setProgressMode(remainsRunning ? 'processing' : 'error');
        if (!remainsRunning) {
          setLiveActivity((current) => (current ? { ...current, status: 'FAILED' } : current));
        }
        if (error instanceof EricDetectionError && error.invalidSession) resetSession();
      } finally {
        if (requestController.current === controller) requestController.current = null;
        setRunning(false);
        refreshHistory();
      }
    },
    [balance, loadLiveResult, refreshAuthoritativeBalance, resetSession, sessionToken, user],
  );

  useEffect(() => {
    const needsRecovery =
      liveActivity?.status === 'RUNNING' ||
      (liveActivity?.status === 'COMPLETED' && !liveResult && !resultError);
    if (!liveMode || !liveActivity || !needsRecovery || recoveryStarted.current) return;
    recoveryStarted.current = true;
    void recoverLiveActivity(liveActivity);
  }, [liveActivity, liveMode, liveResult, recoverLiveActivity, resultError]);

  async function runLiveCheck(form: HTMLFormElement) {
    if (!liveCode) {
      setProgress('NOT AVAILABLE · Select a connected live check');
      setProgressMode('error');
      return;
    }
    if (!sessionToken || !user) {
      setProgress('SESSION EXPIRED · Open a new ERiC session');
      setProgressMode('error');
      resetSession();
      return;
    }

    setResultPanelStarted(true);
    setResultPanelOpen(true);

    const formData = new FormData(form);
    const controller = new AbortController();
    recoveryStarted.current = true;
    requestController.current?.abort();
    requestController.current = controller;
    setRunning(true);
    setLiveActivity(null);
    setLiveResult(null);
    setLiveResultContext('workspace');
    setResultError('');
    setResultLoading(false);
    setProgress('SUBMITTING · Creating one ERiC workspace task');
    setProgressMode('processing');

    try {
      let uploadedImage:
        | {
            url: string;
            width: number;
            height: number;
          }
        | undefined;
      if (definition.input === 'image') {
        if (!selectedImage) {
          throw new EricDetectionError(
            imageError || 'Choose one product image before running this check.',
          );
        }
        setProgress('UPLOADING · Sending one product image to ERiC');
        const imageUrl = await uploadDetectionImage(
          selectedImage.file,
          {
            sessionToken,
            userId: user.id,
            tenantId: user.tenantId,
          },
          controller.signal,
        );
        uploadedImage = {
          url: imageUrl,
          width: selectedImage.width,
          height: selectedImage.height,
        };
      }

      if (liveCode === 'P001') {
        if (!uploadedImage) throw new EricDetectionError('P001 requires one uploaded image.');
        setProgress('RUNNING · Searching restricted-product image evidence');
        const directResult = await runRestrictedProductDetection(
          uploadedImage.url,
          {
            sessionToken,
            userId: user.id,
            tenantId: user.tenantId,
          },
          controller.signal,
        );
        const completedActivity: LiveActivity = {
          workspaceId: directResult.workspaceId,
          requestId: directResult.requestId,
          code: 'P001',
          status: 'COMPLETED',
        };
        setLiveActivity(completedActivity);
        setLiveResult(directResult);
        setProgress('COMPLETED · P001 image search results ready');
        setProgressMode('complete');
        await refreshAuthoritativeBalance(balance);
        window.setTimeout(() => {
          reportRef.current?.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'auto'
              : 'smooth',
            block: 'center',
          });
        }, 0);
        return;
      }

      const asyncCode: AsyncDetectionCode = liveCode;
      const submission = await submitDetection(
        {
          code: asyncCode,
          title: formText(formData, 'productTitle'),
          description: formText(formData, 'productDescription'),
          sku: formText(formData, 'sku'),
          markets: selection.markets,
          image: uploadedImage,
          radar: selection.radar,
          platformSites: asyncCode === 'P002' ? selectedPolicySites : undefined,
          featureWordIds: asyncCode === 'P002' ? selectedFeatureWordIds : undefined,
        },
        {
          sessionToken,
          userId: user.id,
          tenantId: user.tenantId,
        },
        controller.signal,
      );
      const runningActivity: LiveActivity = {
        ...submission,
        code: asyncCode,
        status: 'RUNNING',
      };
      setLiveActivity(runningActivity);
      setProgress(`RUNNING · ERiC workspace ${submission.workspaceId}`);
      refreshHistory();

      const status = await waitForDetection(
        submission.workspaceId,
        modeForDetection(asyncCode),
        {
          sessionToken,
          userId: user.id,
          tenantId: user.tenantId,
        },
        { signal: controller.signal },
      );
      const completedActivity: LiveActivity = {
        ...runningActivity,
        requestId: status.requestId || runningActivity.requestId,
        status: 'COMPLETED',
      };
      setLiveActivity(completedActivity);
      setProgress(`COMPLETED · ERiC workspace ${submission.workspaceId}`);
      setProgressMode('complete');
      await loadLiveResult(completedActivity, controller.signal);
      window.setTimeout(() => {
        reportRef.current?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
          block: 'center',
        });
      }, 0);
      await refreshAuthoritativeBalance(balance);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const message =
        error instanceof Error ? error.message : 'ERiC could not complete the detection request.';
      setProgress(`FAILED · ${message}`);
      setProgressMode('error');
      setLiveActivity((current) => (current ? { ...current, status: 'FAILED' } : current));
      if (error instanceof EricDetectionError && error.invalidSession) resetSession();
    } finally {
      if (requestController.current === controller) requestController.current = null;
      setRunning(false);
      refreshHistory();
    }
  }

  function applyHistoryFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      historyDraft.beginDate &&
      historyDraft.endDate &&
      historyDraft.beginDate > historyDraft.endDate
    ) {
      setHistoryError('The start date must be before the end date.');
      return;
    }
    setHistoryError('');
    setHistoryLoading(true);
    setHistoryQuery({ ...historyDraft, page: 1 });
  }

  function clearHistoryFilters() {
    setHistoryDraft(defaultHistoryFilters);
    setHistoryError('');
    setHistoryLoading(true);
    setHistoryQuery({ ...defaultHistoryFilters, page: 1 });
  }

  async function openHistoryItem(item: DetectionHistoryItem) {
    if (running || resultLoading) return;
    setHistoryDetailOpen(true);
    const activity: LiveActivity = {
      workspaceId: item.workspaceId,
      requestId: '',
      code: item.code,
      status: item.status,
    };
    recoveryStarted.current = true;
    setLiveResultContext('history');
    setSelection((current) => ({
      ...current,
      code: item.code,
      radar: false,
      markets: item.code === 'I001' ? ['US'] : current.markets,
    }));
    setLiveActivity(activity);
    setLiveResult(null);
    setResultError('');

    if (item.status === 'FAILED') {
      setProgress(`FAILED · ERiC workspace ${item.workspaceId}`);
      setProgressMode('error');
    } else if (item.status === 'RUNNING') {
      await recoverLiveActivity(activity);
    } else {
      const controller = new AbortController();
      requestController.current?.abort();
      requestController.current = controller;
      setProgress(`LOADING · ERiC workspace ${item.workspaceId}`);
      setProgressMode('processing');
      await loadLiveResult(activity, controller.signal);
      if (requestController.current === controller) requestController.current = null;
    }

    window.setTimeout(() => {
      reportRef.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    }, 0);
  }

  function closeHistoryDetail() {
    restoreHistoryFocus.current = true;
    requestController.current?.abort();
    requestController.current = null;
    setRunning(false);
    setResultPanelStarted(false);
    setResultPanelOpen(false);
    setLiveActivity(null);
    setLiveResult(null);
    setLiveResultContext(null);
    setResultError('');
    setResultLoading(false);
    setHistoryPrototypeJobId('');
    setHistoryDetailOpen(false);
  }

  async function runPrototypeCheck() {
    sequence.current += 1;
    const job = queueJob(selection, `prototype-${sequence.current}`);
    if (!job) {
      setProgress('MORE CREDITS NEEDED · Choose a pack to continue');
      setProgressMode('error');
      onBuyCredits();
      return;
    }

    setResultPanelStarted(true);
    setResultPanelOpen(true);
    setRunning(true);
    setProgress('QUEUED · Prototype task created');
    setProgressMode('processing');
    await delay(300);
    setProgress('PROCESSING · Comparing sample evidence');
    await delay(550);
    completeJob(job.id);
    setProgress('SUCCEEDED · Sample report ready');
    setProgressMode('complete');
    setRunning(false);
    window.setTimeout(() => {
      reportRef.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center',
      });
    }, 0);
  }

  async function runCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    if (liveMode) await runLiveCheck(event.currentTarget);
    else await runPrototypeCheck();
  }

  function collapseResultPanel() {
    setResultPanelOpen(false);
    window.requestAnimationFrame(() => resultReopenButton.current?.focus());
  }

  function expandResultPanel() {
    setResultPanelOpen(true);
    window.requestAnimationFrame(() => resultCollapseButton.current?.focus());
  }

  function renderReportPanel() {
    if (liveMode && selectedLiveActivity) {
      return (
        <section
          className="report-panel live-task-panel"
          ref={reportRef}
          id="workspace-report"
          aria-labelledby="live-task-title"
        >
          <div className="report-result-head">
            <div>
              <p className="prototype-label">Live ERiC task</p>
              <h3 id="live-task-title">
                {selectedLiveActivity.status === 'COMPLETED'
                  ? 'Detection completed'
                  : selectedLiveActivity.status === 'FAILED'
                    ? 'Detection failed'
                    : 'Detection in progress'}
              </h3>
              <p>
                {selectedLiveActivity.code === 'P001'
                  ? 'The direct image search was submitted once.'
                  : 'The task was created once. Status polling never resubmits the detection.'}
              </p>
            </div>
            <span
              className={`risk-chip ${selectedLiveActivity.status === 'COMPLETED' ? 'risk-low' : 'risk-review'}`}
            >
              {selectedLiveActivity.status}
            </span>
          </div>
          <dl className="task-metadata">
            <div>
              <dt>{selectedLiveActivity.code === 'P001' ? 'Result ID' : 'Workspace ID'}</dt>
              <dd>
                {selectedLiveActivity.code === 'P001' && !selectedLiveActivity.requestId
                  ? 'Direct response'
                  : selectedLiveActivity.workspaceId}
              </dd>
            </div>
            <div>
              <dt>Check</dt>
              <dd>{selectedLiveActivity.code}</dd>
            </div>
            <div>
              <dt>Request ID</dt>
              <dd>{selectedLiveActivity.requestId || 'Not returned'}</dd>
            </div>
            <div>
              <dt>Points</dt>
              <dd>Server ledger</dd>
            </div>
          </dl>
          {resultLoading ? (
            <div className="result-loading" role="status">
              <span className="status-dot" />
              Loading live ERiC evidence…
            </div>
          ) : null}
          {resultError ? (
            <div className="result-error" role="alert">
              <div>
                <strong>The detection completed, but its evidence could not be loaded.</strong>
                <p>
                  {resultError} Workspace {selectedLiveActivity.workspaceId} remains available;
                  retrying does not run or charge the check again.
                </p>
              </div>
              <button
                className="button button-small"
                type="button"
                onClick={() => void retryLiveResult()}
                disabled={resultLoading}
              >
                Load result again
              </button>
            </div>
          ) : null}
          {selectedLiveResult?.kind === 'trademark' ? (
            <TrademarkResults
              result={selectedLiveResult}
              safeWords={safeWords}
              onGenerateSafeWord={(itemId, word) => void generateSafeWord(itemId, word)}
            />
          ) : null}
          {selectedLiveResult?.kind === 'invention' ? (
            <InventionResults result={selectedLiveResult} />
          ) : null}
          {selectedLiveResult?.kind === 'policy' ? (
            <PolicyResults result={selectedLiveResult} />
          ) : null}
          {selectedLiveResult?.kind === 'design' ? (
            <DesignResults result={selectedLiveResult} />
          ) : null}
          {selectedLiveResult?.kind === 'graphic-trademark' ? (
            <GraphicTrademarkResults result={selectedLiveResult} />
          ) : null}
          {selectedLiveResult?.kind === 'copyright' ? (
            <CopyrightResults result={selectedLiveResult} />
          ) : null}
          {selectedLiveResult?.kind === 'restricted-product' ? (
            <RestrictedProductResults result={selectedLiveResult} />
          ) : null}
          <p className="result-disclaimer">
            The available-credit balance is refreshed from ERiC after completion. Results support
            screening and are not legal advice.
          </p>
        </section>
      );
    }

    const prototypeReport = historyPrototypeJobId
      ? (() => {
          const job = jobs.find((candidate) => candidate.id === historyPrototypeJobId);
          return job ? getSampleReport(job) : report;
        })()
      : report;
    if (!prototypeReport) return null;
    return (
      <section
        className="report-panel"
        ref={reportRef}
        id="workspace-report"
        aria-labelledby="report-result-title"
      >
        <div className="report-result-head">
          <div>
            <p className="prototype-label">Sample data · Prototype report</p>
            <h3 id="report-result-title">{prototypeReport.status}</h3>
            <p>{prototypeReport.summary}</p>
          </div>
          <span className="risk-chip risk-review">Review</span>
        </div>
        <p>
          <strong>{prototypeReport.subject}</strong> · {prototypeReport.markets.join(' / ')} ·{' '}
          {prototypeReport.creditsUsed} credits used · {prototypeReport.taskId}
        </p>
        <ul>
          {prototypeReport.matches.map((match) => (
            <li key={match.publicationNumber}>
              <span>{match.publicationNumber}</span>
              <b>{Math.round(match.similarity * 100)}%</b>
              <span>{match.risk}</span>
            </li>
          ))}
        </ul>
        <p>
          Review the closest evidence with qualified counsel before listing. This is not legal
          advice.
        </p>
      </section>
    );
  }

  function renderDetectionTab(code: DetectionCode) {
    const item = detectionDefinitions[code];
    const available = !liveMode || isLiveDetectionCode(code);
    const index = detectionCodes.indexOf(code);
    return (
      <button
        className={`detection-tab${selection.code === code ? ' active' : ''}`}
        id={`detection-tab-${code}`}
        key={code}
        type="button"
        role="tab"
        aria-selected={selection.code === code}
        aria-controls="detection-form"
        tabIndex={selection.code === code ? 0 : -1}
        onClick={() => updateCode(code)}
        onKeyDown={(event) => handleDetectionKeyDown(event, index)}
      >
        <img src={detectionIcons[code]} alt="" />
        <span>
          <strong>{item.label.replace(' check', '')}</strong>
          <small>
            {code} ·{' '}
            {available
              ? `${item.baseCost} base credit${item.baseCost === 1 ? '' : 's'}`
              : 'Integration pending'}
          </small>
        </span>
        <i className={available ? 'available' : ''} aria-hidden="true" />
      </button>
    );
  }

  return (
    <section className="workspace section" id="workspace" aria-labelledby="workspace-title">
      <div className="workspace-topbar">
        <div>
          <p className="eyebrow">
            {surface === 'policy-settings'
              ? 'User configuration'
              : surface === 'history'
                ? 'Server evidence archive'
                : liveMode
                  ? 'Live ERiC screening'
                  : 'Interactive demo'}
          </p>
          <h2 id="workspace-title">
            {surface === 'policy-settings'
              ? 'Policy settings'
              : surface === 'history'
                ? 'Detection history'
                : 'Compliance workspace'}
          </h2>
          {surface === 'policy-settings' ? (
            <p className="settings-scope-copy">
              Manage the signed-in user’s private policy library across P002 checks.
            </p>
          ) : null}
          {liveMode ? (
            <p className="workspace-identity">
              <span className="shopify-status-dot" />
              <strong>{user.displayName}</strong>
              <span>
                ·{' '}
                {user.provider === 'shopify'
                  ? 'Shopify authorized'
                  : user.provider === 'shopify-guest'
                    ? 'Private guest demo'
                    : 'standalone demo sign-in'}
              </span>
              {user.shopDomain ? <small>{user.shopDomain}</small> : null}
            </p>
          ) : null}
        </div>
        <div className="balance-card">
          <span>Available credits</span>
          <strong data-testid="balance-value">{balance.toLocaleString()}</strong>
          <button className="button button-small" type="button" onClick={onBuyCredits}>
            {user?.provider === 'shopify-guest' ? 'Refill demo' : 'Buy credits'}
          </button>
        </div>
      </div>

      {sessionStatus === 'refreshing' ? (
        <p className="session-sync" role="status">
          Syncing the latest ERiC balance and permissions…
        </p>
      ) : null}
      {sessionStatus === 'error' ? (
        <p className="session-sync error" role="alert">
          {sessionError}
        </p>
      ) : null}

      {surface === 'workspace' && welcomeCreditsGranted > 0 ? (
        <div className="welcome-credit-note" role="status">
          <span>＋{welcomeCreditsGranted}</span>
          <div>
            <strong>
              {user?.provider === 'shopify-guest'
                ? 'Guest demo credits ready'
                : 'Shopify new-user credits added'}
            </strong>
            <p>
              {user?.provider === 'shopify-guest'
                ? `This private workspace and its ${welcomeCreditsGranted} live credits are available for ${welcomeCreditsExpireDays || 7} days.`
                : `Your one-time welcome credits are valid for ${welcomeCreditsExpireDays || 7} days. The displayed balance comes from ERiC.`}
            </p>
          </div>
        </div>
      ) : null}

      {surface === 'policy-settings' ? (
        <div className="account-settings-shell">
          <aside className="account-settings-context" aria-label="Policy settings scope">
            <button className="history-back" type="button" onClick={onClosePolicySettings}>
              ← Back to workspace
            </button>
            <p className="eyebrow">Account scope</p>
            <h3>User-level configuration</h3>
            <p>
              These terms belong to the current ERiC user, not to a single detection task or
              workspace tab.
            </p>
            <dl>
              <div>
                <dt>Applied to</dt>
                <dd>{user?.displayName ?? 'Signed-in user'}</dd>
              </div>
              <div>
                <dt>Detection</dt>
                <dd>P002 · Marketplace policy</dd>
              </div>
              <div>
                <dt>Usage</dt>
                <dd>2 credits per selected ready term</dd>
              </div>
            </dl>
          </aside>
          <div className="account-settings-panel">
            <div className="account-settings-heading">
              <span>P002</span>
              <div>
                <h3>Private policy feature library</h3>
                <p>
                  Generate, save, and maintain reusable terms. Ready terms become available when you
                  configure any P002 check.
                </p>
              </div>
            </div>
            {liveMode && ericAuth ? (
              <PolicySettings
                auth={ericAuth}
                onInvalidSession={resetSession}
                onLibraryChanged={() => setPolicyRevision((current) => current + 1)}
                showHeading={false}
              />
            ) : (
              <div className="history-error" role="alert">
                Policy settings require an active ERiC session.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className={`workspace-shell workspace-shell-${surface}`}>
          <div className="workspace-main">
            {surface === 'workspace' ? (
              <div className="workspace-execution">
                <nav className="detection-rail" aria-label="Detection APIs">
                  <div className="detection-rail-heading">
                    <span>ERiC API desk</span>
                    <strong>Choose a screening API</strong>
                  </div>
                  <div role="tablist" aria-label="Detection APIs" aria-orientation="vertical">
                    <span className="detection-group-label">Screening APIs</span>
                    {screeningCodes
                      .filter((code) => detectionCodes.includes(code))
                      .map(renderDetectionTab)}
                    <span className="detection-group-label detection-tools-label">
                      Supporting tools
                    </span>
                    {supportingCodes
                      .filter((code) => detectionCodes.includes(code))
                      .map(renderDetectionTab)}
                  </div>
                </nav>
                <div
                  className={`check-workbench ${
                    !resultPanelStarted
                      ? 'result-not-started'
                      : resultPanelOpen
                        ? 'result-open'
                        : 'result-collapsed'
                  }`}
                >
                  <div className="check-input-column">
                    <form id="detection-form" onSubmit={(event) => void runCheck(event)}>
                      <div className="form-heading">
                        <span>{selection.code}</span>
                        <div>
                          <h3>{definition.label}</h3>
                          <p>
                            {liveMode
                              ? 'Configure one live ERiC task. The result and evidence remain visible alongside the inputs.'
                              : 'All fields remain in this browser session.'}
                          </p>
                        </div>
                      </div>

                      {unavailableInLive ? (
                        <div className="integration-note" role="note">
                          <strong>
                            {selection.code} is visible for roadmap clarity, but is not live yet.
                          </strong>
                          <p>
                            Select T001, I001, or P002. This page will not create a mock report or
                            change points for an unconnected check.
                          </p>
                        </div>
                      ) : null}

                      {definition.input === 'image' ? (
                        <div className="input-panel image-check-inputs">
                          <label
                            className={`upload-zone${selectedImage ? ' has-image' : ''}`}
                            htmlFor="product-image"
                          >
                            {selectedImage ? (
                              <img src={selectedImage.previewUrl} alt="Selected product preview" />
                            ) : (
                              <span>↑</span>
                            )}
                            <strong>{selectedImage?.file.name || 'Add a product image'}</strong>
                            <small>
                              {selectedImage
                                ? `${selectedImage.width} × ${selectedImage.height} · ${(selectedImage.file.size / 1024 / 1024).toFixed(2)} MB · Choose to replace`
                                : 'JPG or PNG · One image · 4 MB maximum'}
                            </small>
                          </label>
                          <input
                            className="visually-hidden"
                            id="product-image"
                            type="file"
                            accept="image/jpeg,image/png"
                            disabled={running || unavailableInLive}
                            onChange={(event) =>
                              void selectProductImage(event.currentTarget.files?.[0])
                            }
                          />
                          {imageError ? (
                            <p className="image-input-error" role="alert">
                              {imageError}
                            </p>
                          ) : null}
                          {selection.code === 'D001' || selection.code === 'L001' ? (
                            <div className="image-metadata-inputs">
                              <label className="field" htmlFor="image-product-title">
                                <span>
                                  Product title <small>Optional</small>
                                </span>
                                <input
                                  id="image-product-title"
                                  name="productTitle"
                                  maxLength={selection.code === 'L001' ? 200 : 300}
                                  placeholder="e.g. Adjustable arc desk lamp"
                                />
                              </label>
                              {selection.code === 'L001' ? (
                                <label className="field" htmlFor="image-logo-name">
                                  <span>
                                    Possible logo name <small>Optional</small>
                                  </span>
                                  <input
                                    id="image-logo-name"
                                    name="productDescription"
                                    maxLength={50}
                                    placeholder="Text visible in the logo"
                                  />
                                </label>
                              ) : null}
                              <label className="field" htmlFor="image-product-sku">
                                <span>
                                  SKU <small>Optional</small>
                                </span>
                                <input
                                  id="image-product-sku"
                                  name="sku"
                                  maxLength={100}
                                  placeholder="SKU-001"
                                />
                              </label>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {definition.input === 'text' ? (
                        <div className="input-panel product-copy-inputs">
                          <label className="field" htmlFor="product-title">
                            <span>Product title</span>
                            <input
                              id="product-title"
                              name="productTitle"
                              maxLength={liveCode === 'I001' ? 500 : 300}
                              required={liveMode && Boolean(liveCode)}
                              placeholder="e.g. Adjustable arc desk lamp"
                            />
                          </label>
                          <label className="field" htmlFor="product-description">
                            <span>Product description</span>
                            <textarea
                              id="product-description"
                              name="productDescription"
                              rows={4}
                              maxLength={liveCode === 'I001' ? 30000 : 5000}
                              placeholder="Materials, function, claims, and other listing details"
                            />
                          </label>
                          <label className="field" htmlFor="product-sku">
                            <span>
                              SKU <small>Optional</small>
                            </span>
                            <input
                              id="product-sku"
                              name="sku"
                              maxLength={100}
                              placeholder="SKU-001"
                            />
                          </label>
                        </div>
                      ) : null}
                      {definition.input === 'term' ? (
                        <div className="input-panel term-inputs">
                          <label className="field" htmlFor="risk-term">
                            <span>Term to review</span>
                            <input
                              id="risk-term"
                              name="riskTerm"
                              placeholder="e.g. medical-grade"
                              disabled={unavailableInLive}
                            />
                          </label>
                          <label className="field" htmlFor="safe-word-count">
                            <span>Suggested alternatives</span>
                            <input
                              id="safe-word-count"
                              name="safeWordCount"
                              type="number"
                              min="1"
                              max="10"
                              disabled={unavailableInLive}
                              value={selection.safeWordCount}
                              onChange={(event) =>
                                setSelection((current) => ({
                                  ...current,
                                  safeWordCount: Number(event.target.value),
                                }))
                              }
                            />
                          </label>
                        </div>
                      ) : null}
                      {definition.input === 'term-library' ? (
                        <div className="input-panel">
                          <label className="field" htmlFor="term-library">
                            <span>Private risk terms</span>
                            <textarea
                              id="term-library"
                              name="termLibrary"
                              rows={4}
                              placeholder="Enter one term per line"
                              disabled={unavailableInLive}
                            />
                          </label>
                        </div>
                      ) : null}

                      {liveCode === 'P002' ? (
                        <div className="policy-configuration">
                          <fieldset className="policy-sites-fieldset">
                            <legend>
                              Marketplace sites <small>{selectedPolicySiteCount} selected</small>
                            </legend>
                            {policyConfigurationLoading ? (
                              <small className="market-note">Loading supported sites…</small>
                            ) : groupedPolicySites.length ? (
                              <>
                                <div
                                  className="policy-site-tabs"
                                  role="tablist"
                                  aria-label="Marketplace platforms"
                                >
                                  {groupedPolicySites.map(([platform, sites], index) => {
                                    const selectedCount = (selectedPolicySites[platform] ?? [])
                                      .length;
                                    const active = platform === activePolicySites?.[0];
                                    return (
                                      <button
                                        className={`policy-site-tab${active ? ' active' : ''}`}
                                        id={`policy-site-tab-${index}`}
                                        key={platform}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        aria-controls="policy-site-panel"
                                        onClick={() => setActivePolicyPlatform(platform)}
                                      >
                                        <span>{platform}</span>
                                        <small>
                                          {selectedCount
                                            ? `${selectedCount} selected`
                                            : `${sites.length} sites`}
                                        </small>
                                      </button>
                                    );
                                  })}
                                </div>
                                {activePolicySites ? (
                                  <div
                                    className="policy-site-panel"
                                    id="policy-site-panel"
                                    role="tabpanel"
                                    aria-labelledby={`policy-site-tab-${groupedPolicySites.findIndex(
                                      ([platform]) => platform === activePolicySites[0],
                                    )}`}
                                  >
                                    <div>
                                      <strong>{activePolicySites[0]}</strong>
                                      <small>
                                        Choose every storefront this task should review.
                                      </small>
                                    </div>
                                    <div className="policy-site-options">
                                      {activePolicySites[1].map((site) => (
                                        <label
                                          className="check-pill"
                                          key={`${activePolicySites[0]}-${site}`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={(
                                              selectedPolicySites[activePolicySites[0]] ?? []
                                            ).includes(site)}
                                            onChange={(event) =>
                                              updatePolicySite(
                                                activePolicySites[0],
                                                site,
                                                event.target.checked,
                                              )
                                            }
                                          />
                                          <span>{site}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                                <div className="policy-site-selection-note">
                                  <span>
                                    {selectedPolicySiteCount
                                      ? `${selectedPolicySiteCount} marketplace site${selectedPolicySiteCount === 1 ? '' : 's'} selected across all platforms.`
                                      : 'No sites selected. ERiC will use the service default scope.'}
                                  </span>
                                  {selectedPolicySiteCount ? (
                                    <button
                                      className="text-button"
                                      type="button"
                                      onClick={() => setSelectedPolicySites({})}
                                    >
                                      Clear all
                                    </button>
                                  ) : null}
                                </div>
                              </>
                            ) : (
                              <small className="market-note">
                                No marketplace sites were returned.
                              </small>
                            )}
                          </fieldset>
                          <details className="policy-advanced-options">
                            <summary>
                              <span>
                                <strong>Private feature terms</strong>
                                <small>Optional · 2 credits each</small>
                              </span>
                              <span>{selectedFeatureWordIds.length} selected</span>
                            </summary>
                            <fieldset className="policy-feature-fieldset">
                              <legend className="visually-hidden">Private feature terms</legend>
                              {readyPolicyFeatureWords.length ? (
                                readyPolicyFeatureWords.map((item) => (
                                  <label className="check-pill" key={item.id}>
                                    <input
                                      type="checkbox"
                                      checked={selectedFeatureWordIds.includes(item.id)}
                                      onChange={(event) =>
                                        updateFeatureWord(item.id, event.target.checked)
                                      }
                                    />
                                    <span>{item.word}</span>
                                  </label>
                                ))
                              ) : (
                                <div className="market-note policy-empty-note">
                                  <span>No ready private terms.</span>
                                  <button
                                    className="text-button"
                                    type="button"
                                    onClick={onOpenPolicySettings}
                                  >
                                    Open policy settings
                                  </button>
                                </div>
                              )}
                            </fieldset>
                          </details>
                          {policyConfigurationError ? (
                            <div className="history-error" role="alert">
                              <span>{policyConfigurationError}</span>
                              <button
                                className="text-button"
                                type="button"
                                onClick={() => setPolicyRevision((current) => current + 1)}
                              >
                                Try again
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : allowedMarkets.length ? (
                        <fieldset>
                          <legend>Markets</legend>
                          {(['US', 'UK', 'EU'] as const).map((market) => {
                            const disabled = liveMode && !allowedMarkets.includes(market);
                            return (
                              <label
                                className={`check-pill${disabled ? ' check-pill-disabled' : ''}`}
                                key={market}
                              >
                                <input
                                  type="checkbox"
                                  name="markets"
                                  value={market}
                                  disabled={disabled || unavailableInLive}
                                  checked={selection.markets.includes(market) && !disabled}
                                  onChange={(event) => updateMarket(market, event.target.checked)}
                                />
                                <span>
                                  {market === 'US'
                                    ? 'United States'
                                    : market === 'UK'
                                      ? 'United Kingdom'
                                      : 'European Union'}
                                </span>
                              </label>
                            );
                          })}
                          {liveCode === 'I001' ? (
                            <small className="market-note">
                              I001 currently supports US records only.
                            </small>
                          ) : null}
                        </fieldset>
                      ) : null}
                      {!liveMode || (liveMode && radarAvailable) ? (
                        <div
                          className={`form-options${
                            'variable' in definition && definition.variable === 'featureTerms'
                              ? ' form-options-variable'
                              : ''
                          }`}
                        >
                          <label className={`toggle${radarAvailable ? '' : ' toggle-disabled'}`}>
                            <input
                              type="checkbox"
                              name="radar"
                              checked={selection.radar}
                              disabled={!radarAvailable}
                              onChange={(event) =>
                                setSelection((current) => ({
                                  ...current,
                                  radar: event.target.checked,
                                }))
                              }
                            />
                            <span />
                            <div>
                              <strong>Enable Radar</strong>
                              <small>
                                {radarAvailable
                                  ? `Expanded risk analysis · ${'radarCost' in definition ? definition.radarCost : cost} credits total`
                                  : 'Wider visual comparison where available'}
                              </small>
                            </div>
                          </label>
                          {'variable' in definition && definition.variable === 'featureTerms' ? (
                            <label className="field compact" htmlFor="feature-terms">
                              <span>Feature terms</span>
                              <input
                                id="feature-terms"
                                name="featureTerms"
                                type="number"
                                min="0"
                                max="20"
                                value={selection.featureTerms}
                                onChange={(event) =>
                                  setSelection((current) => ({
                                    ...current,
                                    featureTerms: Number(event.target.value),
                                  }))
                                }
                              />
                            </label>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="cost-bar">
                        <div>
                          <span>{liveMode ? 'Estimated server cost' : 'Estimated cost'}</span>
                          <strong>
                            <b data-testid="cost-value">{cost}</b> credits
                          </strong>
                        </div>
                        <button
                          className="button button-primary"
                          type="submit"
                          disabled={running || unavailableInLive}
                        >
                          {running
                            ? liveMode
                              ? 'Running ERiC check…'
                              : 'Running prototype check…'
                            : liveMode
                              ? 'Run live check →'
                              : 'Run prototype check →'}
                        </button>
                      </div>
                    </form>
                  </div>
                  {resultPanelStarted ? (
                    resultPanelOpen ? (
                      <aside
                        className="check-result-column"
                        id="evidence-desk"
                        aria-labelledby="evidence-desk-title"
                      >
                        <div className="result-column-heading">
                          <div>
                            <span>Evidence desk</span>
                            <h3 id="evidence-desk-title">Live result</h3>
                          </div>
                          <div className="result-column-actions">
                            <small>
                              {selectedLiveActivity
                                ? selectedLiveActivity.code === 'P001'
                                  ? 'P001 · Direct result'
                                  : `Workspace ${selectedLiveActivity.workspaceId}`
                                : `${selection.code} · Creating task`}
                            </small>
                            <button
                              className="result-panel-toggle"
                              ref={resultCollapseButton}
                              type="button"
                              aria-label="Collapse live result"
                              aria-controls="evidence-desk"
                              aria-expanded="true"
                              title="Collapse live result"
                              onClick={collapseResultPanel}
                            >
                              →
                            </button>
                          </div>
                        </div>
                        <div
                          className={`job-progress ${displayedProgressMode}`}
                          role="status"
                          aria-live="polite"
                        >
                          <span className="status-dot" />
                          {displayedProgress}
                        </div>
                        {renderReportPanel() ?? (
                          <section
                            className="result-awaiting result-starting"
                            aria-label="Task status"
                          >
                            <span aria-hidden="true">⌁</span>
                            <div>
                              <strong>
                                {displayedProgressMode === 'error'
                                  ? 'ERiC could not create this task.'
                                  : `Creating the ${selection.code} task…`}
                              </strong>
                              <p>
                                {displayedProgressMode === 'error'
                                  ? 'Review the status above, adjust the inputs if needed, and run the check again.'
                                  : 'The request is submitted once. This desk will update with task status and evidence.'}
                              </p>
                            </div>
                          </section>
                        )}
                      </aside>
                    ) : (
                      <aside
                        className={`result-reopen-column ${displayedProgressMode}`}
                        id="evidence-desk-collapsed"
                        aria-label="Live result collapsed"
                      >
                        <button
                          className="result-reopen-button"
                          ref={resultReopenButton}
                          type="button"
                          aria-label="Expand live result"
                          aria-controls="evidence-desk"
                          aria-expanded="false"
                          title="Expand live result"
                          onClick={expandResultPanel}
                        >
                          <b aria-hidden="true">←</b>
                          <span className="status-dot" aria-hidden="true" />
                          <span>Result</span>
                        </button>
                      </aside>
                    )
                  ) : null}
                </div>
              </div>
            ) : (
              <section className="history history-page" aria-labelledby="history-title">
                {historyDetailOpen ? (
                  <div className="history-detail-view">
                    <div className="history-detail-toolbar">
                      <button className="history-back" type="button" onClick={closeHistoryDetail}>
                        ← Back to detection history
                      </button>
                      <p>
                        <span>Viewing workspace</span>
                        <strong>{liveActivity?.workspaceId ?? historyPrototypeJobId ?? '—'}</strong>
                      </p>
                    </div>
                    {renderReportPanel()}
                  </div>
                ) : null}
                <div hidden={historyDetailOpen}>
                  <div className="form-heading">
                    <span>LOG</span>
                    <div>
                      <h3 id="history-title" tabIndex={-1}>
                        All detection records
                      </h3>
                      <p>
                        {liveMode
                          ? 'Server records for this signed-in ERiC workspace.'
                          : 'Prototype tasks from this browser session.'}
                      </p>
                    </div>
                  </div>
                  {liveMode ? (
                    <form className="history-filters" onSubmit={applyHistoryFilters}>
                      <label className="field history-search" htmlFor="history-keyword">
                        <span>Search</span>
                        <input
                          id="history-keyword"
                          type="search"
                          value={historyDraft.keyword}
                          placeholder="Title, description, or SKU"
                          onChange={(event) =>
                            setHistoryDraft((current) => ({
                              ...current,
                              keyword: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field" htmlFor="history-check">
                        <span>Check</span>
                        <select
                          id="history-check"
                          value={historyDraft.code}
                          onChange={(event) =>
                            setHistoryDraft((current) => ({
                              ...current,
                              code: event.target.value as HistoryFilters['code'],
                            }))
                          }
                        >
                          <option value="ALL">All live checks</option>
                          <option value="D001">D001 · Design patent</option>
                          <option value="T001">T001 · Text trademark</option>
                          <option value="I001">I001 · Utility patent</option>
                          <option value="L001">L001 · Graphic trademark</option>
                          <option value="C001">C001 · Copyright image</option>
                          <option value="P002">P002 · Marketplace policy</option>
                        </select>
                      </label>
                      <label className="field" htmlFor="history-status">
                        <span>Status</span>
                        <select
                          id="history-status"
                          value={historyDraft.status}
                          onChange={(event) =>
                            setHistoryDraft((current) => ({
                              ...current,
                              status: event.target.value as HistoryFilters['status'],
                            }))
                          }
                        >
                          <option value="ALL">All statuses</option>
                          <option value="RUNNING">Running</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="FAILED">Failed</option>
                        </select>
                      </label>
                      <label className="field" htmlFor="history-from">
                        <span>From</span>
                        <input
                          id="history-from"
                          type="date"
                          value={historyDraft.beginDate}
                          max={historyDraft.endDate || undefined}
                          onChange={(event) =>
                            setHistoryDraft((current) => ({
                              ...current,
                              beginDate: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field" htmlFor="history-to">
                        <span>To</span>
                        <input
                          id="history-to"
                          type="date"
                          value={historyDraft.endDate}
                          min={historyDraft.beginDate || undefined}
                          onChange={(event) =>
                            setHistoryDraft((current) => ({
                              ...current,
                              endDate: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="history-filter-actions">
                        <button
                          className="button button-small"
                          type="submit"
                          disabled={historyLoading}
                        >
                          Apply
                        </button>
                        <button className="text-button" type="button" onClick={clearHistoryFilters}>
                          Clear
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {liveMode ? (
                    <div className="history-summary" aria-live="polite">
                      <p>
                        {historyLoading
                          ? 'Syncing ERiC history…'
                          : historyPage.total
                            ? `Showing ${historyPage.from}–${historyPage.to} of ${historyPage.total}`
                            : 'No matching server records'}
                      </p>
                      <button
                        className="text-button"
                        type="button"
                        onClick={refreshHistory}
                        disabled={historyLoading}
                      >
                        Refresh
                      </button>
                    </div>
                  ) : null}
                  {liveMode && historyError ? (
                    <div className="history-error" role="alert">
                      <span>{historyError}</span>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => {
                          restoreHistoryRetryFocus.current = true;
                          refreshHistory();
                        }}
                      >
                        Try again
                      </button>
                    </div>
                  ) : null}
                  <div className="table-wrap">
                    <table aria-busy={liveMode && historyLoading}>
                      <thead>
                        <tr>
                          <th>Task</th>
                          <th>Check</th>
                          {liveMode ? <th>Subject</th> : null}
                          {liveMode ? <th>Updated</th> : null}
                          <th>Status</th>
                          {liveMode ? null : <th>Cost</th>}
                          <th>
                            <span className="visually-hidden">Action</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {liveMode ? (
                          historyPage.items.length ? (
                            historyPage.items.map((item) => (
                              <tr key={item.workspaceId}>
                                <td data-label="Task">
                                  <strong>{item.workspaceId}</strong>
                                  {item.sku ? <small>{item.sku}</small> : null}
                                </td>
                                <td data-label="Check">{item.code}</td>
                                <td className="history-subject" data-label="Subject">
                                  {item.title}
                                </td>
                                <td data-label="Updated">{formatHistoryDate(item.updatedAt)}</td>
                                <td data-label="Status">
                                  <span className={`risk-chip ${historyStatusClass(item.status)}`}>
                                    {item.status}
                                  </span>
                                </td>
                                <td data-label="Action">
                                  <button
                                    className="history-open"
                                    type="button"
                                    onClick={(event) => {
                                      historyReturnFocus.current = event.currentTarget;
                                      void openHistoryItem(item);
                                    }}
                                    disabled={running || resultLoading}
                                  >
                                    {item.status === 'FAILED' ? 'View task' : 'Open result'}
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr className="empty-row">
                              <td colSpan={6}>
                                {historyLoading
                                  ? 'Loading server history…'
                                  : 'No checks match these filters. Run a check or clear the filters.'}
                              </td>
                            </tr>
                          )
                        ) : jobs.length ? (
                          jobs.map((job) => (
                            <tr key={job.id}>
                              <td data-label="Task">
                                <strong>{job.id}</strong>
                              </td>
                              <td data-label="Check">{job.selection.code}</td>
                              <td data-label="Status">
                                <span
                                  className={`risk-chip ${job.status === 'SUCCEEDED' ? 'risk-low' : 'risk-review'}`}
                                >
                                  {job.status}
                                </span>
                              </td>
                              <td data-label="Cost">{job.cost} credits</td>
                              <td data-label="Action">
                                <button
                                  className="history-open"
                                  type="button"
                                  onClick={(event) => {
                                    historyReturnFocus.current = event.currentTarget;
                                    setHistoryPrototypeJobId(job.id);
                                    setHistoryDetailOpen(true);
                                  }}
                                >
                                  Open result
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr className="empty-row">
                            <td colSpan={5}>No prototype checks yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {liveMode && historyPage.total > 0 ? (
                    <nav className="history-pagination" aria-label="Detection history pages">
                      <button
                        className="button button-small"
                        type="button"
                        disabled={historyLoading || historyPage.page <= 1}
                        onClick={() => {
                          setHistoryLoading(true);
                          setHistoryQuery((current) => ({
                            ...current,
                            page: Math.max(1, current.page - 1),
                          }));
                        }}
                      >
                        ← Previous
                      </button>
                      <span>
                        Page {historyPage.page} of {historyPage.lastPage}
                      </span>
                      <button
                        className="button button-small"
                        type="button"
                        disabled={historyLoading || historyPage.page >= historyPage.lastPage}
                        onClick={() => {
                          setHistoryLoading(true);
                          setHistoryQuery((current) => ({
                            ...current,
                            page: Math.min(historyPage.lastPage, current.page + 1),
                          }));
                        }}
                      >
                        Next →
                      </button>
                    </nav>
                  ) : null}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
