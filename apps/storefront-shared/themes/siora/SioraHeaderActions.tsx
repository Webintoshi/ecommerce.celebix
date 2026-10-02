"use client";

import Link from "next/link";
import { useCartStatus } from "../../components/CartStatusProvider";
import { useHydrated } from "../../components/use-hydrated";
import { StorefrontSearchForm } from "../../components/StorefrontSearchForm";
import { SioraIcon } from "./SioraIcon";

export function SioraHeaderSearch() {
  return <StorefrontSearchForm variant="header" icon={<SioraIcon name="search" />} />;
}

export function SioraHeaderActions() {
  const hydrated = useHydrated();
  const { cart, drawerOpen, openDrawer } = useCartStatus();
  const quantity = hydrated ? cart?.itemCount ?? 0 : 0;
  const count = Number.isSafeInteger(quantity) && quantity > 0 ? Math.min(quantity, 999) : 0;
  return <nav className="siora-header-actions" data-storefront-header-actions aria-label="Hesap ve sepet">
    <Link href="/account" prefetch={false} aria-label="Hesabım"><SioraIcon name="account" /><span>Hesabım</span></Link>
    <button type="button" aria-label={count ? `Sepetim, ${count} ürün` : "Sepetim"} aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={(event) => openDrawer(event.currentTarget)}><SioraIcon name="bag" /><span>Sepetim{count ? <span className="siora-header-cart-count" aria-hidden="true"> ({count})</span> : null}</span></button>
  </nav>;
}
