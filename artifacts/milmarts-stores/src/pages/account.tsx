import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowRight, CreditCard, LogOut, Package, ShieldCheck, UserRound, WalletCards, X } from 'lucide-react';
import { Link } from 'wouter';
import { getListLocalOrdersQueryKey, useListLocalOrders } from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth';
import { PushNotificationSettings } from '@/components/push-notification-settings';

export default function Account() {
  const { isLoading, user, logout, refreshUser, startWalletFunding, reconcileWalletFunding } = useAuth();
  const ordersQuery = useListLocalOrders({ query: { queryKey: getListLocalOrdersQueryKey(), enabled: Boolean(user) } });
  const [amount, setAmount] = useState('5000');
  const [isFunding, setIsFunding] = useState(false);
  const [fundingMessage, setFundingMessage] = useState('');
  const [fundingError, setFundingError] = useState('');
  const [paymentSession, setPaymentSession] = useState<{ paymentUrl: string; txRef: string } | null>(null);

  const reconcileAndNotify = useCallback(async (txRef?: string) => {
    try {
      const creditedAmountKobo = await reconcileWalletFunding(txRef);
      if (creditedAmountKobo > 0) {
        setFundingError('');
        setFundingMessage(`₦${(creditedAmountKobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })} was added to your wallet.`);
        setPaymentSession(null);
        setIsFunding(false);
      }
      return creditedAmountKobo;
    } catch {
      return 0;
    }
  }, [reconcileWalletFunding]);

  useEffect(() => {
    const walletStatus = new URLSearchParams(window.location.search).get('wallet');
    if (!walletStatus) return;
    if (walletStatus === 'success') {
      setFundingMessage('Your wallet was funded successfully.');
      void refreshUser();
    }
    if (walletStatus === 'cancelled') setFundingMessage('Your payment was cancelled. No funds were added.');
    if (walletStatus === 'failed') setFundingError('We could not verify that payment. No funds were added.');
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
  }, [refreshUser]);

  useEffect(() => {
    if (user) void reconcileAndNotify();
  }, [user?.id, reconcileAndNotify]);

  useEffect(() => {
    if (!paymentSession) return;
    const delays = [4_000, 10_000, 20_000, 35_000];
    const timers = delays.map((delay) =>
      window.setTimeout(() => void reconcileAndNotify(paymentSession.txRef), delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [paymentSession?.txRef, reconcileAndNotify]);

  useEffect(() => {
    const handleWindowFocus = () => {
      if (user) void reconcileAndNotify(paymentSession?.txRef);
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [user?.id, paymentSession?.txRef, reconcileAndNotify]);

  useEffect(() => {
    const handlePaymentMessage = (event: MessageEvent<{ type?: string; status?: string }>) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'milmarts-wallet-payment') return;
      const txRef = paymentSession?.txRef;
      if (event.data.status === 'success') {
        setPaymentSession(null);
        setIsFunding(false);
        setFundingError('');
        setFundingMessage('Your wallet was funded successfully.');
        void refreshUser();
      } else if (event.data.status === 'cancelled') {
        setPaymentSession(null);
        setIsFunding(false);
        setFundingMessage('Your payment was cancelled. No funds were added.');
        void reconcileAndNotify(txRef);
      } else {
        setFundingMessage('');
        setFundingError('Payment status is still being checked. If your bank confirmed the charge, keep this dashboard open briefly.');
        void reconcileAndNotify(txRef);
      }
    };
    window.addEventListener('message', handlePaymentMessage);
    return () => window.removeEventListener('message', handlePaymentMessage);
  }, [paymentSession?.txRef, reconcileAndNotify, refreshUser]);

  if (isLoading) {
    return <div className="marketplace-page"><div className="market-container market-empty-page"><p className="market-section-kicker">Your dashboard</p><h1>Loading your dashboard…</h1></div></div>;
  }

  if (!user) {
    return (
      <div className="marketplace-page dashboard-page">
        <div className="market-container">
          <div className="dashboard-guest">
            <div className="dashboard-guest-copy">
              <div className="dashboard-guest-icon"><UserRound className="h-7 w-7" /></div>
              <p className="market-section-kicker">Your dashboard</p>
              <h1>Welcome to your better shopping day.</h1>
              <p>Sign in to see your wallet, profile, and Milmarts orders in one calm, simple space.</p>
              <div className="market-account-actions"><Link className="auth-submit auth-submit--compact" href="/login">Log in <ArrowRight className="h-4 w-4" /></Link><Link className="dashboard-outline-button" href="/signup">Create account</Link></div>
            </div>
            <div className="dashboard-guest-card">
              <p className="dashboard-card-label">Members get more</p>
              <h2>Keep the good stuff close.</h2>
              <div className="dashboard-guest-benefit"><WalletCards className="h-5 w-5" /><span>Fund and manage your Milmarts wallet</span></div>
              <div className="dashboard-guest-benefit"><Package className="h-5 w-5" /><span>Keep your orders and details together</span></div>
              <div className="dashboard-guest-benefit"><ShieldCheck className="h-5 w-5" /><span>Check out faster next time</span></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="marketplace-page dashboard-page">
      <div className="market-container">
        <div className="dashboard-header">
          <div className="dashboard-hero-copy">
            <p className="market-section-kicker">Milmarts dashboard</p>
            <h1>Good morning, {user.firstName}.</h1>
            <p>Everything you need for your next great find, in one place.</p>
          </div>
          <div className="dashboard-header-actions">
            <div className="dashboard-avatar" aria-hidden="true">{user.firstName[0]}{user.lastName[0]}</div>
            <button className="dashboard-logout" type="button" onClick={() => void logout()}><LogOut className="h-4 w-4" /> Log out</button>
          </div>
        </div>
        <div className="dashboard-grid">
          <section className="dashboard-wallet-card">
            <div className="dashboard-wallet-top"><div><span className="dashboard-card-label">Milmarts wallet</span><p className="dashboard-wallet-title">Ready when you are.</p></div><div className="dashboard-wallet-mark"><WalletCards className="h-6 w-6" /></div></div>
            <p className="dashboard-wallet-balance">₦{(user.walletBalanceKobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</p>
            <p className="dashboard-wallet-caption">Available balance</p>
            <div className="dashboard-wallet-actions"><button className="dashboard-light-button" type="button" onClick={() => document.getElementById('fund-wallet')?.scrollIntoView({ behavior: 'smooth' })}>Fund wallet <ArrowRight className="h-4 w-4" /></button><span>Secure account credit</span></div>
          </section>
          <div className="dashboard-side-cards">
            <section className="dashboard-stat-card"><div className="dashboard-stat-icon"><Package className="h-5 w-5" /></div><div><p className="dashboard-card-label">Orders</p><strong>{ordersQuery.data?.orders.filter((order) => order.paymentStatus === 'paid').length ?? 0}</strong></div><Link href="/orders">View order history <ArrowRight className="h-4 w-4" /></Link></section>
            <section className="dashboard-stat-card dashboard-stat-card--quiet"><div className="dashboard-stat-icon"><ShieldCheck className="h-5 w-5" /></div><div><p className="dashboard-card-label">Account status</p><strong>Active</strong></div><span>Ready for faster checkout</span></section>
          </div>
        </div>
        <div className="dashboard-content-grid">
          <section className="dashboard-panel" id="fund-wallet">
            <div className="dashboard-panel-heading">
              <div><p className="market-section-kicker">Wallet funding</p><h2>Add balance for your next order</h2></div>
              <CreditCard className="h-6 w-6" />
            </div>
            <p className="dashboard-panel-copy">Choose an amount to add to your Milmarts wallet. Flutterwave will open in a smaller secure window over this funding page, and we only credit your wallet after the payment is verified.</p>
            <div className="dashboard-amounts">
              {[5000, 10000, 25000].map((value) => (
                <button className={Number(amount) === value ? 'is-selected' : ''} key={value} type="button" onClick={() => setAmount(String(value))}>
                  ₦{value.toLocaleString('en-NG')}
                </button>
              ))}
            </div>
            <form className="dashboard-fund-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              setFundingError('');
              setFundingMessage('');
              setIsFunding(true);
              try {
                setPaymentSession(await startWalletFunding(Number(amount)));
              } catch (error) {
                setFundingError(error instanceof Error ? error.message : 'We could not start your Flutterwave payment.');
                setIsFunding(false);
              }
            }}>
              <input className="auth-input" type="number" min="100" max="500000" step="100" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Funding amount in Naira" />
              <button className="auth-submit auth-submit--fund" type="submit" disabled={isFunding}>
                {paymentSession ? 'Payment in progress…' : isFunding ? 'Opening Flutterwave…' : 'Continue to payment'}<ArrowRight className="h-4 w-4" />
              </button>
            </form>
            {fundingMessage && <p className="dashboard-success">{fundingMessage}</p>}
            {fundingError && <p className="auth-error">{fundingError}</p>}
          </section>
          <section className="dashboard-panel dashboard-profile-panel"><div className="dashboard-panel-heading"><div><p className="market-section-kicker">Your profile</p><h2>Account details</h2></div><UserRound className="h-6 w-6" /></div><div className="dashboard-profile-list"><div><span>Name</span><strong>{user.firstName} {user.lastName}</strong></div><div><span>Email</span><strong>{user.email}</strong></div><div><span>Phone</span><strong>{user.phone}</strong></div></div><Link className="dashboard-text-link" href="/orders">See your orders <ArrowRight className="h-4 w-4" /></Link></section>
        </div>
        <PushNotificationSettings />
        {paymentSession && (
          <div className="wallet-payment-overlay" role="presentation">
            <div className="wallet-payment-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-payment-title">
              <div className="wallet-payment-modal-header">
                <div><p className="market-section-kicker">Secure payment</p><h2 id="wallet-payment-title">Fund your Milmarts wallet</h2></div>
                <button className="wallet-payment-close" type="button" aria-label="Close payment window" onClick={() => {
                  const txRef = paymentSession.txRef;
                  setPaymentSession(null);
                  setIsFunding(false);
                  void reconcileAndNotify(txRef);
                }}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <iframe className="wallet-payment-frame" title="Flutterwave wallet payment" src={paymentSession.paymentUrl} allow="payment" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}