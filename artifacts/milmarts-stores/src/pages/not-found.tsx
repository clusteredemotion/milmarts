import { ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-28 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--accent-foreground))]">404 / Wrong aisle</p>
      <h1 className="mt-5 font-display text-6xl font-semibold tracking-[-.08em]">Nothing here.</h1>
      <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">This page isn’t on our shelf. Let’s get you back to the good stuff.</p>
      <Link href="/" className="focus-ring mt-8 inline-flex items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-5 py-3 text-sm font-semibold text-[hsl(var(--primary-foreground))]" data-testid="link-not-found-home"><ArrowLeft className="h-4 w-4" /> Back home</Link>
    </div>
  );
}
