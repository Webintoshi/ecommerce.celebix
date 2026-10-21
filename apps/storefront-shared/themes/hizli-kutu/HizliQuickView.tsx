"use client";
import { useEffect, useRef, useState } from "react";
import { createDefaultStarterThemeComposition, type PublicProduct } from "@celebix/saas-contracts";
import { ProductVariantMediaProvider, useProductVariantMedia } from "../../components/ProductVariantMedia";
import { useCartStatus } from "../../components/CartStatusProvider";
import { HizliProductPurchase } from "./HizliProductPurchase";
import { HizliIcon } from "./HizliIcon";

const options = { ...createDefaultStarterThemeComposition().productDetail, showSku: false, mobileStickyPurchase: false };
function Media({ product }: { product: PublicProduct }) {
  const { images, selectedMediaId } = useProductVariantMedia(product);
  const image = images.find(image => image.id === selectedMediaId);
  return <div className="hk-quick-media">{image ? <img src={image.url} alt={image.altText || product.title} width={600} height={600} /> : <span className="hk-placeholder">Placeholder</span>}</div>;
}
export function HizliQuickView({ product }: { product: PublicProduct }) {
  const [open, setOpen] = useState(false);
  const { showQuantitySelector = true } = useCartStatus();
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), restore = useRef(true);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; element.showModal();
    return () => { element.close(); document.body.style.overflow = overflow; if (restore.current && trigger.current?.isConnected) trigger.current.focus(); };
  }, [open]);
  const transition = async () => {
    restore.current = false; dialog.current?.close(); setOpen(false);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    return { proceed: Boolean(trigger.current?.isConnected), drawerTrigger: trigger.current };
  };
  return <><button className="product-card-cart is-options" type="button" ref={trigger} onClick={() => { restore.current = true; setOpen(true); }}>Ölçü ve paket seç</button>
    <dialog ref={dialog} className="hk-dialog hk-quick-dialog" aria-label={`${product.title} hızlı görünüm`} onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>{open ? <ProductVariantMediaProvider product={product} key={product.id}><button type="button" className="hk-quick-close" aria-label="Hızlı görünümü kapat" onClick={() => setOpen(false)}><HizliIcon name="close" /></button><div className="hk-quick-grid"><Media product={product} /><HizliProductPurchase product={product} options={options} quickView showQuantitySelector={showQuantitySelector} beforePurchaseTransition={transition} /></div></ProductVariantMediaProvider> : null}</dialog>
  </>;
}
