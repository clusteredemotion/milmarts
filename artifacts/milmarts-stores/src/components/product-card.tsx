import { Check, Heart, LoaderCircle, Plus } from 'lucide-react';
import { Link } from 'wouter';
import { useState } from 'react';
import type { Product } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { useStorefrontCart } from '@/components/storefront-shell';
import { ShopifyPrice } from '@/components/shopify-price';

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { addToCart } = useStorefrontCart();
  const [added, setAdded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const variant = product.variants[0];
  const image = product.featuredImage?.url ?? product.images[0]?.url;

  const handleAdd = async () => {
    if (!variant?.availableForSale || isAdding) return;
    setIsAdding(true);
    try {
      const success = await addToCart({ merchandiseId: variant.id, quantity: 1 });
      if (success) {
        setAdded(true);
        window.setTimeout(() => setAdded(false), 2200);
      }
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <article className={`market-product-card group animate-rise-in delay-${Math.min(index + 1, 4)}`} data-testid={`card-product-${product.id}`}>
      <div className="market-product-image-wrap">
        <Link href={`/product/${product.handle}`} className="focus-ring block" data-testid={`link-product-${product.id}`}>
          <div className="product-image-wrap relative aspect-[1/1] overflow-hidden rounded-none border-0 shadow-none">
          {image ? (
            <img src={image} alt={product.featuredImage?.altText || product.title} className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.045]" data-testid={`img-product-${product.id}`} />
          ) : (
            <div className="grid h-full place-items-center p-8 text-center font-sans text-sm text-[hsl(var(--muted-foreground))]" data-testid={`empty-image-${product.id}`}>{product.title}</div>
          )}
          <span className="market-product-badge">{variant?.availableForSale ? 'In stock' : 'Out of stock'}</span>
          <button type="button" className="market-wishlist" aria-label={`Save ${product.title}`} onClick={(event) => event.preventDefault()}><Heart className="h-4 w-4" /></button>
          </div>
        </Link>
      </div>
      <div className="market-product-info">
        <Link href={`/product/${product.handle}`} className="focus-ring market-product-title" data-testid={`text-product-title-${product.id}`}>{product.title}</Link>
        <div className="market-product-meta">
          <p className="market-product-price" data-testid={`text-product-price-${product.id}`}><ShopifyPrice minAmount={product.priceRange.minVariantPrice} maxAmount={product.priceRange.maxVariantPrice} /></p>
          <Button size="icon" className="market-add-button" onClick={handleAdd} disabled={!variant?.availableForSale || isAdding} aria-label={isAdding ? `Adding ${product.title} to bag` : added ? `${product.title} added to bag` : `Add ${product.title} to bag`} data-testid={`button-add-product-${product.id}`}>
            {added ? <Check className="h-4 w-4" /> : isAdding ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
        <p className={`market-stock-note ${variant?.availableForSale ? '' : 'is-unavailable'}`}>{variant?.availableForSale ? 'Available for delivery' : 'Currently unavailable'}</p>
      </div>
    </article>
  );
}
