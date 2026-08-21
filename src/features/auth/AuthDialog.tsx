import { useState, type FormEvent } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { ShopifyMark } from '../../components/ShopifyMark';
import {
  validateEmail,
  validateOtp,
  validateRegistrationProfile,
  type RegistrationProfile,
} from '../../domain/prototype';
import {
  authApi,
  isConnectedShopifyAuth,
  isPasswordDemoLoginEnabled,
  type AuthSessionResult,
} from '../../services/auth';

export type AuthMode = 'sign-in' | 'register';

interface AuthDialogProps {
  open: boolean;
  initialMode: AuthMode;
  onClose: () => void;
  onAuthenticated: (result: AuthSessionResult) => void;
  demoPasswordLoginEnabled?: boolean;
}

type Step = 'details' | 'otp';

export function AuthDialog({
  open,
  initialMode,
  onClose,
  onAuthenticated,
  demoPasswordLoginEnabled,
}: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [step, setStep] = useState<Step>('details');
  const [error, setError] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const demoPasswordLogin = demoPasswordLoginEnabled ?? isPasswordDemoLoginEnabled;

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setStep('details');
    setError('');
  }

  function beginShopifyAuthorization() {
    const returnTo = `${window.location.origin}/workspace`;
    window.location.assign(authApi.getShopifyAuthorizationUrl(returnTo));
  }

  async function submitPasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const data = new FormData(event.currentTarget);
    const accountValue = data.get('account');
    const passwordValue = data.get('password');
    const account = typeof accountValue === 'string' ? accountValue.trim() : '';
    const password = typeof passwordValue === 'string' ? passwordValue : '';
    if (!account || !password) {
      setError('Enter the ERiC account and password.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const result = await authApi.loginWithPassword(account, password);
      onAuthenticated(result);
    } catch (loginError) {
      setError(
        loginError instanceof Error ? loginError.message : 'ERiC could not complete the sign-in.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const emailValue = data.get('email');
    const email = typeof emailValue === 'string' ? emailValue.trim() : '';
    if (!validateEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setPendingEmail(email);
    setError('');
    setStep('otp');
  }

  function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const marketValue = data.get('market');
    const fullNameValue = data.get('fullName');
    const companyNameValue = data.get('companyName');
    const emailValue = data.get('email');
    const market = typeof marketValue === 'string' ? marketValue : '';
    const validMarket: RegistrationProfile['market'] =
      market === 'US' || market === 'UK' || market === 'EU' ? market : '';
    const profile: RegistrationProfile = {
      fullName: typeof fullNameValue === 'string' ? fullNameValue.trim() : '',
      companyName: typeof companyNameValue === 'string' ? companyNameValue.trim() : '',
      market: validMarket,
      email: typeof emailValue === 'string' ? emailValue.trim() : '',
      acceptedTerms: data.get('acceptedTerms') === 'on',
    };
    const validationError = validateRegistrationProfile(profile);
    if (validationError) {
      setError(validationError);
      return;
    }
    setPendingEmail(profile.email);
    setError('');
    setStep('otp');
  }

  function submitOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!validateOtp(data.get('otp'))) {
      setError('Use the prototype code 123456.');
      return;
    }
    setError('');
    const displayName = pendingEmail.split('@')[0] || 'Prototype seller';
    const account = {
      tenantId: 1,
      tenantName: 'Prototype workspace',
      pointTotal: 25,
      pointMargin: 25,
      permissions: [],
      webApiEnabled: true as const,
      externalApiServiceEnabled: false,
      externalApiTokenEnabled: false,
      apiExpireTime: '',
    };
    onAuthenticated({
      user: {
        id: `prototype-${pendingEmail}`,
        email: pendingEmail,
        displayName,
        companyName: account.tenantName,
        provider: 'prototype-email',
        tenantId: account.tenantId,
      },
      account,
      balance: account.pointMargin,
      welcomeCreditsGranted: 0,
      welcomeCreditsExpireDays: 0,
    });
  }

  const isRegister = mode === 'register';
  const showDemoPasswordLogin = demoPasswordLogin && !isRegister;
  const showPrototypeAlternative = !isConnectedShopifyAuth && !showDemoPasswordLogin;
  const titleId = 'auth-dialog-title';

  return (
    <AppDialog
      open={open}
      wide={isRegister && step === 'details' && showPrototypeAlternative}
      labelledBy={titleId}
      onClose={onClose}
    >
      <div className="dialog-head">
        <span className="dialog-mark">E</span>
        <button type="button" aria-label="Close account dialog" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="dialog-copy">
        <p className="eyebrow">
          {showDemoPasswordLogin ? 'Standalone demonstration access' : 'Shopify account access'}
        </p>
        <h2 id={titleId}>
          {showDemoPasswordLogin
            ? 'Open the live workspace'
            : isRegister
              ? 'Start with your store'
              : 'Open your workspace'}
        </h2>
        <p>
          {showDemoPasswordLogin
            ? 'Use the ERiC password for an existing Shopify-linked account. Tenant permissions, balance, checks, history, and credit deductions remain live.'
            : 'Authorize with Shopify to use the same ERiC permissions. Eligible new accounts receive 200 welcome credits, valid for seven days, from the ERiC backend.'}
        </p>
      </div>

      {showDemoPasswordLogin ? (
        <form noValidate onSubmit={(event) => void submitPasswordLogin(event)}>
          <label className="field" htmlFor="demo-account">
            <span>ERiC account</span>
            <input
              id="demo-account"
              name="account"
              type="text"
              autoComplete="username"
              placeholder="Email, phone, or account name"
              autoFocus
              required
            />
          </label>
          <label className="field" htmlFor="demo-password">
            <span>Password</span>
            <input
              id="demo-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="button button-primary button-full" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Open live workspace →'}
          </button>
        </form>
      ) : (
        <>
          <button className="shopify-button" type="button" onClick={beginShopifyAuthorization}>
            <ShopifyMark />
            <span>{isRegister ? 'Create account with Shopify' : 'Continue with Shopify'}</span>
            <b aria-hidden="true">→</b>
          </button>
          <p className="shopify-boundary">
            You will authorize on Shopify. ERiC never asks for your Shopify password.
          </p>
        </>
      )}

      {showPrototypeAlternative ? (
        <div className="auth-divider">
          <span>Prototype email alternative</span>
        </div>
      ) : null}

      {showPrototypeAlternative && step === 'details' && !isRegister ? (
        <form noValidate onSubmit={submitEmail}>
          <label className="field" htmlFor="email">
            <span>Work email</span>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
            />
          </label>
          <button className="button button-outline button-full" type="submit">
            Continue with demo email →
          </button>
        </form>
      ) : null}

      {showPrototypeAlternative && step === 'details' && isRegister ? (
        <form noValidate onSubmit={submitRegistration}>
          <div className="registration-grid">
            <label className="field" htmlFor="register-full-name">
              <span>Full name</span>
              <input id="register-full-name" name="fullName" autoComplete="name" required />
            </label>
            <label className="field" htmlFor="register-company">
              <span>Company name</span>
              <input
                id="register-company"
                name="companyName"
                autoComplete="organization"
                required
              />
            </label>
            <label className="field" htmlFor="register-market">
              <span>Primary selling market</span>
              <select id="register-market" name="market" required defaultValue="">
                <option value="" disabled>
                  Choose a market
                </option>
                <option value="US">United States</option>
                <option value="UK">United Kingdom</option>
                <option value="EU">European Union</option>
              </select>
            </label>
            <label className="field" htmlFor="register-email">
              <span>Work email</span>
              <input
                id="register-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
              />
            </label>
          </div>
          <label className="terms-check" htmlFor="register-terms">
            <input id="register-terms" name="acceptedTerms" type="checkbox" required />
            <span>
              I agree to the <a href="#terms">Terms</a> and <a href="#privacy">Privacy notice</a>.
            </span>
          </label>
          <button className="button button-outline button-full" type="submit">
            Continue with demo email →
          </button>
        </form>
      ) : null}

      {showPrototypeAlternative && step === 'otp' ? (
        <form noValidate onSubmit={submitOtp}>
          <p className="prototype-code">
            <span>Visible prototype code</span>
            <strong>123456</strong>
          </p>
          <label className="field" htmlFor="otp">
            <span>6-digit verification code</span>
            <input
              id="otp"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              autoFocus
              required
            />
          </label>
          <button className="button button-primary button-full" type="submit">
            Verify and open workspace →
          </button>
        </form>
      ) : null}

      <p className="form-error" role="alert">
        {error}
      </p>
      {showDemoPasswordLogin ? (
        <p className="dialog-switch">New accounts still require Shopify authorization.</p>
      ) : (
        <p className="dialog-switch">
          {isRegister ? 'Already use ERiC?' : 'New to ERiC Suite?'}{' '}
          <button type="button" onClick={() => switchMode(isRegister ? 'sign-in' : 'register')}>
            {isRegister ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      )}
      <small className="dialog-note">
        {showDemoPasswordLogin
          ? 'Temporary standalone access · Real ERiC data and server credit ledger'
          : isConnectedShopifyAuth
            ? 'Live Shopify authorization · ERiC manages the resulting session'
            : 'Mock mode only · No message, payment, or API call'}
      </small>
    </AppDialog>
  );
}
