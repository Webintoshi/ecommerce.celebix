"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { PublicCartLine } from "@celebix/saas-contracts";
import { storefrontCartClient } from "@/lib/cart/client.ts";
import { formatTry } from "@/lib/format.ts";
import { useCartStatus } from "./CartStatusProvider";

function CartLineControls({ line, version, disabled, onPending }: Readonly<{ line: PublicCartLine; version: number; disabled: boolean; onPending(value: boolean): void }>) {
  const { replaceCart, refresh } = useCartStatus();
  const [quantity, setQuantity] = useState(line.quantity);
  useEffect(() => setQuantity(line.quantity), [line.quantity]);
  const update = async () => { onPending(true); try { replaceCart(await storefrontCartClient.setQuantity({ variantId: line.variantId, quantity, expectedVersion: version })); } catch { await refresh(); } finally { onPending(false); } };
  const remove = async () => { onPending(true); try { replaceCart(await storefrontCartClient.remove({ variantId: line.variantId, expectedVersion: version })); } catch { await refresh(); } finally { onPending(false); } };
  return <div className="cart-line-controls"><label><span className="sr-only">{line.title} adedi</span><input type="number" min="1" max="99" value={quantity} disabled={disabled} onChange={(event) => setQuantity(Math.max(1, Math.min(99, Number(event.currentTarget.value) || 1)))} /></label><button type="button" disabled={disabled || quantity === line.quantity} onClick={() => void update()}>Adedi güncelle</button><button type="button" disabled={disabled} onClick={() => void remove()}>Sepetten çıkar</button></div>;
}

export function CartPageClient() {
  const { cart, loading, refresh } = useCartStatus();
  const [pending, setPending] = useState(false);
  if (loading && !cart) return <div className="store-empty" role="status"><span>◇</span><h2>Sepet yükleniyor</h2><p>Güncel ürünleriniz hazırlanıyor.</p></div>;
  if (!cart) return <div className="store-empty"><span>!</span><h2>Sepet yüklenemedi</h2><p>Lütfen bağlantınızı kontrol edip yeniden deneyin.</p><button className="store-button" type="button" onClick={() => void refresh()}>Tekrar dene</button></div>;
  if (cart.items.length === 0) return <div className="store-empty"><span>◇</span><h2>Sepetiniz boş</h2><p>Beğendiğiniz ürünleri sepetinize ekleyin.</p><Link className="store-button" href="/products">Ürünleri keşfet</Link></div>;
  return <div className="cart-layout"><section className="cart-lines" aria-label="Sepet ürünleri">{cart.items.map((line) => <article className="cart-line" key={line.variantId}>{line.media ? <img src={line.media.url} alt={line.media.altText || line.title} width={line.media.width ?? 120} height={line.media.height ?? 120} /> : <div className="cart-line-placeholder" aria-hidden="true">◇</div>}<div className="cart-line-copy"><Link href={`/products/${line.slug}`}>{line.title}</Link><span>{line.variantTitle}</span><strong>{formatTry(line.unitPriceCents)}</strong>{!line.available ? <em>Şu anda kullanılamıyor</em> : null}</div><CartLineControls line={line} version={cart.version} disabled={pending} onPending={setPending} /><strong className="cart-line-total">{formatTry(line.lineTotalCents)}</strong></article>)}</section><aside className="cart-summary"><span>SİPARİŞ ÖZETİ</span><h2>Sepet toplamı</h2><dl><div><dt>Ara toplam</dt><dd>{formatTry(cart.subtotalCents)}</dd></div><div><dt>Kargo</dt><dd>{cart.shippingCents === 0 ? "Ücretsiz" : formatTry(cart.shippingCents)}</dd></div><div><dt>Toplam</dt><dd>{formatTry(cart.totalCents)}</dd></div></dl>{cart.checkoutReady ? <Link className="store-button" href="/checkout">Ödemeye geç</Link> : <span className="cart-unavailable">Stok bilgilerini kontrol edin.</span>}<Link className="cart-continue" href="/products">Alışverişe devam et</Link></aside></div>;
}
