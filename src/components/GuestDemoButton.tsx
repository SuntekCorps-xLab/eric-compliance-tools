import { useState } from 'react';
import {
  createShopifyGuestSession,
  hasShopifyGuestCredentials,
  type AuthSessionResult,
} from '../services/auth';
import { readShopifyStorefrontContext } from '../storefront/context';

interface GuestDemoButtonProps {
  className?: string;
  onAuthenticated: (result: AuthSessionResult) => void;
  label?: string;
}

export function GuestDemoButton({
  className = 'button button-primary',
  onAuthenticated,
  label,
}: GuestDemoButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canResume = hasShopifyGuestCredentials();

  async function startDemo() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await createShopifyGuestSession(readShopifyStorefrontContext(), true);
      if (!result) throw new Error('ERiC could not open the guest demo.');
      onAuthenticated(result);
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : 'ERiC could not open the guest demo. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="guest-demo-entry">
      <button className={className} type="button" disabled={busy} onClick={() => void startDemo()}>
        {busy
          ? 'Opening guest demo…'
          : label || (canResume ? 'Continue guest demo' : 'Try as guest')}
        {!busy ? <span aria-hidden="true"> →</span> : null}
      </button>
      {error ? (
        <small className="guest-demo-entry-error" role="alert">
          {error}
        </small>
      ) : null}
    </span>
  );
}
