"use client";
import {RestockSubscriptionForm,useRestockAlertsConfig} from "../../components/RestockAlerts";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { PublicProduct, StarterProductDetailConfigV2 } from "@celebix/saas-contracts";
import { useCartStatus } from "../../components/CartStatusProvider";
import { FavoriteButton } from "../../components/FavoriteButton";
import { useProductVariantSelection } from "../../components/ProductVariantMedia";
import { useHydrated } from "../../components/use-hydrated";
import { addCartLineAndOpenDrawer, storefrontCartClient } from "@/lib/cart/client.ts";
import { emitStorefrontCommerceEvent } from "@/lib/analytics/events.ts";
import { formatTry } from "@/lib/format.ts";
import { productIndexPath } from "@/lib/storefront-routes.ts";
import { sioraColorGroups, sioraHasSameOptions, sioraNeedsOptionChoice, sioraOptionLabel, sioraVariantForColor } from "./product-options.ts";
import { sioraCatalogReturnRoute, useCatalogScrollRestoration } from "./useCatalogScrollRestoration";
import styles from "./siora-product-detail.module.css";

function BagIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6 8h12l1 12H5L6 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg>;
}
function Chevron() { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="m9 5 7 7-7 7" /></svg>; }

export function SioraProductPurchase({ product, storefrontId, locale, options, showQuantitySelector, sizeGuide, sizeGuideHeading = "Ölçü rehberi" }: Readonly<{
  product: PublicProduct; storefrontId: string; locale: string; options: StarterProductDetailConfigV2;
  showQuantitySelector: boolean; sizeGuide?: ReactNode; sizeGuideHeading?: string;
}>) {
  const router = useRouter();
  const restockConfig = useRestockAlertsConfig();
  const pathname = usePathname();
  const hydrated = useHydrated();
  const { cart, openDrawer, drawerOpen, replaceCart } = useCartStatus();
  const [selectedId, selectVariant] = useProductVariantSelection(product);
  const groups = sioraColorGroups(product);
  const selectedVariant = product.variants.find(({ id }) => id === selectedId);
  const group = groups.find(({ variants }) => variants.some(({ id }) => id === selectedId)) ?? groups[0];
  const needsChoice = group ? sioraNeedsOptionChoice(group) : false;
  const [choiceId, setChoiceId] = useState<string | null>(needsChoice && group?.variants.length !== 1 ? null : selectedId);
  const variant = group?.variants.find(({ id }) => id === choiceId) ?? (!needsChoice ? selectedVariant : undefined);
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState<"add" | "buy" | null>(null);
  const [status, setStatus] = useState("");
  const [modal, setModal] = useState<"options" | "guide" | null>(null);
  const [sticky, setSticky] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const modalTrigger = useRef<HTMLElement | null>(null);
  const selectorRef = useRef<HTMLButtonElement>(null);
  const purchaseRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const modalTitleId = useId();
  const quantityLimit = variant?.stockTracking ? Math.max(1, Math.min(99, variant.stockQuantity)) : 99;
  const available = product.available && Boolean(group?.variants.some(({ available }) => available));
  const canPurchase = available && (!variant || variant.available);
  const amount = variant?.priceCents ?? selectedVariant?.priceCents ?? product.priceCents;
  const prices = group?.variants.filter(({ available }) => available).map(({ priceCents }) => priceCents) ?? [];
  const priceText = !variant && prices.length && Math.min(...prices) !== Math.max(...prices)
    ? `${formatTry(Math.min(...prices))} – ${formatTry(Math.max(...prices))}` : formatTry(amount);
  const compareAt = variant?.compareAtCents ?? (!needsChoice ? product.compareAtCents : undefined);
  const cartCount = hydrated ? Math.min(999, cart?.itemCount ?? 0) : 0;

  useCatalogScrollRestoration(storefrontId, pathname, Boolean(modal || drawerOpen));
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    if (!options.mobileStickyPurchase || !purchaseRef.current) return;
    const observer = new IntersectionObserver(([entry]) => setSticky(entry.intersectionRatio < 1), { threshold: [0, 1] });
    observer.observe(purchaseRef.current);
    return () => observer.disconnect();
  }, [options.mobileStickyPurchase]);
  useEffect(() => {
    if (!modal || !dialogRef.current) return;
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [modal]);

  const openModal = (kind: "options" | "guide", trigger: HTMLElement) => { modalTrigger.current = trigger; setModal(kind); };
  const closeModal = () => dialogRef.current?.close();
  const afterClose = () => { setModal(null); modalTrigger.current?.focus({ preventScroll: true }); };
  const changeColor = (key: string) => {
    const nextGroup = groups.find((item) => item.key === key);
    if (!nextGroup) return;
    const next = sioraVariantForColor(nextGroup, variant);
    if (!next) return;
    selectVariant(next.id);
    const preserved = variant && sioraHasSameOptions(next, variant) && next.available;
    setChoiceId(preserved || !sioraNeedsOptionChoice(nextGroup) || nextGroup.variants.length === 1 ? next.id : null);
    setQuantity(1); setStatus("");
  };
  const run = async (kind: "add" | "buy", trigger: HTMLButtonElement) => {
    if (pending || !available) return;
    if (!variant) { openModal("options", selectorRef.current ?? trigger); setStatus("Lütfen bir beden seçin."); return; }
    if (!variant.available || quantity > quantityLimit) { setStatus("Bu seçenek şu anda mevcut değil. Başka bir seçenek seçebilirsiniz."); return; }
    setPending(kind); setStatus("");
    const requestRoute = `${window.location.pathname}${window.location.search}`;
    const stillOnProduct = () => mountedRef.current && requestRoute === `${window.location.pathname}${window.location.search}`;
    const data = { productId: product.id, variantId: variant.id, quantity, currency: product.currency, valueMinor: variant.priceCents * quantity, ...(product.primaryCategoryId ? { categoryId: product.primaryCategoryId } : {}) };
    try {
      if (kind === "add") {
        await addCartLineAndOpenDrawer({ productId: product.id, variantId: variant.id, quantity }, trigger, { add: storefrontCartClient.add, openDrawer: (opener) => { if (stillOnProduct() && opener?.isConnected) openDrawer(opener); }, replaceCart });
        emitStorefrontCommerceEvent({ name: "add_to_cart", data });
        if (stillOnProduct()) setStatus("Ürün sepete eklendi.");
      } else {
        replaceCart(await storefrontCartClient.add({ productId: product.id, variantId: variant.id, quantity }));
        emitStorefrontCommerceEvent({ name: "add_to_cart", data });
        if (!stillOnProduct()) return;
        emitStorefrontCommerceEvent({ name: "begin_checkout", data });
        router.push("/checkout");
      }
    } catch { if (stillOnProduct()) setStatus("İşlem tamamlanamadı. Lütfen yeniden deneyin."); }
    finally { if (stillOnProduct()) setPending(null); }
  };
  const hasSizes = group?.variants.some((item) => Object.keys(item.attributes).some((key) => ["beden", "size", "numara"].includes(key.toLocaleLowerCase("tr-TR"))));
  const choiceLabel = hasSizes ? "Beden" : "Seçenek";

  return <>
    <Link href={productIndexPath(locale)} className={styles.back} onClick={(event) => {
      if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && sioraCatalogReturnRoute(storefrontId) && window.history.length > 1) { event.preventDefault(); router.back(); }
    }}><span aria-hidden="true">←</span> GERİ</Link>
    <button type="button" className={styles.cart} aria-label={cartCount ? `Sepetim, ${cartCount} ürün` : "Sepetim"} onClick={(event) => openDrawer(event.currentTarget)}><BagIcon />{cartCount ? <span>{cartCount}</span> : null}</button>
    <section className={styles.purchase} aria-label="Ürün ve satın alma" data-siora-purchase>
      {options.showBrand && product.brand ? <Link className={styles.brand} href={`/search?q=${encodeURIComponent(product.brand.name)}`}>{product.brand.name}</Link> : null}
      <div className={styles.titleRow}><h1>{product.title}</h1><div className={styles.favorite}><FavoriteButton productId={product.id} productTitle={product.title} /></div></div>
      {options.showSku && selectedVariant?.sku ? <p className={styles.sku}>Ürün kodu: {selectedVariant.sku}</p> : null}
      {groups.some(({ label }) => label) ? <div className={styles.colors}><div className={styles.colorLabel}><span>Renk</span><span>{group?.label}</span></div><div className={styles.swatches} role="group" aria-label="Renk seçimi">{groups.map((item) => <button type="button" key={item.key} aria-label={`${item.label}${item.variants.some(({ available }) => available) ? "" : ", tükendi"}`} aria-pressed={item.key === group?.key} disabled={pending !== null} onClick={() => changeColor(item.key)}>{item.media ? <img src={item.media.url} alt="" width="66" height="66" loading="lazy" decoding="async" /> : <span>{item.label}</span>}</button>)}</div></div> : null}
      {needsChoice ? <button ref={selectorRef} className={styles.selector} type="button" disabled={pending !== null} onClick={(event) => openModal("options", event.currentTarget)} aria-haspopup="dialog"><span>{variant ? `${choiceLabel}: ${sioraOptionLabel(variant)}` : `${choiceLabel} seçin`}</span><Chevron /></button> : null}
      {sizeGuide ? <button type="button" className={styles.sizeHelp} onClick={(event) => openModal("guide", event.currentTarget)}><span aria-hidden="true">▱</span> {sizeGuideHeading}</button> : null}
      <div className={styles.price}>{compareAt && compareAt > amount ? <del>{formatTry(compareAt)}</del> : null}<span>{priceText}</span></div>
      {showQuantitySelector ? <div className={styles.quantity} aria-label="Adet seçimi"><span>Adet</span><button type="button" aria-label="Adedi azalt" disabled={pending !== null || quantity <= 1} onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><output aria-live="polite">{quantity}</output><button type="button" aria-label="Adedi artır" disabled={pending !== null || quantity >= quantityLimit} onClick={() => setQuantity(Math.min(quantityLimit, quantity + 1))}>+</button></div> : null}
      <div className={styles.actions} ref={purchaseRef}><button type="button" disabled={pending !== null || !canPurchase} onClick={(event) => void run("buy", event.currentTarget)}>{pending === "buy" ? "Hazırlanıyor…" : "Şimdi satın al"}</button><button type="button" disabled={pending !== null || !canPurchase} onClick={(event) => void run("add", event.currentTarget)}><BagIcon />{pending === "add" ? "EKLENİYOR…" : available ? "SEPETE EKLE" : "TÜKENDİ"}</button></div>
      <RestockSubscriptionForm product={product} variant={variant} />
      <p className={styles.status} aria-live="polite" role="status">{status}</p>
    </section>
    {options.mobileStickyPurchase ? <div className={styles.sticky} data-siora-sticky-purchase data-visible={sticky && !modal && !drawerOpen ? "true" : undefined} aria-hidden={!sticky || Boolean(modal || drawerOpen)}><span>{priceText}</span><button type="button" tabIndex={sticky && !modal && !drawerOpen ? 0 : -1} disabled={pending !== null || !canPurchase} onClick={(event) => void run("add", event.currentTarget)}><BagIcon />{pending === "add" ? "EKLENİYOR…" : available ? "SEPETE EKLE" : "TÜKENDİ"}</button></div> : null}
    <dialog ref={dialogRef} className={styles.dialog} data-modal={modal} aria-labelledby={modalTitleId} onClose={afterClose} onCancel={(event) => { event.preventDefault(); closeModal(); }}><header><h2 id={modalTitleId}>{modal === "guide" ? sizeGuideHeading : `${choiceLabel} seçin`}</h2><button type="button" aria-label="Pencereyi kapat" onClick={closeModal}>×</button></header>{modal === "guide" ? <div className={styles.guide}>{sizeGuide}</div> : <div className={styles.optionList}>{group?.variants.map((item) => <button type="button" key={item.id} disabled={(!item.available && !restockConfig?.enabled) || pending !== null} aria-pressed={item.id === choiceId} onClick={() => { selectVariant(item.id); setChoiceId(item.id); setQuantity(1); setStatus(""); closeModal(); }}><span>{sioraOptionLabel(item)}</span><small>{item.available ? formatTry(item.priceCents) : "Tükendi"}</small></button>)}</div>}</dialog>
  </>;
}
