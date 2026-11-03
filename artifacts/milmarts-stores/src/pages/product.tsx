import { ArrowLeft, Check, ChevronDown, Minus, Plus, RotateCw, ShoppingBag, Truck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { getGetStorefrontProductQueryKey, useGetStorefrontProduct } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ShopifyPrice } from '@/components/shopify-price';
import { useStorefrontCart } from '@/components/storefront-shell';

export default function Product() {
  const params = useParams<{ handle?: string }>();
  const handle = params.handle ?? '';
  const productQuery = useGetStorefrontProduct(handle, { query: { queryKey: getGetStorefrontProductQueryKey(handle), enabled: Boolean(handle), refetchInterval: 60_000, refetchOnWindowFocus: true } });
  const product = productQuery.data;
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const { addToCart, cartError, clearCartError } = useStorefrontCart();

  if (productQuery.isLoading) return <div className="marketplace-page"><div className="market-container product-page-loading" data-testid="loading-product"><Skeleton className="aspect-square bg-[hsl(var(--muted))]" /><div className="space-y-5 p-8"><Skeleton className="h-4 w-24 bg-[hsl(var(--muted))]" /><Skeleton className="h-10 w-4/5 bg-[hsl(var(--muted))]" /><Skeleton className="h-8 w-32 bg-[hsl(var(--muted))]" /></div></div></div>;

  if (productQuery.isError || !product) return <div className="marketplace-page"><div className="market-empty-state product-not-found" data-testid="error-product"><p>404 / Product not found</p><span>We couldn’t find this product. It may have sold out or moved to a new shelf.</span><div><Button variant="outline" onClick={() => productQuery.refetch()} data-testid="button-retry-product"><RotateCw className="h-4 w-4" /> Try again</Button><Button asChild><Link href="/shop" data-testid="button-product-browse">Browse the shop</Link></Button></div></div></div>;

  const images = product.images.length ? product.images : product.featuredImage ? [product.featuredImage] : [];
  const variant = product.variants[selectedVariant] ?? product.variants[0];
  const displayedPrice = variant?.price ?? product.priceRange.minVariantPrice;
  const maxQuantity = variant?.quantityAvailable && variant.quantityAvailable > 0 ? variant.quantityAvailable : 99;

  const addProduct = async () => {
    if (!variant?.availableForSale || isAdding) return;
    clearCartError();
    setIsAdding(true);
    try {
      const success = await addToCart({ merchandiseId: variant.id, quantity });
      if (success) {
        setAdded(true);
        window.setTimeout(() => setAdded(false), 2600);
      }
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="marketplace-page">
      <div className="market-container product-page">
        <div className="catalog-breadcrumb"><Link href="/">Home</Link><ChevronDown className="h-3 w-3 -rotate-90" /><Link href="/shop">Shop</Link><ChevronDown className="h-3 w-3 -rotate-90" /><span>{product.title}</span></div>
        <Link href="/shop" className="product-back-link" data-testid="link-back-shop"><ArrowLeft className="h-4 w-4" /> Back to shop</Link>
        <div className="product-detail-card">
          <div className="product-gallery-column">
            <div className="product-gallery-main" data-testid="product-gallery">
              {images[selectedImage] ? <img src={images[selectedImage].url} alt={images[selectedImage].altText || product.title} data-testid="img-product-detail" /> : <div className="market-hero-placeholder">{product.title}</div>}
            </div>
            <div className="product-thumbnails">
              {images.map((image, index) => <button key={image.url + index} onClick={() => setSelectedImage(index)} className={`product-thumbnail ${selectedImage === index ? 'is-active' : ''}`} aria-label={`View product image ${index + 1}`} data-testid={`button-product-image-${index}`}><img src={image.url} alt="" /></button>)}
            </div>
          </div>
          <div className="product-detail-info">
            <p className="product-kicker">Milmarts marketplace</p>
            <h1 data-testid="text-product-detail-title">{product.title}</h1>
            <p className="product-detail-price" data-testid="text-product-detail-price"><ShopifyPrice amount={displayedPrice} /></p>
            <p className={`product-stock ${variant?.availableForSale ? '' : 'is-unavailable'}`}>{variant?.availableForSale ? 'In stock' : 'Currently out of stock'}</p>
            <div className="product-divider" />
            {product.variants.length > 1 && <div className="product-options"><p>Choose an option</p><div>{product.variants.map((item, index) => <button key={item.id} onClick={() => { setSelectedVariant(index); setQuantity(1); }} disabled={!item.availableForSale} className={selectedVariant === index ? 'is-selected' : ''} data-testid={`button-variant-${item.id}`}>{item.title}</button>)}</div></div>}
            <div className="product-buy-row">
              <div className="product-quantity"><button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Decrease quantity" data-testid="button-decrease-quantity"><Minus className="h-4 w-4" /></button><span data-testid="text-product-quantity">{quantity}</span><button onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))} aria-label="Increase quantity" data-testid="button-increase-quantity"><Plus className="h-4 w-4" /></button></div>
              <Button className="product-add-button" onClick={addProduct} disabled={!variant?.availableForSale || isAdding} data-testid="button-add-to-cart">{isAdding ? 'Adding to cart' : added ? <><Check className="h-4 w-4" /> Added to cart</> : <><ShoppingBag className="h-4 w-4" /> Add to cart</>}</Button>
            </div>
            {cartError && <p className="product-error" data-testid="error-add-to-cart">{cartError}</p>}
            <div className="product-delivery-box"><div><Truck className="h-5 w-5" /><span><strong>Delivery</strong><small>Price confirmed after your order</small></span></div><ChevronDown className="h-4 w-4" /></div>
            <div className="product-detail-notes"><span>Secure payments</span><span>Easy returns</span><span>Live availability</span></div>
            <p className="product-description product-description--below" data-testid="text-product-description">{product.description || 'A well-chosen thing for everyday life.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}