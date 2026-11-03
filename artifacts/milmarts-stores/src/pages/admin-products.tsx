import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { AlertCircle, Boxes, Check, ChevronLeft, ChevronRight, CirclePlus, ExternalLink, Image, LoaderCircle, PackagePlus, Pencil, Plus, RefreshCw, Search, ShieldAlert, ShoppingBag, Trash2, X } from "lucide-react";
import { Link } from "wouter";
import { getListAdminProductsQueryKey, useCreateAdminProduct, useDeleteAdminProduct, useImportAdminShopifyProducts, useListAdminProducts, useUpdateAdminProduct } from "@workspace/api-client-react";
import type { AdminProductInput, AdminProductUpdateInput, Product, ProductVariantInput } from "@workspace/api-client-react";
import { Form } from "@/components/ui/form";
import { STORE_CATEGORIES } from "@/lib/storefront";

const PAGE_SIZE = 20;
type VariantForm = { id?: string; title: string; amount: string; currencyCode: string; availableForSale: boolean; quantityAvailable: string };
type ProductForm = { title: string; handle: string; description: string; category: string; vendor: string; tags: string; imageUrls: string; isPublished: boolean; variants: VariantForm[] };

const blankVariant = (): VariantForm => ({ title: "Default Title", amount: "", currencyCode: "NGN", availableForSale: true, quantityAvailable: "" });
const blankForm = (): ProductForm => ({ title: "", handle: "", description: "", category: "", vendor: "", tags: "", imageUrls: "", isPublished: false, variants: [blankVariant()] });
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const errorMessage = (error: unknown) => {
  const err = error as { status?: number; response?: { status?: number; data?: { error?: string } }; message?: string };
  const status = err?.status ?? err?.response?.status;
  if (status === 401 || status === 403) return { permission: true, message: "Your staff session does not have permission to manage the catalog. Sign in with an admin account or ask the primary admin to review your access." };
  return { permission: false, message: err?.response?.data?.error || err?.message || "Something went wrong. Please try again." };
};
const money = (product: Product) => {
  const range = product.nairaPriceRange;
  const min = range?.minVariantPrice?.amount ?? product.priceRange?.minVariantPrice?.amount;
  const max = range?.maxVariantPrice?.amount ?? product.priceRange?.maxVariantPrice?.amount;
  const currency = range?.minVariantPrice?.currencyCode ?? product.priceRange?.minVariantPrice?.currencyCode ?? "NGN";
  if (!min) return "Price not set";
  const format = (amount: string) => new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(amount));
  return min === max ? format(min) : `${format(min)} – ${format(max ?? min)}`;
};

function ProductEditor({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: (message: string) => void }) {
  const queryClient = useQueryClient();
  const create = useCreateAdminProduct();
  const update = useUpdateAdminProduct();
  const [formError, setFormError] = useState("");
  const [handleTouched, setHandleTouched] = useState(Boolean(product));
  const isSaving = create.isPending || update.isPending;
  const form = useForm<ProductForm>({
    defaultValues: product ? {
      title: product.title, handle: product.handle, description: product.description ?? "", category: product.category,
      vendor: product.vendor ?? "", tags: (product.tags ?? []).join(", "),
      imageUrls: (product.images ?? []).map((image) => image.url).join("\n"), isPublished: product.isPublished,
      variants: (product.variants?.length ? product.variants : []).map((variant) => ({
        id: variant.id, title: variant.title, amount: variant.price.amount, currencyCode: variant.price.currencyCode,
        availableForSale: variant.availableForSale, quantityAvailable: variant.quantityAvailable == null ? "" : String(variant.quantityAvailable),
      })),
    } : blankForm(),
  });
  const variants = form.watch("variants");
  const title = form.watch("title");
  const onSubmit = form.handleSubmit(async (values) => {
    setFormError("");
    const parsedVariants: ProductVariantInput[] = values.variants.map((variant) => ({
      ...(variant.id ? { id: variant.id } : {}),
      title: variant.title.trim(),
      availableForSale: variant.availableForSale,
      ...(variant.quantityAvailable.trim() ? { quantityAvailable: Number(variant.quantityAvailable) } : {}),
      price: { amount: variant.amount, currencyCode: variant.currencyCode.trim().toUpperCase() },
    }));
    const images = values.imageUrls.split("\n").map((url) => url.trim()).filter(Boolean).map((url) => ({ url }));
    const payload = {
      title: values.title.trim(), handle: values.handle.trim() || slugify(values.title), description: values.description.trim(),
      category: values.category.trim(), vendor: values.vendor.trim(), tags: values.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      images, variants: parsedVariants, isPublished: values.isPublished,
    };
    try {
      if (product) await update.mutateAsync({ productId: Number(product.id), data: payload as AdminProductUpdateInput });
      else await create.mutateAsync({ data: payload as AdminProductInput });
      await queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });
      onSaved(product ? "Product changes saved to the local catalog." : "Product added to the local catalog.");
      onClose();
    } catch (error) { setFormError(errorMessage(error).message); }
  });
  const updateVariant = (index: number, key: keyof VariantForm, value: string | boolean) => {
    const next = [...(form.getValues("variants") ?? [])];
    next[index] = { ...next[index], [key]: value };
    form.setValue("variants", next, { shouldDirty: true, shouldValidate: true });
  };

  return <div className="catalog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) onClose(); }}>
    <section className="catalog-editor" role="dialog" aria-modal="true" aria-labelledby="catalog-editor-title" data-testid="dialog-product-editor">
      <header className="catalog-editor-head">
        <div><p className="admin-eyebrow">{product ? `Local record · #${product.id}` : "New local record"}</p><h2 id="catalog-editor-title">{product ? "Edit product" : "Add a product"}</h2><p>These details belong to the Milmarts shelf. Saving never writes back to Shopify.</p></div>
        <button type="button" className="catalog-icon-button" aria-label="Close editor" data-testid="button-close-product-editor" onClick={onClose} disabled={isSaving}><X /></button>
      </header>
      <Form {...form}>
        <form onSubmit={onSubmit} className="catalog-form" data-testid="form-product">
          <div className="catalog-form-section"><div className="catalog-section-title"><span>01</span><div><strong>Product details</strong><small>Core information customers browse</small></div></div>
            <div className="catalog-fields">
              <label className="catalog-field catalog-wide">Product title<input autoFocus maxLength={255} required placeholder="e.g. Coastal linen shirt" data-testid="input-product-title" {...form.register("title", { required: "Enter a product title." })} onChange={(event) => { form.setValue("title", event.target.value); if (!handleTouched) form.setValue("handle", slugify(event.target.value)); }} /></label>
              <label className="catalog-field">URL handle<div className="catalog-input-prefix"><span>/product/</span><input maxLength={255} placeholder={slugify(title) || "product-handle"} data-testid="input-product-handle" {...form.register("handle")} onChange={(event) => { setHandleTouched(true); form.setValue("handle", event.target.value); }} /></div></label>
              <label className="catalog-field">Category<select required data-testid="input-product-category" {...form.register("category", { required: "Choose a category." })}><option value="">Select a category</option>{STORE_CATEGORIES.map((category) => <option key={category.category} value={category.category}>{category.label}</option>)}{product && !STORE_CATEGORIES.some((category) => category.category === product.category) && <option value={product.category}>{product.category}</option>}</select></label>
              <label className="catalog-field">Brand / vendor<input maxLength={150} placeholder="Brand name" data-testid="input-product-vendor" {...form.register("vendor")} /></label>
              <label className="catalog-field catalog-wide">Description<textarea maxLength={10000} rows={4} placeholder="Useful details about the product…" data-testid="input-product-description" {...form.register("description")} /></label>
              <label className="catalog-field catalog-wide">Tags <small>Separate tags with commas</small><input placeholder="new arrival, essentials" data-testid="input-product-tags" {...form.register("tags")} /></label>
              <label className="catalog-field catalog-wide">Image URLs <small>One image URL per line, up to 20</small><textarea rows={3} placeholder="https://…" data-testid="input-product-images" {...form.register("imageUrls")} /></label>
            </div>
          </div>
          <div className="catalog-form-section"><div className="catalog-section-title"><span>02</span><div><strong>Variants & pricing</strong><small>Set the price and availability for each option</small></div></div>
            <div className="catalog-variants">
              {(variants ?? []).map((variant, index) => <div className="catalog-variant" key={index} data-testid={`product-variant-${index}`}>
                <div className="catalog-variant-head"><strong>Variant {String(index + 1).padStart(2, "0")}</strong>{variants.length > 1 && <button type="button" className="catalog-text-button is-danger" onClick={() => form.setValue("variants", variants.filter((_, itemIndex) => itemIndex !== index), { shouldDirty: true })} data-testid={`button-remove-variant-${index}`}><Trash2 /> Remove</button>}</div>
                <div className="catalog-fields variant-fields">
                  <label className="catalog-field">Label<input required maxLength={200} placeholder="Default" value={variant.title} onChange={(event) => updateVariant(index, "title", event.target.value)} data-testid={`input-variant-title-${index}`} /></label>
                  <label className="catalog-field">Price<input required type="number" min="0" step="0.01" placeholder="0.00" value={variant.amount} onChange={(event) => updateVariant(index, "amount", event.target.value)} data-testid={`input-variant-price-${index}`} /></label>
                  <label className="catalog-field">Currency<input required maxLength={3} minLength={3} placeholder="NGN" value={variant.currencyCode} onChange={(event) => updateVariant(index, "currencyCode", event.target.value.toUpperCase())} data-testid={`input-variant-currency-${index}`} /></label>
                  <label className="catalog-field">Quantity <small>Optional</small><input type="number" min="0" step="1" placeholder="Not tracked" value={variant.quantityAvailable} onChange={(event) => updateVariant(index, "quantityAvailable", event.target.value)} data-testid={`input-variant-quantity-${index}`} /></label>
                </div>
                <label className="catalog-check"><input type="checkbox" checked={variant.availableForSale} onChange={(event) => updateVariant(index, "availableForSale", event.target.checked)} data-testid={`check-variant-available-${index}`} /><span>Available for sale</span></label>
              </div>)}
              {variants.length < 100 && <button className="catalog-add-variant" type="button" onClick={() => form.setValue("variants", [...variants, { ...blankVariant(), title: "" }], { shouldDirty: true })} data-testid="button-add-variant"><Plus /> Add variant</button>}
            </div>
          </div>
          <div className="catalog-publish-row"><span className="catalog-publish-icon"><ShoppingBag /></span><div><strong>Visible on the storefront</strong><small>Unpublished records stay in the catalog but are hidden from customers.</small></div><label className="catalog-toggle"><input type="checkbox" {...form.register("isPublished")} data-testid="check-product-published" /><span aria-hidden="true" /></label></div>
          {formError && <p className="catalog-form-error" role="alert" data-testid="error-product-form"><AlertCircle />{formError}</p>}
          <footer className="catalog-editor-actions"><button type="button" className="admin-button" onClick={onClose} disabled={isSaving} data-testid="button-cancel-product">Cancel</button><button type="submit" className="admin-button admin-button--primary" disabled={isSaving} data-testid="button-save-product">{isSaving ? <><LoaderCircle className="catalog-spin" />Saving…</> : <><Check />{product ? "Save changes" : "Create product"}</>}</button></footer>
        </form>
      </Form>
    </section>
  </div>;
}

export default function AdminProducts() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [offset, setOffset] = useState(0);
  const [editorProduct, setEditorProduct] = useState<Product | null | undefined>(undefined);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [importSummary, setImportSummary] = useState<{ imported: number; skipped: number; total: number } | null>(null);
  const deleteDialogRef = useRef<HTMLElement>(null);
  const deletePendingRef = useRef(false);
  const initialImportStarted = useRef(false);
  const params = useMemo(() => ({ limit: PAGE_SIZE, offset, ...(search ? { search } : {}), ...(category ? { category } : {}) }), [offset, search, category]);
  const query = useListAdminProducts(params);
  const importMutation = useImportAdminShopifyProducts();
  const deleteMutation = useDeleteAdminProduct();
  const products = query.data?.products ?? [];
  const total = query.data?.total ?? 0;
  const categories = query.data?.categories ?? [];
  const permissionError = query.isError ? errorMessage(query.error) : null;
  deletePendingRef.current = deleteMutation.isPending;
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + products.length, total);

  useEffect(() => {
    if (!deleteProduct) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const panel = deleteDialogRef.current;
    const focusable = () => panel?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [];
    focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deletePendingRef.current) { setDeleteProduct(null); return; }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements[elements.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === elements[elements.length - 1]) { event.preventDefault(); elements[0].focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => previousFocus?.focus());
    };
  }, [deleteProduct]);

  const applySearch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setOffset(0); setSearch(searchInput.trim()); };
  const refresh = () => { void query.refetch(); };
  const importProducts = useCallback(async (automatic = false) => {
    setNotice(automatic
      ? { kind: "success", text: "Loading the currently published Shopify products into Milmarts…" }
      : null);
    setImportSummary(null);
    try {
      const result = await importMutation.mutateAsync();
      setImportSummary(result);
      setNotice({ kind: "success", text: `Import complete. ${result.imported} added; ${result.skipped} already in your catalog and left unchanged.` });
      await queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });
    } catch (error) { const issue = errorMessage(error); setNotice({ kind: "error", text: issue.message }); }
  }, [importMutation.mutateAsync, queryClient]);
  useEffect(() => {
    if (
      !query.data ||
      query.isLoading ||
      query.isError ||
      query.data.shopifyImportCompleted ||
      search ||
      category ||
      offset !== 0 ||
      initialImportStarted.current
    ) return;
    initialImportStarted.current = true;
    void importProducts(true);
  }, [query.data, query.isLoading, query.isError, search, category, offset, importProducts]);
  const confirmDelete = async () => {
    if (!deleteProduct) return;
    try {
      await deleteMutation.mutateAsync({ productId: Number(deleteProduct.id) });
      await queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });
      setNotice({ kind: "success", text: `${deleteProduct.title} was removed from the local catalog.` });
      setDeleteProduct(null);
    } catch (error) { setNotice({ kind: "error", text: errorMessage(error).message }); }
  };

  return <>
    <header className="admin-page-heading catalog-page-heading">
      <div><p className="admin-eyebrow">Operations / Product shelf</p><h1>Product catalog</h1><p>Keep the products customers actually browse and buy up to date. This catalog is owned locally by Milmarts.</p></div>
      <div className="catalog-heading-actions"><Link href="/shop" className="admin-button catalog-storefront-link" data-testid="link-customer-storefront"><ExternalLink /> View storefront</Link></div>
    </header>

    <section className="catalog-source-note" data-testid="notice-catalog-ownership"><span className="catalog-source-mark"><Boxes /></span><div><strong>Your shelf. Your call.</strong><p>Shopify import is a one-way starting point. Local edits, prices and deletions never update Shopify. Repeat imports add only new products and leave your existing Milmarts records untouched.</p></div><button className="admin-button catalog-import-button" type="button" onClick={() => void importProducts()} disabled={importMutation.isPending} data-testid="button-import-shopify">{importMutation.isPending ? <><LoaderCircle className="catalog-spin" />Importing…</> : <><RefreshCw />Import Shopify products</>}</button></section>

    {notice && <div className={`catalog-notice ${notice.kind === "error" ? "is-error" : ""}`} role={notice.kind === "error" ? "alert" : "status"} data-testid="status-catalog-operation"><span>{notice.kind === "error" ? <AlertCircle /> : <Check />}</span><div>{notice.text}{importSummary && <small data-testid="text-import-counts">{importSummary.imported} imported · {importSummary.skipped} skipped · {importSummary.total} published Shopify products checked</small>}</div><button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)} data-testid="button-dismiss-catalog-notice"><X /></button></div>}

    <section className="catalog-workspace" aria-label="Product catalog">
      <div className="catalog-workspace-top"><div><div className="catalog-title-line"><h2>All products</h2><span className="catalog-count" data-testid="text-product-total">{total.toLocaleString("en-NG")}</span></div><p>Published and unpublished local records</p></div><div className="catalog-workspace-actions"><button className="admin-button admin-button--primary" onClick={() => setEditorProduct(null)} type="button" data-testid="button-add-product"><CirclePlus />Add product</button></div></div>
      <div className="catalog-toolbar">
        <form className="catalog-search" onSubmit={applySearch}><Search aria-hidden="true" /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search title, brand, handle or tag" aria-label="Search products" data-testid="input-catalog-search" /><button type="submit" className="catalog-search-submit" data-testid="button-search-products">Search</button></form>
        <label className="catalog-category-filter"><span>Category</span><select value={category} onChange={(event) => { setCategory(event.target.value); setOffset(0); }} aria-label="Filter by category" data-testid="select-product-category"><option value="">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        {(search || category) && <button type="button" className="catalog-clear-filter" onClick={() => { setSearch(""); setSearchInput(""); setCategory(""); setOffset(0); }} data-testid="button-clear-filters"><X />Clear filters</button>}
      </div>

      {query.isLoading ? <div className="catalog-loading" aria-label="Loading products" data-testid="loading-products"><div className="catalog-skeleton-heading" /><div className="catalog-skeleton-row" /><div className="catalog-skeleton-row" /><div className="catalog-skeleton-row" /><div className="catalog-skeleton-row" /></div>
      : query.isError ? <div className="catalog-state catalog-error-state" role="alert" data-testid="error-products"><span><ShieldAlert /></span><p className="admin-eyebrow">{permissionError?.permission ? "Staff access required" : "Catalog unavailable"}</p><h3>{permissionError?.permission ? "You don’t have access to this shelf." : "We couldn’t load the catalog."}</h3><p>{permissionError?.message}</p><button type="button" className="admin-button" onClick={refresh} data-testid="button-retry-products"><RefreshCw />Try again</button></div>
      : products.length === 0 ? <div className="catalog-state catalog-empty-state" data-testid="empty-products"><span><PackagePlus /></span><p className="admin-eyebrow">{search || category ? "No matching records" : "A fresh shelf"}</p><h3>{search || category ? "Nothing matches these filters." : "Your local catalog is ready."}</h3><p>{search || category ? "Try a different search or clear the category filter." : "Import currently published Shopify products, or create a local product to get started."}</p>{search || category ? <button type="button" className="admin-button" onClick={() => { setSearch(""); setSearchInput(""); setCategory(""); setOffset(0); }} data-testid="button-empty-clear-filters">Clear filters</button> : <button className="admin-button admin-button--primary" onClick={() => setEditorProduct(null)} data-testid="button-empty-add-product"><Plus />Add your first product</button>}</div>
      : <>
        <div className="catalog-list" data-testid="list-products">
          <div className="catalog-list-header"><span>Product</span><span>Price range</span><span>Variants</span><span>Status</span><span>Source</span><span className="catalog-actions-heading">Actions</span></div>
          {products.map((product) => <article className="catalog-product-row" key={product.id} data-testid={`card-product-${product.id}`}>
            <div className="catalog-product-cell"><div className="catalog-product-image">{product.featuredImage?.url ? <img src={product.featuredImage.url} alt={product.featuredImage.altText || product.title} loading="lazy" data-testid={`img-product-${product.id}`} /> : <Image aria-hidden="true" />}</div><div className="catalog-product-info"><strong data-testid={`text-product-title-${product.id}`}>{product.title}</strong><span>{product.vendor || "No brand"} <i>·</i> {product.category || "Uncategorized"}</span><small>/{product.handle}</small></div></div>
            <div className="catalog-price-cell" data-testid={`text-product-price-${product.id}`}>{money(product)}<small>{product.variants?.length ?? 0} {(product.variants?.length ?? 0) === 1 ? "option" : "options"}</small></div>
            <div className="catalog-variant-cell" data-testid={`text-product-variants-${product.id}`}>{product.variants?.length ?? 0}</div>
            <div><span className={`catalog-status ${product.isPublished ? "is-published" : "is-draft"}`} data-testid={`status-product-${product.id}`}><i />{product.isPublished ? "Published" : "Unpublished"}</span></div>
            <div><span className={`catalog-source-tag ${product.source === "shopify" ? "is-shopify" : "is-manual"}`} data-testid={`text-product-source-${product.id}`}>{product.source === "shopify" ? "Shopify" : "Manual"}</span></div>
            <div className="catalog-row-actions"><button type="button" className="catalog-row-action" aria-label={`Edit ${product.title}`} onClick={() => setEditorProduct(product)} data-testid={`button-edit-product-${product.id}`}><Pencil /><span>Edit</span></button><button type="button" className="catalog-row-action is-delete" aria-label={`Delete ${product.title}`} onClick={() => setDeleteProduct(product)} data-testid={`button-delete-product-${product.id}`}><Trash2 /><span>Delete</span></button></div>
          </article>)}
        </div>
        <footer className="catalog-pagination"><span data-testid="text-pagination-range">Showing <strong>{start}–{end}</strong> of <strong>{total}</strong> products</span><div><button type="button" className="catalog-page-button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} aria-label="Previous page" data-testid="button-previous-page"><ChevronLeft /></button><span>Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span><button type="button" className="catalog-page-button" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)} aria-label="Next page" data-testid="button-next-page"><ChevronRight /></button></div></footer>
      </>}
    </section>
    <div className="catalog-footnote"><ShieldAlert /><span>Catalog edits are local to Milmarts. They do not update product records in Shopify.</span></div>
    {editorProduct !== undefined && <ProductEditor product={editorProduct} onClose={() => setEditorProduct(undefined)} onSaved={(text) => setNotice({ kind: "success", text })} />}
    {deleteProduct && <div className="catalog-overlay" role="presentation"><section ref={deleteDialogRef} className="catalog-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-product-title" aria-describedby="delete-product-copy" data-testid="dialog-confirm-delete"><span className="catalog-confirm-icon"><Trash2 /></span><p className="admin-eyebrow">Remove local record</p><h2 id="delete-product-title">Delete this product?</h2><p id="delete-product-copy"><strong>{deleteProduct.title}</strong> will be removed from the Milmarts catalog and storefront. This action does not delete or change anything in Shopify.</p><div className="catalog-editor-actions"><button className="admin-button" type="button" onClick={() => setDeleteProduct(null)} disabled={deleteMutation.isPending} data-testid="button-cancel-delete">Keep product</button><button className="admin-button admin-button--danger" type="button" onClick={confirmDelete} disabled={deleteMutation.isPending} data-testid="button-confirm-delete">{deleteMutation.isPending ? <><LoaderCircle className="catalog-spin" />Deleting…</> : <><Trash2 />Delete product</>}</button></div>{deleteMutation.isError && <p className="catalog-form-error" role="alert" data-testid="error-delete-product">{errorMessage(deleteMutation.error).message}</p>}</section></div>}
  </>;
}
