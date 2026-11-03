import { ClipboardList, Compass, Home as HomeIcon, UserRound } from 'lucide-react';
import { Link, useLocation } from 'wouter';

const LINKS = [
  { label: 'Home', href: '/', icon: HomeIcon },
  { label: 'Discover', href: '/shop', icon: Compass },
  { label: 'Orders', href: '/orders', icon: ClipboardList },
  { label: 'Account', href: '/account', icon: UserRound },
] as const;

export function AppBottomNav({ activeLabel }: { activeLabel?: string }) {
  const [location] = useLocation();

  return (
    <nav className="market-footer-menu" aria-label="App navigation">
      {LINKS.map(({ label, href, icon: Icon }) => {
        const isActive = activeLabel === label || (!activeLabel && (href === '/' ? location === href : location === href || location.startsWith(`${href}/`)));
        return (
          <Link href={href} key={label} className={`market-footer-menu-link ${isActive ? 'is-active' : ''}`} aria-current={isActive ? 'page' : undefined} data-testid={`footer-menu-${label.toLowerCase()}`}>
            <Icon className="h-4 w-4" /><span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}