import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  getListStorefrontProductsQueryKey,
  useListStorefrontProducts,
  type Product,
} from '@workspace/api-client-react';
import { ShopifyPrice } from '@/components/shopify-price';

type ProductSearchSuggestionsProps = {
  id: string;
  search: string;
  open: boolean;
  onSelect: () => void;
};

export function ProductSearchSuggestions({
  id,
  search,
  open,
  onSelect,
}: ProductSearchSuggestionsProps) {
  const normalizedSearch = search.trim();
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (normalizedSearch.length < 2) {
      setDebouncedSearch('');
      return;
    }

    const timer = window.setTimeout(() => setDebouncedSearch(normalizedSearch), 180);
    return () => window.clearTimeout(timer);
  }, [normalizedSearch]);

  const params = useMemo(
    () => ({ first: 6, ...(debouncedSearch ? { query: debouncedSearch } : {}) }),
    [debouncedSearch],
  );
  const suggestionsQuery = useListStorefrontProducts(params, {
    query: {
      queryKey: getListStorefrontProductsQueryKey(params),
      enabled: open && debouncedSearch.length >= 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  });

  if (!open || normalizedSearch.length < 2) return null;

  const isWaitingForDebounce = normalizedSearch !== debouncedSearch;
  const products = isWaitingForDebounce ? [] : suggestionsQuery.data?.products ?? [];

  return (
    <div
      id={id}
      className="product-search-suggestions"
      role="listbox"
      aria-label="Product suggestions"
      aria-busy={isWaitingForDebounce || suggestionsQuery.isFetching}
      data-testid={`${id}-list`}
    >
      {isWaitingForDebounce || suggestionsQuery.isFetching ? (
        <div className="product-search-status" role="status">Searching products…</div>
      ) : suggestionsQuery.isError ? (
        <div className="product-search-status" role="status">Suggestions are temporarily unavailable.</div>
      ) : products.length ? (
        products.map((product: Product) => (
          <Link
            key={product.id}
            href={`/product/${product.handle}`}
            role="option"
            aria-selected="false"
            className="product-search-suggestion"
            onClick={onSelect}
            data-testid={`${id}-item`}
          >
            {product.featuredImage?.url ? (
              <img src={product.featuredImage.url} alt="" loading="lazy" />
            ) : (
              <span className="product-search-suggestion-image-placeholder" aria-hidden="true" />
            )}
            <span className="product-search-suggestion-copy">
              <strong>{product.title}</strong>
              <span><ShopifyPrice amount={product.priceRange.minVariantPrice} /></span>
            </span>
          </Link>
        ))
      ) : (
        <div className="product-search-status" role="status">No matching products yet.</div>
      )}
    </div>
  );
}
