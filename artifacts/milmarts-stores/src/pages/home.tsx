import { ArrowRight, BadgeCheck, ChevronRight, CircleCheck, Compass, RotateCw, ShieldCheck, Sparkles, Truck, Zap } from 'lucide-react';
import { Link } from 'wouter';
import { useEffect, useMemo, useState } from 'react';
import { getListStorefrontProductsQueryKey, useListStorefrontProducts, type Product } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { ProductCard } from '@/components/product-card';
import { Skeleton } from '@/components/ui/skeleton';
import { STORE_CATEGORIES } from '@/lib/storefront';

function HomeLoading() {
  return (
    <div className="market-product-grid" data-testid="loading-home">
      {Array.from({ length: 8 }).map((_, index) => <div className="market-product-card" key={index}><Skeleton className="aspect-square rounded-none bg-[hsl(var(--muted))]" /><div className="space-y-3 p-4"><Skeleton className="h-4 w-4/5 bg-[hsl(var(--muted))]" /><Skeleton className="h-5 w-2/5 bg-[hsl(var(--muted))]" /></div></div>)}
    </div>
  );
}

const promoTiles = [
  { label: 'New arrivals', copy: 'Meet your next favorite thing', tone: 'coral' },
  { label: 'Everyday deals', copy: 'Good value, no fuss', tone: 'yellow' },
  { label: 'Home upgrades', copy: 'Small changes, better days', tone: 'blue' },
  { label: 'Shop with ease', copy: 'Simple checkout, delivered', tone: 'mint' },
  { label: 'Milmarts picks', copy: 'Selected with care', tone: 'lilac' },
];

const CATEGORY_SHELF_CATEGORIES = STORE_CATEGORIES;

function categoryAnchorId(label: string) {
  return `category-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function compactHeroTitle(title: string) {
  const normalizedTitle = title.trim().replace(/\s+/g, ' ');
  if (normalizedTitle.length <= 32) return normalizedTitle;

  const shortenedTitle = normalizedTitle.slice(0, 31);
  const lastWordBoundary = shortenedTitle.lastIndexOf(' ');
  const visibleTitle = lastWordBoundary > 18 ? shortenedTitle.slice(0, lastWordBoundary) : shortenedTitle;
  return `${visibleTitle.trimEnd()}…`;
}

function CategoryShelf({ category, index }: { category: (typeof CATEGORY_SHELF_CATEGORIES)[number]; index: number }) {
  const params = useMemo(() => ({ first: 8, category: category.category }), [category.category]);
  const productsQuery = useListStorefrontProducts(params, {
    query: {
      queryKey: getListStorefrontProductsQueryKey(params),
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  });
  const products = productsQuery.data?.products ?? [];
  const headingId = categoryAnchorId(category.label);
  const isComputing = category.label === 'Computing';

  if (productsQuery.isLoading || productsQuery.isError || !products.length) return null;

  return (
    <section className={`market-section market-category-shelf ${isComputing ? 'market-category-shelf--computing' : ''}`} aria-labelledby={headingId} data-testid={`category-shelf-${index}`}>
      <div className="market-section-heading">
        <div><p className="market-section-kicker">Shop by category</p><h2 id={headingId}>{category.label}</h2></div>
        <Link href={`/shop?category=${encodeURIComponent(category.category)}`} className="market-see-all market-see-all--dark">View all <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <div className={isComputing ? 'market-product-grid' : 'market-product-row'} data-testid={`grid-category-${index}`}>
        {products.map((product, productIndex) => <ProductCard key={product.id} product={product} index={productIndex} />)}
      </div>
    </section>
  );
}

export default function Home() {
  const [cursor, setCursor] = useState<string>();
  const [products, setProducts] = useState<Product[]>([]);
  const [activeHeroSlide, setActiveHeroSlide] = useState(0);
  const [isHeroHovered, setIsHeroHovered] = useState(false);
  const [isHeroFocused, setIsHeroFocused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const params = useMemo(() => ({ first: 14, ...(cursor ? { after: cursor } : {}) }), [cursor]);
  const productsQuery = useListStorefrontProducts(params, { query: { queryKey: getListStorefrontProductsQueryKey(params), refetchInterval: 60_000, refetchOnWindowFocus: true } });
  useEffect(() => {
    if (!productsQuery.data) return;
    setProducts((current) => {
      if (!cursor) return productsQuery.data.products;
      const firstProductId = productsQuery.data.products[0]?.id;
      if (!firstProductId || current.some((product) => product.id === firstProductId)) return current;
      return [...current, ...productsQuery.data.products];
    });
    setHasMoreProducts(productsQuery.data.hasNextPage);
    setNextCursor(productsQuery.data.nextCursor);
  }, [cursor, productsQuery.data]);

  const productHeroSlides = products.slice(0, 5).map((product) => {
    const description = product.description.trim().replace(/\s+/g, ' ');
    const fullTitle = product.title.trim().replace(/\s+/g, ' ');
    return {
      id: `product-${product.id}`,
      title: compactHeroTitle(fullTitle),
      fullTitle,
      copy: description ? `${description.slice(0, 112)}${description.length > 112 ? '…' : ''}` : 'Explore this everyday find and more from Milmarts.',
      image: product.featuredImage?.url ?? product.images[0]?.url,
      imageAlt: product.featuredImage?.altText ?? fullTitle,
      eyebrow: 'Featured from the shelf',
    };
  });
  const fallbackHeroSlides = promoTiles.map((tile, index) => ({
    id: `promo-${index}`,
    title: tile.label,
    fullTitle: tile.label,
    copy: tile.copy,
    image: undefined,
    imageAlt: tile.label,
    eyebrow: 'Milmarts everyday edit',
  }));
  const heroSlides = productHeroSlides.length >= 2
    ? productHeroSlides
    : [...productHeroSlides, ...fallbackHeroSlides].slice(0, 5);
  const currentHeroSlide = heroSlides[activeHeroSlide] ?? heroSlides[0];
  const isHeroPaused = isHeroHovered || isHeroFocused;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    setActiveHeroSlide((current) => current % heroSlides.length);
  }, [heroSlides.length]);

  useEffect(() => {
    if (isHeroPaused || prefersReducedMotion || heroSlides.length < 2) return;
    const interval = window.setInterval(() => {
      setActiveHeroSlide((current) => (current + 1) % heroSlides.length);
    }, 4000);
    return () => window.clearInterval(interval);
  }, [activeHeroSlide, heroSlides.length, isHeroPaused, prefersReducedMotion]);

  return (
    <div className="marketplace-page">
      <div className="market-container marketplace-content">
        <div className="market-hero-layout">
          <aside className="market-category-rail" aria-label="Shop by category">
            <div className="market-section-kicker">Shop by category</div>
            <div className="market-category-list">
              {STORE_CATEGORIES.map((category, index) => <Link key={category.label} href={`/shop?category=${encodeURIComponent(category.category)}`} className="market-rail-link" data-testid={`home-category-${index}`}><span>{category.label}</span><ChevronRight className="h-4 w-4" /></Link>)}
            </div>
            <Link href="/shop" className="market-rail-see-all">See all categories <ArrowRight className="h-4 w-4" /></Link>
          </aside>

          <section
            className="market-hero-banner"
            aria-label="Milmarts featured collection"
            onPointerEnter={() => setIsHeroHovered(true)}
            onPointerLeave={() => setIsHeroHovered(false)}
            onFocusCapture={() => setIsHeroFocused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsHeroFocused(false);
            }}
          >
            {currentHeroSlide.image ? (
              <img key={currentHeroSlide.id} src={currentHeroSlide.image} alt={currentHeroSlide.imageAlt} data-testid="img-hero-product" />
            ) : (
              <div key={currentHeroSlide.id} className="market-hero-placeholder" data-testid="empty-hero-catalog">{currentHeroSlide.title}</div>
            )}
            <div className="market-hero-overlay" />
            <div className="market-hero-content">
              <div className="market-hero-eyebrow"><Sparkles className="h-4 w-4" /> {currentHeroSlide.eyebrow}</div>
              <h1
                key={`title-${currentHeroSlide.id}`}
                aria-label={currentHeroSlide.fullTitle}
                title={currentHeroSlide.fullTitle}
              >
                {currentHeroSlide.title}
              </h1>
              <p key={`copy-${currentHeroSlide.id}`}>{currentHeroSlide.copy}</p>
              <Button asChild className="market-hero-button"><Link href="/shop" data-testid="button-hero-shop">Shop now <ArrowRight className="h-4 w-4" /></Link></Button>
            </div>
            <div className="market-hero-pagination" aria-label="Choose a featured slide">
              {heroSlides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  className={index === activeHeroSlide ? 'is-active' : ''}
                  aria-label={`Show slide ${index + 1}: ${slide.title}`}
                  aria-current={index === activeHeroSlide ? 'true' : undefined}
                  onClick={() => setActiveHeroSlide(index)}
                />
              ))}
            </div>
          </section>

          <aside className="market-side-promo">
            <div className="market-side-promo-shine" />
            <p className="market-section-kicker">The Milmarts difference</p>
            <h2>Find a little more good.</h2>
            <p className="market-side-copy">Browse practical picks, fresh arrivals, and the things you didn’t know you needed.</p>
            <Link href="/shop" className="market-side-link">Explore the shelf <ArrowRight className="h-4 w-4" /></Link>
            <div className="market-side-mark">M</div>
          </aside>
        </div>

        <section className="market-section market-recommendations">
          <div className="market-section-heading"><div><p className="market-section-kicker">More to explore</p><h2>Keep browsing</h2></div><Link href="/shop" className="market-see-all market-see-all--dark">View everything <ArrowRight className="h-4 w-4" /></Link></div>
          {products.length > 6 && <div className="market-product-grid">{products.slice(6).map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div>}
          {hasMoreProducts && <div className="market-load-more-wrap"><Button variant="outline" className="market-load-more-button" onClick={() => { if (nextCursor) setCursor(nextCursor); }} disabled={productsQuery.isFetching || !nextCursor} data-testid="button-load-more-home-products">{productsQuery.isFetching ? <RotateCw className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4 rotate-90" />} {productsQuery.isFetching ? 'Loading more products' : 'Load more products'}</Button>{productsQuery.isError && <span className="market-load-more-error">We couldn’t load more products. Try again.</span>}</div>}
        </section>

        <section className="market-service-strip" aria-label="Store benefits">
          <article className="market-service-card">
            <div className="market-service-icon"><Truck className="h-5 w-5" /></div>
            <div className="market-service-copy"><small>01 / DELIVERY</small><strong>Fast delivery</strong><span>To wherever you are</span></div>
          </article>
          <article className="market-service-card">
            <div className="market-service-icon"><ShieldCheck className="h-5 w-5" /></div>
            <div className="market-service-copy"><small>02 / SECURITY</small><strong>Shop with confidence</strong><span>Secure Milmarts payments</span></div>
          </article>
          <article className="market-service-card">
            <div className="market-service-icon"><CircleCheck className="h-5 w-5" /></div>
            <div className="market-service-copy"><small>03 / SELECTION</small><strong>Curated products</strong><span>Only the good stuff</span></div>
          </article>
        </section>

        <section className="market-section market-flash-section" id="new-in">
          <div className="market-section-heading market-section-heading--light">
            <div><p className="market-section-kicker">Fresh from the shelf</p><h2>New arrivals</h2></div>
            <Link href="/shop" className="market-see-all">See all <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {productsQuery.isLoading && !products.length ? <HomeLoading /> : productsQuery.isError && !products.length ? (
            <div className="market-empty-state" data-testid="error-home-products"><p>The shelves are taking a minute.</p><span>We couldn’t load the latest products.</span><Button variant="outline" onClick={() => productsQuery.refetch()} data-testid="button-retry-home"><RotateCw className="h-4 w-4" /> Try again</Button></div>
          ) : products.length ? (
            <div className="market-product-row" data-testid="grid-featured-products">{products.slice(0, 6).map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div>
          ) : (
            <div className="market-empty-state" data-testid="empty-home-products"><p>A little breathing room.</p><span>The Milmarts catalog is empty for now. Check back soon for new finds.</span></div>
          )}
        </section>

        <section className="market-promo-row" aria-label="Featured collections">
          {promoTiles.map((tile) => <Link href="/shop" key={tile.label} className={`market-promo-tile market-promo-tile--${tile.tone}`}><span>{tile.label}</span><strong>{tile.copy}</strong><ArrowRight className="h-4 w-4" /></Link>)}
        </section>

        {CATEGORY_SHELF_CATEGORIES.map((category, index) => <CategoryShelf key={category.label} category={category} index={index} />)}

        <section className="market-why-section" id="our-edit">
          <div className="market-why-orbit market-why-orbit--one" />
          <div className="market-why-orbit market-why-orbit--two" />
          <div className="market-why-topline"><p className="market-section-kicker">Why Milmarts</p><span><span className="market-why-status-dot" />Thoughtful picks for everyday living</span></div>
          <div className="market-why-intro">
            <div><h2>Everything you need,<br /><em>nothing you don’t.</em></h2></div>
            <div className="market-why-intro-copy"><p>Shopping should feel like finding exactly what you were looking for — plus one lovely surprise.</p><Link href="/shop" className="market-why-link">Shop the edit <ArrowRight className="h-4 w-4" /></Link></div>
          </div>
          <div className="market-why-principles">
            <article className="market-why-card"><div className="market-why-card-top"><span>01</span><Compass className="h-5 w-5" /></div><h3>Useful first</h3><p>Every pick has a job to do, and a reason to earn its place in your home.</p><div className="market-why-card-footer"><span>Made to earn its place</span><BadgeCheck className="h-4 w-4" /></div></article>
            <article className="market-why-card"><div className="market-why-card-top"><span>02</span><Sparkles className="h-5 w-5" /></div><h3>Small discoveries</h3><p>Familiar categories, fresh perspective. The joy is finding the one you didn’t know to look for.</p><div className="market-why-card-footer"><span>A little unexpected</span><Sparkles className="h-4 w-4" /></div></article>
            <article className="market-why-card"><div className="market-why-card-top"><span>03</span><Zap className="h-5 w-5" /></div><h3>Easy does it</h3><p>A clear shopping experience, simple cart, and secure Flutterwave and wallet payments.</p><div className="market-why-card-footer"><span>Simple from start to finish</span><Zap className="h-4 w-4" /></div></article>
          </div>
        </section>

      </div>
    </div>
  );
}