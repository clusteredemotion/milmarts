import { type FormEvent, type ReactNode, useState } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { AppBottomNav } from '@/components/app-bottom-nav';

export default function SignIn() {
  const [, setLocation] = useLocation();
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login(email, password);
      setLocation('/account');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'We could not log you in.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout eyebrow="Welcome back" title="Your everyday finds are waiting." description="Log in to keep your details, wallet, and Milmarts orders in one simple place.">
      <div className="auth-form-heading">
        <div className="auth-form-icon"><LockKeyhole className="h-5 w-5" /></div>
        <div><p className="auth-form-kicker">Member login</p><h1>Sign in to Milmarts</h1></div>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-label" htmlFor="login-email">Email address</label>
        <input className="auth-input" id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required />
        <label className="auth-label" htmlFor="login-password">Password</label>
        <input className="auth-input" id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" type="submit" disabled={isSubmitting || isLoading}>{isSubmitting ? 'Signing you in…' : 'Log in'}<ArrowRight className="h-4 w-4" /></button>
      </form>
      <div className="auth-trust"><ShieldCheck className="h-4 w-4" /><span>Your details are encrypted and kept private.</span></div>
      <p className="auth-switch">New to Milmarts? <Link href="/signup">Create an account</Link></p>
    </AuthLayout>
  );
}

export function AuthLayout({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-showcase">
        <Link href="/" className="auth-brand"><img src="/milmarts-wordmark.png" alt="Milmarts Stores" /></Link>
        <div className="auth-showcase-copy">
          <p className="auth-showcase-kicker">{eyebrow} · The good stuff, gathered.</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="auth-showcase-note"><span className="auth-showcase-dot" /><span>Shop useful. Live beautifully.</span></div>
      </section>
      <section className="auth-card-wrap">
        <div className="auth-card">{children}</div>
      </section>
      <AppBottomNav activeLabel="Account" />
    </main>
  );
}