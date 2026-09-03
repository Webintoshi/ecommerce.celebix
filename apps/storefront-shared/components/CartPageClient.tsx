"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { PublicCart, PublicCartLine } from "@celebix/saas-contracts";
import { storefrontCartClient } from "@/lib/cart/client.ts";
import { emitStorefrontCommerceEvent } from "@/lib/analytics/events.ts";
import { formatTry } from "@/lib/format.ts";
import { productIndexPath, productPath } from "@/lib/storefront-routes.ts";
import { useCartStatus } from "./CartStatusProvider";
import { checkoutBlockerMessage } from "./checkout-readiness";
import { useHydrated } from "./use-hydrated";

function CartLineControls({
  line,
  currency,
  version,
  disabled,
  onPending,
}: Readonly<{
  line: PublicCartLine;
  currency: PublicCart["currency"];
  version: number;
  disabled: boolean;
  onPending(value: boolean): void;
}>) {
  const { replaceCart, refresh } = useCartStatus();
  const [quantity, setQuantity] = useState(line.quantity);
  useEffect(() => setQuantity(line.quantity), [line.quantity]);
  const update = async () => {
    onPending(true);
    try {
      replaceCart(
        await storefrontCartClient.setQuantity({
          variantId: line.variantId,
          quantity,
          expectedVersion: version,
        }),
      );
    } catch {
      await refresh();
    } finally {
      onPending(false);
    }
  };
  const remove = async () => {
    onPending(true);
    try {
      replaceCart(
        await storefrontCartClient.remove({
          variantId: line.variantId,
          expectedVersion: version,
        }),
      );
      emitStorefrontCommerceEvent({
        name: "remove_from_cart",
        data: {
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          currency,
          valueMinor: line.lineTotalCents,
        },
      });
    } catch {
      await refresh();
    } finally {
      onPending(false);
    }
  };
  return (
    <div className="cart-line-controls">
      <label>
        <span className="sr-only">{line.title} adedi</span>
        <input
          type="number"
          min="1"
          max="99"
          value={quantity}
          disabled={disabled}
          onChange={(event) =>
            setQuantity(
              Math.max(1, Math.min(99, Number(event.currentTarget.value) || 1)),
            )
          }
        />
      </label>
      <button
        type="button"
        disabled={disabled || quantity === line.quantity}
        onClick={() => void update()}
      >
        Adedi güncelle
      </button>
      <button type="button" disabled={disabled} onClick={() => void remove()}>
        Sepetten çıkar
      </button>
    </div>
  );
}

export function CartPageClient({
  locale,
  recovered = false,
  omittedItems = 0,
  adjustedItems = 0,
}: Readonly<{
  locale: string;
  recovered?: boolean;
  omittedItems?: number;
  adjustedItems?: number;
}>) {
  const hydrated = useHydrated();
  const { cart, loading, refresh } = useCartStatus();
  const [pending, setPending] = useState(false);
  const visibleCart = hydrated ? cart : null;
  const visibleLoading = !hydrated || loading;
  useEffect(() => {
    if (visibleCart && visibleCart.items.length > 0)
      for (const line of visibleCart.items)
        emitStorefrontCommerceEvent({
          name: "view_cart",
          data: {
            productId: line.productId,
            variantId: line.variantId,
            ...(line.categoryId ? { categoryId: line.categoryId } : {}),
            quantity: line.quantity,
            currency: visibleCart.currency,
            valueMinor: line.lineTotalCents,
          },
        });
  }, [visibleCart]);
  if (visibleLoading && !visibleCart)
    return (
      <div className="store-empty" role="status">
        <span>◇</span>
        <h2>Sepet yükleniyor</h2>
        <p>Güncel ürünleriniz hazırlanıyor.</p>
      </div>
    );
  if (!visibleCart)
    return (
      <div className="store-empty">
        <span>!</span>
        <h2>Sepet yüklenemedi</h2>
        <p>Lütfen bağlantınızı kontrol edip yeniden deneyin.</p>
        <button
          className="store-button"
          type="button"
          onClick={() => void refresh()}
        >
          Tekrar dene
        </button>
      </div>
    );
  if (visibleCart.items.length === 0)
    return (
      <div className="store-empty">
        <span>◇</span>
        <h2>Sepetiniz boş</h2>
        <p>Beğendiğiniz ürünleri sepetinize ekleyin.</p>
        <Link className="store-button" href={productIndexPath(locale)}>
          Ürünleri keşfet
        </Link>
      </div>
    );
  const stockBlocker = visibleCart.checkoutBlocker === "stock_unavailable";
  const configurationBlocker =
    visibleCart.checkoutBlocker === "shipping_unavailable" ||
    visibleCart.checkoutBlocker === "payment_unavailable";
  const blockerMessage = checkoutBlockerMessage(visibleCart.checkoutBlocker);
  return (
    <>
      {recovered ? (
        <div className="cart-recovery-notice" role="status">
          <strong>Sepetiniz geri yüklendi.</strong>
          <span>
            Bazı ürünlerin fiyatı veya stok durumu güncellenmiş olabilir.
            {adjustedItems > 0
              ? ` ${adjustedItems} ürünün adedi mevcut stoğa göre azaltıldı.`
              : ""}
            {omittedItems > 0
              ? ` ${omittedItems} ürün artık sunulmadığı için eklenmedi.`
              : ""}
          </span>
        </div>
      ) : null}
      <div className="cart-layout">
        <section className="cart-lines" aria-label="Sepet ürünleri">
          {visibleCart.items.map((line) => (
            <article className="cart-line" key={line.variantId}>
              {line.media ? (
                <img
                  src={line.media.url}
                  alt={line.media.altText || line.title}
                  width={line.media.width ?? 120}
                  height={line.media.height ?? 120}
                />
              ) : (
                <div className="cart-line-placeholder" aria-hidden="true">
                  ◇
                </div>
              )}
              <div className="cart-line-copy">
                <Link href={productPath(locale, line.slug)}>{line.title}</Link>
                <span>{line.variantTitle}</span>
                <strong>{formatTry(line.unitPriceCents)}</strong>
                {!line.available ? <em>Şu anda kullanılamıyor</em> : null}
              </div>
              <CartLineControls
                line={line}
                currency={visibleCart.currency}
                version={visibleCart.version}
                disabled={pending}
                onPending={setPending}
              />
              <strong className="cart-line-total">
                {formatTry(line.lineTotalCents)}
              </strong>
            </article>
          ))}
        </section>
        <aside className="cart-summary">
          <span>SİPARİŞ ÖZETİ</span>
          <h2>Sepet toplamı</h2>
          <dl>
            <div>
              <dt>Ara toplam</dt>
              <dd>{formatTry(visibleCart.subtotalCents)}</dd>
            </div>
            <div>
              <dt>Kargo</dt>
              <dd>
                {visibleCart.shippingCents === 0
                  ? "Ücretsiz"
                  : formatTry(visibleCart.shippingCents)}
              </dd>
            </div>
            <div>
              <dt>Toplam</dt>
              <dd>{formatTry(visibleCart.totalCents)}</dd>
            </div>
          </dl>
          {blockerMessage ? (
            <span
              className={`cart-unavailable${configurationBlocker ? " is-configuration" : ""}`}
              role="status"
            >
              {blockerMessage}
            </span>
          ) : null}
          {!stockBlocker &&
          (visibleCart.checkoutReady || configurationBlocker) ? (
            <Link className="store-button" href="/checkout">
              {visibleCart.checkoutReady
                ? "Ödemeye geç"
                : "Ödeme durumunu görüntüle"}
            </Link>
          ) : null}
          <Link className="cart-continue" href={productIndexPath(locale)}>
            Alışverişe devam et
          </Link>
        </aside>
      </div>
    </>
  );
}
