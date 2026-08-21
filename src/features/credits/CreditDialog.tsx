import { useEffect, useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { creditPacks, type CreditPackId } from '../../domain/prototype';
import {
  listShopifyPointPacks,
  prepareShopifyPointCheckout,
  refillShopifyGuestDemo,
  type ShopifyPointPack,
} from '../../services/credits';
import { useAppStore } from '../../store/app-store';

interface CreditDialogProps {
  open: boolean;
  live?: boolean;
  onClose: () => void;
  onPurchase: (packId: CreditPackId) => void;
}

type CheckoutState = 'idle' | 'starting-checkout' | 'redirecting' | 'refilling';

export function CreditDialog({ open, live = false, onClose, onPurchase }: CreditDialogProps) {
  const user = useAppStore((state) => state.user);
  const sessionToken = useAppStore((state) => state.sessionToken);
  const demoSession = useAppStore((state) => state.demoSession);
  const refreshSession = useAppStore((state) => state.refreshSession);
  const updateDemoSession = useAppStore((state) => state.updateDemoSession);
  const [packs, setPacks] = useState<ShopifyPointPack[]>([]);
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('idle');
  const [packsLoaded, setPacksLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!open || !live || user?.provider === 'shopify-guest') return;
    if (!user || !sessionToken) return;
    let active = true;
    void listShopifyPointPacks({ sessionToken, userId: user.id, tenantId: user.tenantId })
      .then((loadedPacks) => {
        if (!active) return;
        setPacks(loadedPacks);
        setPacksLoaded(true);
        setError('');
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setPacks([]);
        setPacksLoaded(true);
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'ERiC could not load the Shopify credit packs.',
        );
      });
    return () => {
      active = false;
    };
  }, [live, open, sessionToken, user]);

  async function refillDemo() {
    if (!user || !sessionToken || user.provider !== 'shopify-guest' || checkoutState !== 'idle') {
      return;
    }
    setCheckoutState('refilling');
    setError('');
    setNotice('');
    try {
      const result = await refillShopifyGuestDemo({
        sessionToken,
        userId: user.id,
        tenantId: user.tenantId,
      });
      updateDemoSession({
        remainingRefills: result.remainingRefills,
        ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}),
      });
      await refreshSession();
      setNotice(`${result.points.toLocaleString()} demo credits added. Your balance is ready.`);
    } catch (refillError) {
      setError(
        refillError instanceof Error
          ? refillError.message
          : 'ERiC could not add guest demo credits.',
      );
    } finally {
      setCheckoutState('idle');
    }
  }

  async function startCheckout(pack: ShopifyPointPack) {
    if (!user || !sessionToken || checkoutState !== 'idle') return;
    setCheckoutState('starting-checkout');
    setError('');
    try {
      const checkoutUrl = await prepareShopifyPointCheckout(
        { sessionToken, userId: user.id, tenantId: user.tenantId },
        pack.code,
      );
      setCheckoutState('redirecting');
      window.location.assign(checkoutUrl);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : 'Shopify Checkout could not be started.',
      );
      setCheckoutState('idle');
    }
  }

  const busy = checkoutState !== 'idle';
  const guestDemo = user?.provider === 'shopify-guest';
  const visibleError =
    live && (!user || !sessionToken) ? 'Open an ERiC session before adding credits.' : error;
  const liveEmpty = live && !guestDemo && packsLoaded && packs.length === 0 && !visibleError;

  return (
    <AppDialog
      open={open}
      labelledBy="credit-dialog-title"
      onClose={busy ? () => undefined : onClose}
    >
      <div className="dialog-head">
        <span className="dialog-mark">＋</span>
        <button type="button" aria-label="Close credit dialog" disabled={busy} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="dialog-copy">
        <p className="eyebrow">
          {guestDemo ? 'Guest demo refill' : live ? 'Shopify Checkout' : 'Prototype balance'}
        </p>
        <h2 id="credit-dialog-title">
          {guestDemo ? 'Keep exploring ERiC' : 'Choose a credit pack'}
        </h2>
        <p>
          {guestDemo
            ? 'Add one simulated refill to this private demo workspace. No Shopify order or payment is created.'
            : live
              ? 'Pay in Shopify. ERiC verifies the paid order, creates an internal bill, and grants the matching credits once.'
              : 'No payment will be processed. Credits are added only to this browser session.'}
        </p>
      </div>

      {visibleError ? (
        <div className="credit-checkout-error" role="alert">
          <strong>Checkout is not ready</strong>
          <span>{visibleError}</span>
        </div>
      ) : null}

      <div className="credit-pack-list" aria-busy={busy}>
        {guestDemo ? (
          <button
            className="credit-card guest-refill-card"
            type="button"
            disabled={busy || (demoSession?.remainingRefills ?? 0) <= 0}
            onClick={() => void refillDemo()}
          >
            <strong>＋{(demoSession?.refillPoints ?? 200).toLocaleString()} demo credits</strong>
            <span>
              {(demoSession?.remainingRefills ?? 0) > 0
                ? 'One refill available in this guest workspace'
                : 'Demo refill already used'}
            </span>
            <b>$0</b>
          </button>
        ) : live ? (
          packs.map((pack) => (
            <button
              className="credit-card"
              key={pack.code}
              type="button"
              disabled={busy}
              onClick={() => void startCheckout(pack)}
            >
              <strong>{pack.points.toLocaleString()} credits</strong>
              <span>
                {pack.expireDays > 0
                  ? `Valid for ${pack.expireDays} days`
                  : 'Standard ERiC validity'}
              </span>
              <b>${pack.price}</b>
            </button>
          ))
        ) : (
          Object.values(creditPacks).map((pack) => (
            <button
              className="credit-card"
              key={pack.id}
              type="button"
              onClick={() => {
                onPurchase(pack.id);
                onClose();
              }}
            >
              <strong>{pack.name}</strong>
              <span>{pack.credits.toLocaleString()} prototype credits</span>
              <b>${pack.price}</b>
            </button>
          ))
        )}
      </div>

      {guestDemo && checkoutState === 'refilling' ? (
        <p className="credit-checkout-status" role="status">
          Adding demo credits to the ERiC ledger…
        </p>
      ) : guestDemo && notice ? (
        <p className="credit-checkout-status success" role="status">
          {notice}
        </p>
      ) : live && !guestDemo && !packsLoaded ? (
        <p className="credit-checkout-status" role="status">
          Loading server-approved packs…
        </p>
      ) : checkoutState === 'starting-checkout' ? (
        <p className="credit-checkout-status" role="status">
          Preparing an isolated Shopify checkout…
        </p>
      ) : checkoutState === 'redirecting' ? (
        <p className="credit-checkout-status" role="status">
          Opening secure Shopify Checkout…
        </p>
      ) : liveEmpty ? (
        <p className="credit-checkout-status" role="status">
          No credit packs are currently available. Contact ERiC support if this persists.
        </p>
      ) : null}

      <small className="dialog-note">
        {guestDemo
          ? 'Guest demo only · one refill · no payment · credits expire with this workspace'
          : live
            ? 'USD pricing · secure Shopify checkout · no product or cart changes · return to Workspace after payment'
            : 'Prototype only · No card details requested'}
      </small>
    </AppDialog>
  );
}
