"use client";
import { useCommercePolicy } from "./CommercePolicyProvider";
import { WhatsAppOrderButton } from "./WhatsAppOrderButton";
import { PurchaseActionLayout } from "./PurchaseActionLayout";
import {RestockSubscriptionForm,useRestockAlertsConfig} from "./RestockAlerts";

import { ezmeoVariantHeading, ezmeoVariantTitle } from "../themes/ezmeo/variant-labels.ts";
import { useState } from "react";
import { useRouter } from "next/navigation";

import type { PublicProduct } from "@celebix/saas-contracts";
import {
  addCartLineAndOpenDrawer,
  storefrontCartClient,
} from "@/lib/cart/client.ts";
import { formatTry } from "@/lib/format.ts";
import { variantStockLabel } from "./product-variant-status.ts";
import { emitStorefrontCommerceEvent } from "@/lib/analytics/events.ts";
import { useCartStatus } from "./CartStatusProvider";
import { useProductVariantSelection } from "./ProductVariantMedia";
import {
  decrementPurchaseQuantity,
  incrementPurchaseQuantity,
} from "./product-purchase-quantity.ts";

export function ProductPurchasePanel({
  product,
  mobileSticky = false,
  available,
  showQuantitySelector = true,
  showStockQuantity = true,
  beforePurchaseTransition,
}: Readonly<{
  product: PublicProduct;
  mobileSticky?: boolean;
  available: boolean;
  showQuantitySelector?: boolean;
  showStockQuantity?: boolean;
  beforePurchaseTransition?(kind: "add" | "buy"): Promise<Readonly<{ proceed: boolean; drawerTrigger?: HTMLElement | null }>>;
}>) {
  const router = useRouter();
  const policy = useCommercePolicy();
  const pricesHidden = policy.hidePrices || product.pricesHidden === true;
  const restockConfig = useRestockAlertsConfig();
  const { openDrawer, replaceCart, visualTheme } = useCartStatus();
  const compactChoices = visualTheme === "ezmeo-deniz";
  const [selectedId, setSelectedId] = useProductVariantSelection(product);
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState<"add" | "buy" | null>(null);
  const [status, setStatus] = useState("");
  const variant = product.variants.find(({ id }) => id === selectedId);
  const quantityLimit = variant?.stockTracking
    ? Math.max(1, Math.min(99, variant.stockQuantity))
    : 99;
  const allowed =
    available &&
    Boolean(variant?.available) &&
    quantity >= 1 &&
    quantity <= quantityLimit;
  const showVariantChoices =
    product.variants.length > 1 ||
    product.variants.some(
      ({ title }) => title.trim().toLocaleLowerCase("tr-TR") !== "varsayılan",
    );

  const run = async (kind: "add" | "buy", trigger: HTMLButtonElement) => {
    if (policy.hideAddToCart || (kind === "buy" && !policy.checkoutAllowed) || !variant || !allowed || pending) {
      setStatus("Lütfen stokta olan bir varyant seçin.");
      return;
    }
    setPending(kind);
    setStatus("");
    try {
      if (kind === "add") {
        if (beforePurchaseTransition) {
          // A quick view finishes its own overlay before revealing the cart.
          replaceCart(await storefrontCartClient.add({ productId: product.id, variantId: variant.id, quantity }));
          const transition = await beforePurchaseTransition("add");
          if (transition.proceed) openDrawer(transition.drawerTrigger ?? trigger);
        } else {
          await addCartLineAndOpenDrawer(
            { productId: product.id, variantId: variant.id, quantity },
            trigger,
            { add: storefrontCartClient.add, openDrawer, replaceCart },
          );
        }
        if (!pricesHidden) emitStorefrontCommerceEvent({
          name: "add_to_cart",
          data: {
            productId: product.id,
            variantId: variant.id,
            ...(product.primaryCategoryId
              ? { categoryId: product.primaryCategoryId }
              : {}),
            quantity,
            currency: product.currency,
            ...(variant.priceCents === null ? {} : { valueMinor: variant.priceCents * quantity }),
          },
        });
        setStatus("Ürün sepete eklendi.");
      } else {
        replaceCart(
          await storefrontCartClient.add({
            productId: product.id,
            variantId: variant.id,
            quantity,
          }),
        );
        if (!pricesHidden) emitStorefrontCommerceEvent({
          name: "add_to_cart",
          data: {
            productId: product.id,
            variantId: variant.id,
            ...(product.primaryCategoryId
              ? { categoryId: product.primaryCategoryId }
              : {}),
            quantity,
            currency: product.currency,
            ...(variant.priceCents === null ? {} : { valueMinor: variant.priceCents * quantity }),
          },
        });
        if (beforePurchaseTransition && !(await beforePurchaseTransition("buy")).proceed) return;
        if (!pricesHidden) emitStorefrontCommerceEvent({
          name: "begin_checkout",
          data: {
            productId: product.id,
            variantId: variant.id,
            ...(product.primaryCategoryId
              ? { categoryId: product.primaryCategoryId }
              : {}),
            quantity,
            currency: product.currency,
            ...(variant.priceCents === null ? {} : { valueMinor: variant.priceCents * quantity }),
          },
        });
        router.push("/checkout");
      }
    } catch (error) {
      setStatus(error instanceof Error && error.message === "whatsapp_only" ? "Sipariş talebinizi WhatsApp üzerinden iletebilirsiniz. Sayfayı yenileyin." : "İşlem tamamlanamadı. Lütfen yeniden deneyin.");
    } finally {
      setPending(null);
    }
  };

  return (
    <section
      className={`purchase-panel${mobileSticky ? " is-mobile-sticky" : ""}`}
      aria-label={showVariantChoices ? undefined : "Satın alma"}
      aria-labelledby={
        showVariantChoices ? "purchase-variants-title" : undefined
      }
    >
      {showVariantChoices ? (
        <fieldset disabled={pending !== null}>
          <legend id="purchase-variants-title">{compactChoices ? ezmeoVariantHeading(product.variants.map(variant => variant.title)) : showStockQuantity ? "Varyant seçin" : "Beden / numara seçin"}</legend>
          <div className="purchase-variants" data-compact-variants={compactChoices || undefined}>
            {product.variants.map((variant) => (
              <label
                className={variant.available ? "" : "is-disabled"}
                key={variant.id}
              >
                <input
                  type="radio"
                  name="variant"
                  value={variant.id}
                  aria-label={compactChoices ? `${ezmeoVariantTitle(variant.title)}${variant.available ? "" : " · Tükendi"}` : undefined}
                  checked={selectedId === variant.id}
                  disabled={!variant.available && !restockConfig?.enabled}
                  onChange={() => {
                    setSelectedId(variant.id);
                    setQuantity(1);
                  }}
                />
                <span>
                  <b>{compactChoices ? ezmeoVariantTitle(variant.title) : variant.title}</b>
                  {!compactChoices ? <small>{variantStockLabel(variant, showStockQuantity)}</small> : null}
                </span>
                {!pricesHidden && !compactChoices ? <strong>{formatTry(variant.priceCents)}</strong> : null}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <PurchaseActionLayout className="purchase-actions" quantity={showQuantitySelector ? (
          <div className="purchase-quantity" aria-label="Adet seçimi">
            <button
              type="button"
              aria-label="Adedi azalt"
              disabled={pending !== null || quantity <= 1}
              onClick={() =>
                setQuantity((value) =>
                  decrementPurchaseQuantity(value, quantityLimit),
                )
              }
            >
              −
            </button>
            <output aria-live="polite" aria-label="Adet">
              {quantity}
            </output>
            <button
              type="button"
              aria-label="Adedi artır"
              disabled={pending !== null || quantity >= quantityLimit}
              onClick={() =>
                setQuantity((value) =>
                  incrementPurchaseQuantity(value, quantityLimit),
                )
              }
            >
              +
            </button>
          </div>
        ) : null}>
          {!policy.hideAddToCart ? <button
            className="store-button"
            data-purchase-action="add"
            type="button"
            disabled={pending !== null || !allowed}
            onClick={(event) => void run("add", event.currentTarget)}
          >
            {pending === "add" ? "Ekleniyor…" : "Sepete ekle"}
          </button> : null}
          {policy.checkoutAllowed ? <button
            className="store-button store-button-secondary"
            data-purchase-action="buy"
            type="button"
            disabled={pending !== null || !allowed}
            onClick={(event) => void run("buy", event.currentTarget)}
          >
            {pending === "buy" ? "Hazırlanıyor…" : "Hemen satın al"}
          </button> : null}
      </PurchaseActionLayout>
      <WhatsAppOrderButton product={product} variant={variant} quantity={quantity} disabled={pending !== null} />
      <RestockSubscriptionForm product={product} variant={variant} />
      <p className="purchase-status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
