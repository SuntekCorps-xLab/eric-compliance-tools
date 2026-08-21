import { useEffect, useRef, useState } from 'react';
import copyrightIcon from '../assets/icons/copyright.svg';
import designPatentIcon from '../assets/icons/design-patent.svg';
import graphicTrademarkIcon from '../assets/icons/graphic-trademark.svg';
import policyIcon from '../assets/icons/policy.svg';
import textTrademarkIcon from '../assets/icons/text-trademark.svg';
import caseOne from '../assets/erichome/case-1.webp';
import caseTwo from '../assets/erichome/case-2.webp';
import caseThree from '../assets/erichome/case-3.webp';
import copyrightVideo from '../assets/erichome/copyright.mp4';
import ctaBackground from '../assets/erichome/cta-bg.webp';
import designPatentVideo from '../assets/erichome/design-patent.mp4';
import homeBackground from '../assets/erichome/home-bg.webp';
import homeData from '../assets/erichome/home-data.webp';
import homeMain from '../assets/erichome/home-main.mp4';
import insightOne from '../assets/erichome/insight-1.webp';
import insightTwo from '../assets/erichome/insight-2.webp';
import insightThree from '../assets/erichome/insight-3.webp';
import policyVideo from '../assets/erichome/policy.mp4';
import trademarkVideo from '../assets/erichome/trademark.mp4';
import utilityPatentVideo from '../assets/erichome/utility-patent.mp4';
import ericMark from '../assets/eric-mark.svg';
import { Brand } from '../components/Brand';
import { GuestDemoButton } from '../components/GuestDemoButton';
import { creditPacks, type CreditPackId, type DetectionCode } from '../domain/prototype';
import { AuthDialog, type AuthMode } from '../features/auth/AuthDialog';
import { CreditDialog } from '../features/credits/CreditDialog';
import {
  authApi,
  isConnectedShopifyAuth,
  isPasswordDemoLoginEnabled,
  isShopifyStorefront,
  type AuthSessionResult,
} from '../services/auth';
import { storefrontLogoutUrl, storefrontWorkspaceUrl } from '../storefront/context';
import { useAppStore } from '../store/app-store';

const heroExamples: Array<{ code: DetectionCode; icon: string; text: string }> = [
  { code: 'D001', icon: designPatentIcon, text: 'Check this product image for design patent risk' },
  { code: 'T001', icon: textTrademarkIcon, text: 'Review this listing title for trademark risk' },
  { code: 'L001', icon: graphicTrademarkIcon, text: 'Check this product image for similar logos' },
  { code: 'C001', icon: copyrightIcon, text: 'Compare this artwork for copyright risk' },
  { code: 'P002', icon: policyIcon, text: 'Review this marketplace claim before publishing' },
];

const featureItems: Array<{
  code: DetectionCode;
  detail: string;
  label: string;
  meta: string;
  video: string;
}> = [
  {
    code: 'D001',
    label: 'Design patent screening',
    meta: 'D001',
    detail:
      'Search by product image and rank visually similar design records. Review market-specific evidence before listing.',
    video: designPatentVideo,
  },
  {
    code: 'L001',
    label: 'Trademark screening',
    meta: 'L001 · T001 · T002',
    detail:
      'Review graphic and text marks together. Turn high-risk wording into safer alternatives.',
    video: trademarkVideo,
  },
  {
    code: 'C001',
    label: 'Copyright screening',
    meta: 'C001',
    detail:
      'Surface similar artwork and image evidence. Use Radar for a wider comparison where available.',
    video: copyrightVideo,
  },
  {
    code: 'P002',
    label: 'Marketplace policy',
    meta: 'P001 · P002 · P004-P007',
    detail: 'Screen restricted products, claims and team-specific risk terms in the same workflow.',
    video: policyVideo,
  },
  {
    code: 'I001',
    label: 'Utility patent screening',
    meta: 'I001',
    detail:
      'Match technical descriptions with related patent concepts and focus the team on evidence that merits review.',
    video: utilityPatentVideo,
  },
];

const flowItems = [
  {
    label: 'Start instantly or connect through Shopify',
    detail:
      'Open a private seven-day guest workspace, or use the Shopify customer account your buyer already knows.',
  },
  {
    label: 'Choose and configure a check',
    detail:
      'Start with an image or listing text. Select markets and see the exact credit cost before running.',
  },
  {
    label: 'Review evidence and next steps',
    detail:
      'See risk level, ranked evidence and market coverage. Keep a clear record for your team.',
  },
] as const;

const stories: Array<{
  code: DetectionCode;
  copy: string;
  image: string;
  label: string;
  title: string;
}> = [
  {
    code: 'D001',
    image: caseOne,
    label: 'CATALOG SCREENING',
    title: 'Identify product risk earlier with a repeatable review workflow',
    copy: 'Move image, listing and policy checks into one shared step before publication.',
  },
  {
    code: 'T001',
    image: caseTwo,
    label: 'TEAM EFFICIENCY',
    title: 'Review growing catalogs without losing the evidence trail',
    copy: 'Give operators a consistent result format while specialists focus on exceptions.',
  },
  {
    code: 'C001',
    image: caseThree,
    label: 'REVIEW-READY RESULTS',
    title: 'Turn screening signals into decisions your team can explain',
    copy: 'Connect each risk level to ranked evidence, market context and clear next steps.',
  },
];

type InsightTab = 'courses' | 'updates';

const insightContent: Record<
  InsightTab,
  Array<{ copy: string; image: string; label: string; title: string }>
> = {
  courses: [
    {
      image: insightOne,
      label: 'FOUNDATIONS',
      title: 'Build a pre-listing compliance routine',
      copy: 'Learn where patent, trademark, copyright and policy checks fit in the launch process.',
    },
    {
      image: insightTwo,
      label: 'VISUAL SCREENING',
      title: 'Read design patent similarity with context',
      copy: 'Use ranked results as a review signal and document the reasons behind each decision.',
    },
    {
      image: insightThree,
      label: 'LISTING TEXT',
      title: 'Review names and claims before publishing',
      copy: 'Spot trademark and policy wording that deserves attention while editing a listing.',
    },
    {
      image: insightOne,
      label: 'TEAM WORKFLOW',
      title: 'Create a review trail that scales',
      copy: 'Standardize inputs, evidence and escalation so catalog growth stays manageable.',
    },
  ],
  updates: [
    {
      image: insightThree,
      label: 'MARKETPLACE POLICY',
      title: 'What to capture when marketplace rules change',
      copy: 'Keep sensitive claims and private review terms current across the team.',
    },
    {
      image: insightTwo,
      label: 'GLOBAL IP',
      title: 'Why market context changes the review',
      copy: 'Compare the territories that matter to a product before making a listing decision.',
    },
    {
      image: insightOne,
      label: 'PRODUCT UPDATE',
      title: 'A smoother path from Shopify account to ERiC',
      copy: 'Use one customer identity to access the workspace, credits and screening history.',
    },
    {
      image: insightThree,
      label: 'RESPONSIBLE REVIEW',
      title: 'Where automation ends and expert review begins',
      copy: 'Treat screening as structured evidence, not a substitute for qualified legal advice.',
    },
  ],
};

const faqItems = [
  [
    'Is this a live compliance service?',
    isConnectedShopifyAuth
      ? 'Yes. Supported checks use the signed-in ERiC tenant permissions, live task APIs and the server-side point ledger. Any unavailable check or sample evidence remains clearly labeled.'
      : 'This local React mode is an interactive prototype. Shopify-connected builds use the supported live ERiC task APIs and point ledger.',
  ],
  [
    isPasswordDemoLoginEnabled
      ? 'How does temporary demonstration access work?'
      : 'How does Shopify access work?',
    isPasswordDemoLoginEnabled
      ? 'Only sign-in is temporarily handled by the existing ERiC password route. The linked tenant, permissions, checks, history and credit deductions remain server-backed.'
      : isConnectedShopifyAuth
        ? 'Shopify authorization and identity validation stay on trusted Shopify and ERiC endpoints; the browser receives only the resulting ERiC session.'
        : 'The local mode demonstrates the redirect and return journey. In production, Shopify authorization and callback validation stay on the ERiC backend.',
  ],
  [
    'Do new Shopify accounts receive credits?',
    'An eligible new Shopify-linked account receives 200 points once, valid for seven days. The backend owns eligibility, expiry and idempotency; the interface only displays the returned balance.',
  ],
  [
    'Are results legal advice?',
    'No. Results help sellers prioritize review and should be validated with qualified counsel where appropriate.',
  ],
] as const;

function workspaceUrl(code?: DetectionCode): string {
  const url = new URL(
    isShopifyStorefront ? storefrontWorkspaceUrl() : '/workspace',
    window.location.origin,
  );
  if (code) url.searchParams.set('check', code);
  return `${url.pathname}${url.search}`;
}

function HeadphoneVisual({ technical = false }: { technical?: boolean }) {
  return (
    <svg
      className={`headphone-visual${technical ? ' is-technical' : ''}`}
      viewBox="0 0 120 100"
      aria-hidden="true"
    >
      <path className="headphone-band" d="M22 57V46C22 24 38 10 60 10s38 14 38 36v11" />
      <path className="headphone-band-inner" d="M31 52v-6c0-16 12-27 29-27s29 11 29 27v6" />
      <rect className="headphone-cup" x="14" y="48" width="25" height="39" rx="10" />
      <rect className="headphone-cup" x="81" y="48" width="25" height="39" rx="10" />
      <path className="headphone-detail" d="M30 59v17M90 59v17" />
      <path className="headphone-shadow" d="M42 84c5 4 11 6 18 6s13-2 18-6" />
    </svg>
  );
}

function FlowVisual({
  index,
  onOpenEvidence,
  onRunScreening,
}: {
  index: number;
  onOpenEvidence: () => void;
  onRunScreening: () => void;
}) {
  if (index === 0) {
    return (
      <div className="flow-panel">
        <div className="account-connect-visual">
          <span className="shopify-node">S</span>
          <i />
          <span className="eric-node">
            <img src={ericMark} alt="" />
          </span>
        </div>
        <strong>One workspace, two safe entry points</strong>
        <p>
          Start with a private guest workspace, or let Shopify restore your customer account and
          balance.
        </p>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="flow-panel">
        <div className="screening-demo">
          <header className="screening-product">
            <span className="product-shot">
              <HeadphoneVisual />
            </span>
            <div>
              <span>SHOPIFY PRODUCT</span>
              <strong>Contour wireless headphones</strong>
              <small>SKU AUR-04 · Draft listing</small>
            </div>
            <b className="sync-chip">Synced</b>
          </header>
          <div className="screening-body">
            <nav className="check-preview-rail" aria-label="Sample check types">
              <span>CHECK TYPE</span>
              <button className="active" type="button">
                <img src={designPatentIcon} alt="" />
                <span>
                  <strong>Design patent</strong>
                  <small>D001 · Visual</small>
                </span>
              </button>
              <button type="button">
                <img src={graphicTrademarkIcon} alt="" />
                <span>
                  <strong>Graphic mark</strong>
                  <small>L001 · Logo</small>
                </span>
              </button>
              <button type="button">
                <img src={textTrademarkIcon} alt="" />
                <span>
                  <strong>Text mark</strong>
                  <small>T001 · Listing</small>
                </span>
              </button>
            </nav>
            <div className="screening-config">
              <span className="demo-label">MARKET COVERAGE</span>
              <div className="market-preview">
                <button className="active" type="button">
                  US <b>✓</b>
                </button>
                <button className="active" type="button">
                  UK <b>✓</b>
                </button>
                <button type="button">EU</button>
              </div>
              <div className="setup-row">
                <span>Visual Radar</span>
                <b>On</b>
              </div>
              <div className="setup-row">
                <span>Estimated cost</span>
                <b>15 credits</b>
              </div>
            </div>
          </div>
          <footer className="screening-action">
            <span>
              <i /> Ready to screen
            </span>
            <button type="button" onClick={onRunScreening}>
              Run screening <b>→</b>
            </button>
          </footer>
        </div>
      </div>
    );
  }
  return (
    <div className="flow-panel">
      <div className="evidence-demo">
        <header className="evidence-header">
          <img src={ericMark} alt="" />
          <div>
            <span>D001 · DESIGN PATENT</span>
            <strong>Evidence review</strong>
            <small>Task ER-2048 · Contour headphones</small>
          </div>
          <b className="review-chip">
            <i /> Review
          </b>
        </header>
        <div className="evidence-summary">
          <div>
            <span>CLOSEST VISUAL MATCH</span>
            <strong>Review before publishing</strong>
            <p>A similar headband and ear-cup profile appears in one active US record.</p>
          </div>
          <p>
            <small>SIMILARITY</small>
            <b>87%</b>
          </p>
        </div>
        <div className="evidence-comparison">
          <article>
            <span className="evidence-visual listing-visual">
              <HeadphoneVisual />
            </span>
            <p>
              <small>YOUR LISTING</small>
              <strong>SKU AUR-04</strong>
            </p>
          </article>
          <span className="comparison-link">→</span>
          <article>
            <span className="evidence-visual filing-visual">
              <HeadphoneVisual technical />
            </span>
            <p>
              <small>CLOSEST FILING</small>
              <strong>US D1,045,821</strong>
            </p>
            <b className="active-record">Active</b>
          </article>
        </div>
        <div className="decision-strip">
          <div>
            <span>RECOMMENDED NEXT STEP</span>
            <strong>Review the claim scope and save this evidence.</strong>
          </div>
          <button type="button" onClick={onOpenEvidence}>
            Open evidence <b>→</b>
          </button>
        </div>
        <footer>Sample evidence · United States · Not legal advice</footer>
      </div>
    </div>
  );
}

export function LandingPage() {
  const user = useAppStore((state) => state.user);
  const authenticate = useAppStore((state) => state.authenticate);
  const sessionToken = useAppStore((state) => state.sessionToken);
  const refreshSession = useAppStore((state) => state.refreshSession);
  const signOut = useAppStore((state) => state.signOut);
  const buyCredits = useAppStore((state) => state.buyCredits);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('register');
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [pendingPack, setPendingPack] = useState<CreditPackId>();
  const [productNavOpen, setProductNavOpen] = useState(false);
  const [productPreview, setProductPreview] = useState<'visual' | 'text'>('visual');
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [featureIndex, setFeatureIndex] = useState(0);
  const [featurePaused, setFeaturePaused] = useState(false);
  const [flowIndex, setFlowIndex] = useState(0);
  const [flowPaused, setFlowPaused] = useState(false);
  const [insightTab, setInsightTab] = useState<InsightTab>('courses');
  const insightTrackRef = useRef<HTMLDivElement>(null);
  const userId = user?.id;
  const heroExample = heroExamples[heroIndex] ?? heroExamples[0]!;
  const feature = featureItems[featureIndex] ?? featureItems[0]!;

  useEffect(() => {
    if (!isShopifyStorefront && userId && sessionToken) void refreshSession();
  }, [refreshSession, sessionToken, userId]);

  useEffect(() => {
    if (heroPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(
      () => setHeroIndex((index) => (index + 1) % heroExamples.length),
      3000,
    );
    return () => window.clearInterval(timer);
  }, [heroPaused]);

  useEffect(() => {
    if (featurePaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(
      () => setFeatureIndex((index) => (index + 1) % featureItems.length),
      4500,
    );
    return () => window.clearInterval(timer);
  }, [featurePaused]);

  useEffect(() => {
    if (flowPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(
      () => setFlowIndex((index) => (index + 1) % flowItems.length),
      4500,
    );
    return () => window.clearInterval(timer);
  }, [flowPaused]);

  function openAccount(mode: AuthMode) {
    if (user) {
      window.location.assign(workspaceUrl());
      return;
    }
    if (isShopifyStorefront) {
      window.location.assign(authApi.getShopifyAuthorizationUrl(workspaceUrl()));
      return;
    }
    setAuthMode(mode);
    setPendingPack(undefined);
    setAuthOpen(true);
  }

  function chooseRoute(code: DetectionCode) {
    window.location.assign(workspaceUrl(code));
  }

  function choosePack(packId: CreditPackId) {
    setPendingPack(packId);
    if (!user) {
      openAccount(isPasswordDemoLoginEnabled ? 'sign-in' : 'register');
      return;
    }
    setCreditsOpen(true);
  }

  function finishAuthentication(result: AuthSessionResult) {
    authenticate(result);
    setAuthOpen(false);
    if (pendingPack) setCreditsOpen(true);
    else window.location.assign(workspaceUrl());
  }

  async function finishSignOut() {
    const wasGuest = user?.provider === 'shopify-guest';
    await signOut();
    if (isShopifyStorefront) {
      window.location.assign(wasGuest ? '/' : storefrontLogoutUrl());
    }
  }

  function changeInsightTab(tab: InsightTab) {
    setInsightTab(tab);
    if (insightTrackRef.current) insightTrackRef.current.scrollLeft = 0;
  }

  function scrollInsights(direction: -1 | 1) {
    insightTrackRef.current?.scrollBy({ left: direction * 340, behavior: 'smooth' });
  }

  return (
    <div className="landing-page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="site-header">
        <Brand />
        <nav className="desktop-nav" aria-label="Primary">
          <div
            className={`nav-product${productNavOpen ? ' open' : ''}`}
            onMouseEnter={() => setProductNavOpen(true)}
            onMouseLeave={() => setProductNavOpen(false)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setProductNavOpen(false);
            }}
          >
            <button
              className="nav-product-trigger"
              type="button"
              aria-expanded={productNavOpen}
              onClick={() => setProductNavOpen((open) => !open)}
            >
              Product <span aria-hidden="true">⌄</span>
            </button>
            <div className="nav-mega" aria-label="Product checks">
              <div className="nav-mega-list">
                <button
                  className={productPreview === 'visual' ? 'active' : ''}
                  type="button"
                  onMouseEnter={() => setProductPreview('visual')}
                  onClick={() => setProductPreview('visual')}
                >
                  <img src={designPatentIcon} alt="" />
                  <span>
                    Visual risk checks<small>Patent, logo and copyright</small>
                  </span>
                </button>
                <button
                  className={productPreview === 'text' ? 'active' : ''}
                  type="button"
                  onMouseEnter={() => setProductPreview('text')}
                  onClick={() => setProductPreview('text')}
                >
                  <img src={textTrademarkIcon} alt="" />
                  <span>
                    Listing risk checks<small>Names, claims and policy</small>
                  </span>
                </button>
              </div>
              <div className="nav-mega-preview">
                <strong>
                  {productPreview === 'visual'
                    ? 'Check product visuals before listing.'
                    : 'Review every word customers see.'}
                </strong>
                <p>
                  {productPreview === 'visual'
                    ? 'Compare appearance, logos and artwork with reviewable evidence.'
                    : 'Screen listing text, sensitive claims and marketplace rules.'}
                </p>
                <button
                  type="button"
                  onClick={() => chooseRoute(productPreview === 'visual' ? 'D001' : 'T001')}
                >
                  Explore {productPreview} checks <span>↗</span>
                </button>
              </div>
            </div>
          </div>
          <a href="#solutions">Solutions</a>
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#resources">Resources</a>
        </nav>
        <div className="header-actions">
          {user ? (
            <>
              <button
                className="account-button"
                type="button"
                onClick={() => window.location.assign(workspaceUrl())}
              >
                <span>{user.displayName.charAt(0).toUpperCase()}</span>
                <small>{user.displayName}</small>
              </button>
              <button
                className="button button-quiet sign-out-button"
                type="button"
                onClick={() => void finishSignOut()}
              >
                Sign out
              </button>
            </>
          ) : isShopifyStorefront ? (
            <>
              <button
                className="button button-quiet"
                id="header-sign-in"
                type="button"
                onClick={() => openAccount('sign-in')}
              >
                Sign in
              </button>
              <GuestDemoButton
                className="button button-primary button-header"
                onAuthenticated={finishAuthentication}
              />
            </>
          ) : (
            <>
              <button
                className="button button-quiet"
                id="header-sign-in"
                type="button"
                onClick={() => openAccount('sign-in')}
              >
                Sign in
              </button>
              <button
                className="button button-primary button-header"
                id="header-register"
                type="button"
                onClick={() => openAccount(isPasswordDemoLoginEnabled ? 'sign-in' : 'register')}
              >
                {isPasswordDemoLoginEnabled ? 'Open live demo' : 'Create account'}
              </button>
            </>
          )}
        </div>
      </header>

      <main id="main">
        <section
          className="eric-home-hero"
          id="product"
          style={{ backgroundImage: `url(${homeBackground})` }}
        >
          <div className="eric-hero-inner">
            <a className="news-ticker" href="#resources">
              <span className="news-label">ERiC update</span>
              <span>
                Try every live check as a guest, or connect your Shopify customer account.
              </span>
              <b aria-hidden="true">›</b>
            </a>
            <h1 aria-label="Check before you list. Sell with confidence.">
              <span>
                Check infringement with ERiC <em>AI</em>
                <i aria-hidden="true">✦</i>
              </span>
              <small>Patents · trademarks · copyright · policy — all in one place</small>
            </h1>
            <div
              className="example-container"
              aria-live="polite"
              onMouseEnter={() => setHeroPaused(true)}
              onMouseLeave={() => setHeroPaused(false)}
            >
              <div className="example-thumb">
                <img src={heroExample.icon} alt="" />
              </div>
              <span id="hero-example-text">{heroExample.text}</span>
              <button
                className="button button-primary"
                id="hero-start"
                type="button"
                onClick={() => chooseRoute(heroExample.code)}
              >
                Start check <span aria-hidden="true">→</span>
              </button>
            </div>
            <video
              className="home-product-demo"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="ERiC product interface demonstration"
            >
              <source src={homeMain} type="video/mp4" />
            </video>
            <div className="hero-trust" aria-label="ERiC coverage">
              <span>Designed for global sellers</span>
              <strong>US</strong>
              <strong>UK</strong>
              <strong>EU</strong>
              <span className="divider" />
              <span>Guest demo or Shopify account · 9 risk checks · one workspace</span>
            </div>
          </div>
        </section>

        <section className="home-section data-universe" aria-labelledby="data-title">
          <h2 id="data-title">One connected compliance workspace</h2>
          <div className="knowledge-data" style={{ backgroundImage: `url(${homeData})` }}>
            <div className="metric-column">
              <article>
                <strong>9</strong>
                <span>screening workflows</span>
              </article>
              <article>
                <strong>2</strong>
                <span>safe ways to enter</span>
              </article>
            </div>
            <div className="metric-column">
              <article>
                <strong>3</strong>
                <span>core selling markets</span>
              </article>
              <article>
                <strong>Clear</strong>
                <span>cost before every run</span>
              </article>
            </div>
            <div className="metric-column">
              <article>
                <strong>4</strong>
                <span>evidence families</span>
              </article>
              <article>
                <strong>Ranked</strong>
                <span>review-ready results</span>
              </article>
            </div>
            <div className="metric-column">
              <article>
                <strong>Live</strong>
                <span>server-backed when connected</span>
              </article>
              <article>
                <strong>English</strong>
                <span>global seller experience</span>
              </article>
            </div>
          </div>
        </section>

        <section
          className="home-section feature-showcase"
          id="solutions"
          aria-labelledby="capabilities-title"
        >
          <h2 id="capabilities-title">All-in-one infringement and policy screening</h2>
          <div
            className="feature-stage"
            onMouseEnter={() => setFeaturePaused(true)}
            onMouseLeave={() => setFeaturePaused(false)}
          >
            <div className="feature-list" role="tablist" aria-label="Compliance checks">
              {featureItems.map((item, index) => (
                <button
                  className={`feature-item${index === featureIndex ? ' active' : ''}`}
                  key={item.code}
                  type="button"
                  role="tab"
                  aria-selected={index === featureIndex}
                  onClick={() => setFeatureIndex(index)}
                >
                  <span className="feature-title">
                    {item.label} <small>{item.meta}</small>
                  </span>
                  <span className="feature-details">{item.detail}</span>
                </button>
              ))}
            </div>
            <div className="feature-media-card">
              <video key={feature.video} autoPlay muted loop playsInline preload="metadata">
                <source src={feature.video} type="video/mp4" />
              </video>
              <div className="feature-media-footer">
                <span>{feature.label}</span>
                <button
                  className="text-action"
                  type="button"
                  onClick={() => chooseRoute(feature.code)}
                >
                  Start this check <b>→</b>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section
          className="home-section flow-showcase"
          id="how-it-works"
          aria-labelledby="flow-title"
        >
          <h2 id="flow-title">From first click to review-ready result</h2>
          <div
            className="feature-stage feature-stage-reversed"
            onMouseEnter={() => setFlowPaused(true)}
            onMouseLeave={() => setFlowPaused(false)}
          >
            <div className="flow-visual" id="sample-report">
              <FlowVisual
                index={flowIndex}
                onRunScreening={() => setFlowIndex(2)}
                onOpenEvidence={() => chooseRoute('D001')}
              />
            </div>
            <div className="feature-list flow-list" role="tablist" aria-label="How ERiC works">
              {flowItems.map((item, index) => (
                <button
                  className={`feature-item${index === flowIndex ? ' active' : ''}`}
                  key={item.label}
                  type="button"
                  role="tab"
                  aria-selected={index === flowIndex}
                  onClick={() => setFlowIndex(index)}
                >
                  <span className="feature-title">{item.label}</span>
                  <span className="feature-details">{item.detail}</span>
                </button>
              ))}
            </div>
          </div>
          {isShopifyStorefront && !user ? (
            <GuestDemoButton
              className="text-action centered-action"
              label="Open a guest workspace"
              onAuthenticated={finishAuthentication}
            />
          ) : (
            <button
              className="text-action centered-action"
              type="button"
              onClick={() => openAccount(isPasswordDemoLoginEnabled ? 'sign-in' : 'register')}
            >
              Open the ERiC workspace <b>→</b>
            </button>
          )}
        </section>

        <section className="customer-stories" aria-labelledby="stories-title">
          <div className="story-inner">
            <p className="home-kicker">Customer stories</p>
            <h2 id="stories-title">
              <em>Trusted workflows</em> for global commerce teams
            </h2>
            <div className="story-grid">
              {stories.map((story) => (
                <article className="story-card" key={story.label}>
                  <img src={story.image} alt="" />
                  <div>
                    <span>{story.label}</span>
                    <h3>{story.title}</h3>
                    <p>{story.copy}</p>
                    <button
                      className="text-action"
                      type="button"
                      onClick={() => chooseRoute(story.code)}
                    >
                      Explore the workflow <b>→</b>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="home-section insights" id="resources" aria-labelledby="insights-title">
          <p className="home-kicker">Resources</p>
          <h2 id="insights-title">ERiC insights</h2>
          <div className="insight-tabs" role="tablist" aria-label="ERiC resources">
            <button
              className={insightTab === 'courses' ? 'active' : ''}
              type="button"
              role="tab"
              aria-selected={insightTab === 'courses'}
              onClick={() => changeInsightTab('courses')}
            >
              Compliance courses
            </button>
            <button
              className={insightTab === 'updates' ? 'active' : ''}
              type="button"
              role="tab"
              aria-selected={insightTab === 'updates'}
              onClick={() => changeInsightTab('updates')}
            >
              Industry updates
            </button>
          </div>
          <div className="insight-carousel">
            <button
              className="insight-arrow insight-prev"
              type="button"
              aria-label="Previous resources"
              onClick={() => scrollInsights(-1)}
            >
              ←
            </button>
            <div className="insight-track" ref={insightTrackRef}>
              {insightContent[insightTab].map((insight) => (
                <article key={insight.title}>
                  <img src={insight.image} alt="" />
                  <span>{insight.label}</span>
                  <h3>{insight.title}</h3>
                  <p>{insight.copy}</p>
                </article>
              ))}
            </div>
            <button
              className="insight-arrow insight-next"
              type="button"
              aria-label="Next resources"
              onClick={() => scrollInsights(1)}
            >
              →
            </button>
          </div>
        </section>

        <section className="pricing section" id="pricing">
          <div className="pricing-inner">
            <div className="pricing-heading">
              <p className="eyebrow">Straightforward pricing</p>
              <h2>Prepaid credits, built for every catalog.</h2>
              <p>No subscription required. See the exact credit cost before creating a check.</p>
            </div>
            <div className="pricing-grid">
              {Object.values(creditPacks).map((pack) => (
                <article key={pack.id} className={pack.id === 'growth' ? 'featured' : undefined}>
                  {pack.id === 'growth' ? <span className="popular">MOST POPULAR</span> : null}
                  <div className="plan-head">
                    <p className="plan-name">{pack.name}</p>
                    <span>
                      {pack.id === 'starter'
                        ? 'For occasional reviews'
                        : pack.id === 'growth'
                          ? 'For active sellers'
                          : 'For larger catalogs'}
                    </span>
                  </div>
                  <h3>
                    <span>$</span>
                    {pack.price}
                  </h3>
                  <p>{pack.credits.toLocaleString()} credits</p>
                  <ul>
                    <li>
                      {pack.id === 'growth' ? 'Lower cost per credit' : 'Explore every check'}
                    </li>
                    <li>
                      {pack.id === 'business' ? 'Team-ready foundation' : 'Review-ready reports'}
                    </li>
                    <li>Activity history</li>
                  </ul>
                  <button
                    className={`button ${pack.id === 'growth' ? 'button-primary' : 'button-outline'}`}
                    type="button"
                    onClick={() => choosePack(pack.id)}
                  >
                    Choose {pack.name}
                  </button>
                </article>
              ))}
            </div>
            <p className="pricing-note">
              {isConnectedShopifyAuth
                ? 'Prices shown in USD. Payment is completed by Shopify; ERiC grants credits only after a verified paid-order webhook.'
                : 'Preview purchases do not process payment. Connected Shopify Checkout settles in USD.'}
            </p>
          </div>
        </section>

        <section className="faq section" id="faq">
          <div className="section-intro">
            <p className="eyebrow">Questions, answered</p>
            <h2>Know what is live today.</h2>
          </div>
          <div className="faq-list">
            {faqItems.map(([question, answer], index) => (
              <details key={question} open={index === 0}>
                <summary>
                  {question}
                  <span>＋</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="final-cta section" style={{ backgroundImage: `url(${ctaBackground})` }}>
          <div>
            <p className="eyebrow light">Start before you list</p>
            <h2>
              Make product risk part of
              <br />
              your launch checklist.
            </h2>
            <p>Try the complete English ERiC workspace for seven days without a Shopify sign-in.</p>
          </div>
          {isShopifyStorefront && !user ? (
            <GuestDemoButton
              className="button button-light"
              label="Start guest demo"
              onAuthenticated={finishAuthentication}
            />
          ) : (
            <button
              className="button button-light"
              type="button"
              onClick={() => openAccount(isPasswordDemoLoginEnabled ? 'sign-in' : 'register')}
            >
              {isPasswordDemoLoginEnabled ? 'Open live demo' : 'Start a compliance check'}{' '}
              <span>→</span>
            </button>
          )}
        </section>
      </main>

      <footer className="site-footer">
        <Brand footer />
        <p>Product compliance signals for global ecommerce sellers.</p>
        <nav aria-label="Footer">
          <a id="terms" href="#terms">
            Terms
          </a>
          <a id="privacy" href="#privacy">
            Privacy
          </a>
          <a href="#resources">API &amp; Open Source</a>
          <a href="mailto:hello@example.com">Contact</a>
        </nav>
        <small>© 2026 ERiC Suite. Sample data is labeled.</small>
      </footer>

      {authOpen ? (
        <AuthDialog
          open
          initialMode={authMode}
          onClose={() => setAuthOpen(false)}
          onAuthenticated={finishAuthentication}
        />
      ) : null}
      <CreditDialog
        open={creditsOpen}
        live={isConnectedShopifyAuth}
        onClose={() => setCreditsOpen(false)}
        onPurchase={buyCredits}
      />
    </div>
  );
}
