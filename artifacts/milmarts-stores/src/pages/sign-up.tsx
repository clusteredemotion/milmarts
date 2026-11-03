import { type FormEvent, useState } from 'react';
import { ArrowRight, ShieldCheck, UserRound } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { AuthLayout } from './sign-in';

export default function SignUp() {
  const [, setLocation] = useLocation();
  const { signup, isLoading } = useAuth();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (form.password.length < 8) {
      setError('Your password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Your passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      await signup(form);
      setLocation('/account');
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : 'We could not create your account.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout eyebrow="Join Milmarts" title="Make every shopping trip feel easier." description="Create your free account to save your profile, fund your wallet, and move through checkout with less fuss.">
      <div className="auth-form-heading">
        <div className="auth-form-icon"><UserRound className="h-5 w-5" /></div>
        <div><p className="auth-form-kicker">Create your account</p><h1>Let’s get you set up</h1></div>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field-grid">
          <div><label className="auth-label" htmlFor="signup-first-name">First name</label><input className="auth-input" id="signup-first-name" value={form.firstName} onChange={(event) => update('firstName', event.target.value)} placeholder="Ada" autoComplete="given-name" required /></div>
          <div><label className="auth-label" htmlFor="signup-last-name">Last name</label><input className="auth-input" id="signup-last-name" value={form.lastName} onChange={(event) => update('lastName', event.target.value)} placeholder="Obi" autoComplete="family-name" required /></div>
        </div>
        <label className="auth-label" htmlFor="signup-phone">Phone number</label>
        <input className="auth-input" id="signup-phone" type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="+234 800 000 0000" autoComplete="tel" required />
        <label className="auth-label" htmlFor="signup-email">Email address</label>
        <input className="auth-input" id="signup-email" type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="you@example.com" autoComplete="email" required />
        <div className="auth-field-grid">
          <div><label className="auth-label" htmlFor="signup-password">Password</label><input className="auth-input" id="signup-password" type="password" value={form.password} onChange={(event) => update('password', event.target.value)} placeholder="8+ characters" autoComplete="new-password" minLength={8} required /></div>
          <div><label className="auth-label" htmlFor="signup-confirm-password">Confirm</label><input className="auth-input" id="signup-confirm-password" type="password" value={form.confirmPassword} onChange={(event) => update('confirmPassword', event.target.value)} placeholder="Repeat it" autoComplete="new-password" required /></div>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" type="submit" disabled={isSubmitting || isLoading}>{isSubmitting ? 'Creating your account…' : 'Create account'}<ArrowRight className="h-4 w-4" /></button>
      </form>
      <div className="auth-trust"><ShieldCheck className="h-4 w-4" /><span>We only use your details to improve your Milmarts experience.</span></div>
      <p className="auth-switch">Already have an account? <Link href="/login">Log in</Link></p>
    </AuthLayout>
  );
}