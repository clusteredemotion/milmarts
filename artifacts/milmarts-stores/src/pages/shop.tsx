import { ChevronDown, RotateCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { getListStorefrontProductsQueryKey, useListStorefrontProducts, type Product } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProductCard } from '@/components/product-card';
import { ProductSearchSuggestions } from '@/components/product-search-suggestions';
import { Skeleton } from '@/components/ui/skeleton';
import { STORE_CATEGORIES } from '@/lib/storefront';

export default function Shop() {
  const [location] = useLocation();
  const urlSearch = useMemo(() => new URLSearchParams(location.split('?')[1] ?? '').get('search') ?? '', [location]);
  const urlCategory = useMemo(() => new URLSearchParams(location.split('?')[1] ?? '').get('category') ?? '', [location]);
  const [search, setSearch] = useState(urlSearch);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [submittedSearch, setSubmittedSearch] = useState(urlSearch);
  const [submittedCategory, setSubmittedCategory] = useState(urlCategory);
  const [cursor, setCursor] = useState<string>();
  const [products, setProducts] = useState<Product[]>([]);
  const params = useMemo(() => ({ first: 24, ...(submittedSearch ? { query: submittedSearch } : {}), ...(submittedCategory ? { category: submittedCategory } : {}), ...(cursor ? { after: cursor } : {}) }), [submittedSearch, submittedCategory, cursor]);
  const productsQuery = useListStorefrontProducts(params, { query: { queryKey: getListStorefrontProductsQueryKey(params), refetchInterval: cursor ? false : 60_000, refetchOnWindowFocus: true } });
  const hasNextPage = productsQuery.data?.hasNextPage ?? false;

  useEffect(() => {
    if (urlSearch === submittedSearch && urlCategory === submittedCategory) return;
    setSearch(urlSearch);
    setSubmittedSearch(urlSearch);
    setSubmittedCategory(urlCategory);
    setCursor(undefined);
  }, [submittedSearch, submittedCategory, urlSearch, urlCategory]);

  useEffect(() => {
    if (!productsQuery.data) return;
    setProducts((current) => {
      if (!cursor) return productsQuery.data.products;
      const firstProductId = productsQuery.data.products[0]?.id;
      if (!firstProductId || current.some((product) => product.id === firstProductId)) return current;
      return [...current, ...productsQuery.data.products];
    });
  }, [cursor, productsQuery.data]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCursor(undefined);
    setSubmittedSearch(search.trim());
    setSuggestionsOpen(false);
  };

  return (
    <div className="marketplace-page">
      <div className="market-container catalog-layout">
        <aside className="catalog-sidebar" aria-label="Shop categories">
          <div className="catalog-sidebar-heading">Categories</div>
          <div className="catalog-sidebar-links">
            <Link href="/shop" className={`catalog-sidebar-link ${!submittedSearch && !submittedCategory ? 'is-active' : ''}`} data-testid="shop-category-all"><span>All products</span><ChevronDown className="h-3.5 w-3.5 -rotate-90" /></Link>
            {STORE_CATEGORIES.map((category, index) => <Link key={category.label} href={`/shop?category=${encodeURIComponent(category.category)}`} className={`catalog-sidebar-link ${submittedCategory === category.category ? 'is-active' : ''}`} data-testid={`shop-category-${index}`}><span>{category.label}</span><ChevronDown className="h-3.5 w-3.5 -rotate-90" /></Link>)}
          </div>
          <div className="catalog-sidebar-note"><p>Shop with ease</p><span>Milmarts manages local prices and availability. Pay securely with Flutterwave or your wallet.</span></div>
        </aside>
        <main className="catalog-main">
          <div className="catalog-breadcrumb"><Link href="/">Home</Link><ChevronDown className="h-3 w-3 -rotate-90" /><span>Shop</span>{submittedCategory && <><ChevronDown className="h-3 w-3 -rotate-90" /><span>{submittedCategory}</span></>}{submittedSearch && <><ChevronDown className="h-3 w-3 -rotate-90" /><span>{submittedSearch}</span></>}</div>
          <div className="catalog-heading">
            <div><p className="market-section-kicker">The full shelf</p><h1>{submittedSearch ? `Results for “${submittedSearch}”` : submittedCategory || 'Shop all'}</h1><p className="catalog-description">Browse useful, beautiful, everyday things from the Milmarts catalog.</p></div>
            <form
              className="catalog-search"
              onSubmit={submitSearch}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setSuggestionsOpen(false);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSuggestionsOpen(false);
              }}
              data-testid="form-search-products"
            >
              <Search className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
              <Input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSuggestionsOpen(true);
                }}
                onFocus={() => setSuggestionsOpen(true)}
                placeholder="Search the shelf"
                className="h-10 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
                aria-autocomplete="list"
                aria-expanded={suggestionsOpen && search.trim().length >= 2}
                aria-controls="shop-product-search-suggestions"
                autoComplete="off"
                data-testid="input-search-products"
              />
              <ProductSearchSuggestions
                id="shop-product-search-suggestions"
                search={search}
                open={suggestionsOpen}
                onSelect={() => setSuggestionsOpen(false)}
              />
              {search && <button type="button" onClick={() => { setSearch(''); setSubmittedSearch(''); setCursor(undefined); }} className="grid h-8 w-8 place-items-center rounded-full" aria-label="Clear search" data-testid="button-clear-search"><X className="h-4 w-4" /></button>}
              <Button type="submit" size="sm" className="rounded-sm px-5" data-testid="button-submit-search">Search</Button>
            </form>
          </div>
          <div className="catalog-toolbar">
            <p data-testid="text-product-result-count">{productsQuery.isLoading && !products.length ? 'Loading products' : `Showing ${products.length}${hasNextPage ? '+' : ''} ${products.length === 1 ? 'product' : 'products'}`}</p>
            <button type="button" className="catalog-sort"><SlidersHorizontal className="h-4 w-4" /> Sort by: <strong>Curated</strong><ChevronDown className="h-4 w-4" /></button>
          </div>
          {productsQuery.isLoading && !products.length ? <div className="market-product-grid" data-testid="loading-shop">{Array.from({ length: 8 }).map((_, index) => <div className="market-product-card" key={index}><Skeleton className="aspect-square rounded-none bg-[hsl(var(--muted))]" /><div className="space-y-3 p-4"><Skeleton className="h-4 w-4/5 bg-[hsl(var(--muted))]" /><Skeleton className="h-5 w-2/5 bg-[hsl(var(--muted))]" /></div></div>)}</div> : productsQuery.isError && !products.length ? <div className="market-empty-state" data-testid="error-shop-products"><p>That shelf is out of reach.</p><span>There was a problem loading the catalog.</span><Button variant="outline" onClick={() => productsQuery.refetch()} data-testid="button-retry-shop"><RotateCw className="h-4 w-4" /> Try again</Button></div> : products.length ? <><div className="market-product-grid" data-testid="grid-shop-products">{products.map((product, index) => <ProductCard product={product} index={index} key={product.id} />)}</div>{hasNextPage && <div className="flex justify-center pt-12"><Button variant="outline" className="rounded-sm border-[hsl(var(--primary))] px-8" onClick={() => productsQuery.data?.nextCursor && setCursor(productsQuery.data.nextCursor)} disabled={productsQuery.isFetching} data-testid="button-load-more-products">{productsQuery.isFetching ? <RotateCw className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />} {productsQuery.isFetching ? 'Loading more' : 'Load more products'}</Button></div>}</> : <div className="market-empty-state" data-testid="empty-shop-products"><p>{submittedSearch ? `Nothing matched “${submittedSearch}”.` : 'The shelf is clear.'}</p><span>{submittedSearch ? 'Try a different word or browse the full edit.' : 'There are no products in the catalog yet. Check back soon.'}</span>{submittedSearch && <Button variant="outline" onClick={() => { setSearch(''); setSubmittedSearch(''); setCursor(undefined); }} data-testid="button-reset-search">Browse everything</Button>}</div>}
        </main>
      </div>
    </div>
  );
}