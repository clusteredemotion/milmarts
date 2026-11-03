import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronDown, CircleHelp, Menu, Moon, Search, ShoppingBag, Store, Sun, UserRound, X } from 'lucide-react';
import type { Cart, CartLineInput } from '@workspace/api-client-react';
import { getGetStorefrontVisitorMarketQueryKey, useCreateStorefrontCart, useGetStorefrontVisitorMarket, useUpdateStorefrontCart } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { STORE_CATEGORIES } from '@/lib/storefront';
import { MillmartAiAssistant } from '@/components/millmart-ai-assistant';
import { useAuth } from '@/lib/auth';
import { AppBottomNav } from '@/components/app-bottom-nav';
import { PwaInstallButton } from '@/components/pwa-install-button';
import { ProductSearchSuggestions } from '@/components/product-search-suggestions';
import { VisitorCurrencyContext } from '@/lib/visitor-currency-context';

const MOBILE_NAV_LINKS = [
  { label: 'Shop all', href: '/shop' },
  { label: 'Tracking', href: '/tracking' },
  { label: 'New in', href: '/#new-in' },
  { label: 'Our edit', href: '/#our-edit' },
] as const;

function scrollToSection(sectionId: string) {
  window.requestAnimationFrame(() => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

type CartContextValue = {
  cart: Cart | null;
  addToCart: (line: CartLineInput) => Promise<boolean>;
  setLineQuantity: (merchandiseId: string, quantity: number) => Promise<void>;
  refreshCart: () => Promise<Cart | null>;
  clearCart: () => void;
  isUpdating: boolean;
  cartError: string | null;
  clearCartError: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = 'milmarts-cart';
const THEME_KEY = 'milmarts-theme';

function readDarkMode() {
  try {
    return window.localStorage.getItem(THEME_KEY) === 'dark';
  } catch {
    return false;
  }
}

function readStoredCart(): Cart | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Cart;
    if (!parsed || typeof parsed.id !== 'string' || !Array.isArray(parsed.lines)) return null;
    const lines = parsed.lines.filter(
      (line) =>
        line &&
        typeof line.merchandiseId === 'string' &&
        line.merchandiseId.startsWith('milmarts:') &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0,
    );
    if (lines.length !== parsed.lines.length) return null;
    return {
      ...parsed,
      lines,
      totalQuantity: lines.reduce((total, line) => total + line.quantity, 0),
    };
  } catch {
    return null;
  }
}

export function useStorefrontCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useStorefrontCart must be used inside StorefrontShell');
  return context;
}

export function StorefrontShell({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(readStoredCart);
  const cartRef = useRef(cart);
  const cartMutationQueue = useRef<Promise<void>>(Promise.resolve());
  const [cartError, setCartError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(readDarkMode);
  const { user } = useAuth();
  const createCart = useCreateStorefrontCart();
  const visitorMarketQuery = useGetStorefrontVisitorMarket({
    query: {
      queryKey: getGetStorefrontVisitorMarketQueryKey(),
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: true,
    },
  });
  const updateCart = useUpdateStorefrontCart();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    cartRef.current = cart;
    if (cart) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    else window.localStorage.removeItem(STORAGE_KEY);
  }, [cart]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      window.localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // Theme still applies for this session when storage is unavailable.
    }
  }, [darkMode]);

  const enqueueCartMutation = <T,>(operation: () => Promise<T>): Promise<T> => {
    const queuedOperation = cartMutationQueue.current.then(operation, operation);
    cartMutationQueue.current = queuedOperation.then(() => undefined, () => undefined);
    return queuedOperation;
  };
  const saveCart = (nextCart: Cart | null) => {
    cartRef.current = nextCart;
    setCart(nextCart);
  };

  const cartValue: CartContextValue = {
    cart,
    isUpdating: createCart.isPending || updateCart.isPending,
    cartError,
    clearCartError: () => setCartError(null),
    clearCart: () => {
      setCartError(null);
      saveCart(null);
    },
    addToCart: (line) => enqueueCartMutation(async () => {
      setCartError(null);
      try {
        const currentCart = cartRef.current;
        if (!currentCart) {
          const nextCart = await createCart.mutateAsync({ data: { lines: [line] } });
          saveCart(nextCart);
          return true;
        }
        const activeLines = currentCart.lines.filter((item) => item.quantity > 0);
        const existing = activeLines.find((item) => item.merchandiseId === line.merchandiseId);
        const lines: CartLineInput[] = activeLines.map((item) => ({
          merchandiseId: item.merchandiseId,
          quantity: item.merchandiseId === line.merchandiseId ? item.quantity + line.quantity : item.quantity,
        }));
        if (!existing) lines.push(line);
        const nextCart = await updateCart.mutateAsync({ data: { cartId: currentCart.id, lines } });
        saveCart(nextCart);
        return true;
      } catch {
        setCartError('We could not update your bag. Please try again.');
        return false;
      }
    }),
    setLineQuantity: (merchandiseId, quantity) => enqueueCartMutation(async () => {
      const currentCart = cartRef.current;
      if (!currentCart) return;
      setCartError(null);
      const lines = currentCart.lines
        .filter((item) =>
          item.merchandiseId === merchandiseId
            ? quantity > 0
            : item.quantity > 0,
        )
        .map((item) => ({
          merchandiseId: item.merchandiseId,
          quantity: item.merchandiseId === merchandiseId ? quantity : item.quantity,
        }));
      try {
        const nextCart = await updateCart.mutateAsync({ data: { cartId: currentCart.id, lines } });
        saveCart(nextCart);
      } catch {
        setCartError('Your bag did not update. Please try again.');
      }
    }),
    refreshCart: () => enqueueCartMutation(async () => {
      const currentCart = cartRef.current;
      if (!currentCart?.lines.length) return null;
      setCartError(null);
      try {
        const nextCart = await updateCart.mutateAsync({
          data: {
            cartId: currentCart.id,
            lines: currentCart.lines.map((line) => ({
              merchandiseId: line.merchandiseId,
              quantity: line.quantity,
            })),
          },
        });
        saveCart(nextCart);
        return nextCart;
      } catch {
        setCartError('The catalog changed while you were shopping. Review your bag and try again.');
        return null;
      }
    }),
  };

  const count = cart?.totalQuantity ?? 0;
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = search.trim();
    setSearchSuggestionsOpen(false);
    setLocation(query ? `/shop?search=${encodeURIComponent(query)}` : '/shop');
  };
  const handleSectionNavigation = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    setMobileOpen(false);
    const sectionId = href.split('#')[1];
    if (!sectionId) return;

    event.preventDefault();
    setLocation(href);
    scrollToSection(sectionId);
  };

  useEffect(() => {
    const sectionId = window.location.hash.slice(1);
    if (!sectionId) return;

    scrollToSection(sectionId);
  }, []);

  return (
    <VisitorCurrencyContext.Provider value={visitorMarketQuery.data ?? null}>
      <CartContext.Provider value={cartValue}>
        <div className="store-shell min-h-[100dvh]">
        <div className="market-topbar">
          <div className="market-container market-topbar-inner">
            <span className="market-topbar-link"><Store className="h-3.5 w-3.5" /> Sell on Milmarts</span>
            <span className="hidden sm:inline">Free delivery on selected orders</span>
            <span className="hidden md:inline">Need help? <a href="mailto:hello@milmarts.com">hello@milmarts.com</a></span>
            <PwaInstallButton />
          </div>
        </div>
        <header className="market-header sticky top-0 z-40">
          <div className="market-container market-header-main">
            <Link href="/" className="focus-ring market-logo-link" data-testid="link-home">
              <img src="/milmarts-wordmark.png" alt="Milmarts Stores" className="brand-logo brand-logo--header" />
            </Link>
            <form
              className="market-search"
              onSubmit={submitSearch}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setSearchSuggestionsOpen(false);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSearchSuggestionsOpen(false);
              }}
              data-testid="form-header-search"
            >
              <Search className="market-search-icon h-5 w-5" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSearchSuggestionsOpen(true);
                }}
                onFocus={() => setSearchSuggestionsOpen(true)}
                placeholder="Search products, brands and categories"
                aria-label="Search products, brands and categories"
                aria-autocomplete="list"
                aria-expanded={searchSuggestionsOpen && search.trim().length >= 2}
                aria-controls="header-product-search-suggestions"
                autoComplete="off"
                data-testid="input-header-search"
              />
              <ProductSearchSuggestions
                id="header-product-search-suggestions"
                search={search}
                open={searchSuggestionsOpen}
                onSelect={() => setSearchSuggestionsOpen(false)}
              />
              <button type="submit" data-testid="button-header-search">Search</button>
            </form>
            <div className="market-header-actions">
              <Link className="market-header-action hidden md:flex" href="/account"><UserRound className="h-5 w-5" /><span>{user?.firstName ?? 'Account'}</span><ChevronDown className="h-3.5 w-3.5" /></Link>
              <button className="market-header-action hidden lg:flex" type="button"><CircleHelp className="h-5 w-5" /><span>Help</span><ChevronDown className="h-3.5 w-3.5" /></button>
              <Link href="/cart" className="focus-ring market-cart-link" data-testid="link-cart">
                <ShoppingBag className="h-5 w-5" strokeWidth={1.8} />
                <span className="hidden sm:inline">Cart</span>
                <span className="market-cart-count" data-testid="text-cart-count">{count}</span>
              </Link>
              <button className="focus-ring market-menu-button md:hidden" type="button" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileOpen} aria-controls="mobile-navigation" data-testid="button-mobile-menu">
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <nav className="market-category-nav">
            <div className="market-container market-category-inner">
              {STORE_CATEGORIES.map((category) => <Link key={category.label} href={`/shop?category=${encodeURIComponent(category.category)}`} className={`focus-ring market-category-link ${location.startsWith('/shop?category=') && new URLSearchParams(location.split('?')[1] ?? '').get('category') === category.category ? 'is-active' : ''}`} data-testid={`link-category-${category.label.toLowerCase().replaceAll(' ', '-')}`}>{category.label}</Link>)}
              <Link href="/tracking" className={`focus-ring market-category-link ${location === '/tracking' ? 'is-active' : ''}`} data-testid="link-tracking">Tracking</Link>
            </div>
          </nav>
          {mobileOpen && (
            <nav id="mobile-navigation" className="market-mobile-nav md:hidden" aria-label="Mobile navigation">
              <div className="market-container market-mobile-links">
                {MOBILE_NAV_LINKS.map((link) => <Link key={link.label} href={link.href} onClick={(event) => handleSectionNavigation(event, link.href)} data-testid={`mobile-link-${link.label.toLowerCase().replaceAll(' ', '-')}`}>{link.label}</Link>)}
              </div>
            </nav>
          )}
        </header>
        <main>{children}</main>
        <footer className="market-footer">
          <div className="market-container market-footer-grid">
            <div>
              <img src="/milmarts-wordmark.png" alt="Milmarts Stores" className="brand-logo brand-logo--footer" />
              <p className="market-footer-copy">The good stuff, gathered. A simple place to find useful, beautiful, everyday upgrades.</p>
            </div>
            <div>
              <p className="market-footer-heading">Let us help you</p>
              <div className="market-footer-links">
                <Link href="/shop" data-testid="footer-link-shop">Shop all</Link>
                <Link href="/cart" data-testid="footer-link-cart">Your bag</Link>
                <Link href="/tracking" data-testid="footer-link-tracking">Track your order</Link>
                <a href="mailto:hello@milmarts.com">Contact us</a>
              </div>
            </div>
            <div>
              <p className="market-footer-heading">About Milmarts</p>
              <div className="market-footer-links"><Link href="/#our-edit" onClick={(event) => handleSectionNavigation(event, '/#our-edit')}>Our edit</Link><Link href="/#new-in" onClick={(event) => handleSectionNavigation(event, '/#new-in')}>New arrivals</Link><span>Secure local payments</span></div>
            </div>
          </div>
          <p className="market-container market-currency-disclosure">
            Your IP country selects the display currency. Converted prices are estimates; Milmarts charges in Nigerian Naira.
            Rates are updated daily by{" "}
            <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">
              ExchangeRate-API
            </a>{" "}
            and country lookup is provided by{" "}
            <a href="https://ipwho.is" target="_blank" rel="noreferrer">
              IPWho.is
            </a>
            .
          </p>
          <AppBottomNav />
          <div className="market-footer-bottom">
            <div className="market-container">
              <span>© 2026 Milmarts Stores</span>
              <span>Made for the everyday</span>
            </div>
          </div>
        </footer>
        <button className="market-theme-toggle market-theme-toggle--floating" type="button" onClick={() => setDarkMode((value) => !value)} aria-pressed={darkMode} aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} data-testid="button-theme-toggle">
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <MillmartAiAssistant />
        </div>
      </CartContext.Provider>
    </VisitorCurrencyContext.Provider>
  );
}