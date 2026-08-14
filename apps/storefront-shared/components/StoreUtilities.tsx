"use client";

import Link from "next/link";

import { useCartStatus } from "./CartStatusProvider";
import { useFavoriteStatus } from "./FavoriteStatusProvider";
import { StoreIcon, type StoreIconName } from "./StoreIcon";
import { useHydrated } from "./use-hydrated";

const UTILITIES = Object.freeze([
  Object.freeze({ href: "/search", label: "Ara", icon: "search" as const }),
  Object.freeze({ href: "/favorites", label: "Favoriler", icon: "heart" as const }),
  Object.freeze({ href: "/account", label: "Hesabım", icon: "account" as const }),
] satisfies readonly Readonly<{ href: string; label: string; icon: StoreIconName }>[]);
const CART_UTILITY = Object.freeze({ href: "/cart", label: "Sepet", icon: "cart" as const });

export function StoreUtilities() {
  const hydrated = useHydrated();
  const { cart, drawerOpen, openDrawer } = useCartStatus();
  const { count: favoriteCount } = useFavoriteStatus();
  const cartCount = hydrated ? cart?.itemCount ?? 0 : 0;
  const count = Number.isSafeInteger(cartCount) && cartCount > 0 ? Math.min(cartCount, 999) : 0;
  const visibleFavoriteCount = hydrated ? favoriteCount : 0;
  return <nav className="store-utilities" aria-label="Mağaza araçları">{UTILITIES.map((item) => { const badge = item.icon === "heart" ? visibleFavoriteCount : 0; return <Link aria-label={item.label} href={item.href} key={item.href}><StoreIcon name={item.icon} />{badge > 0 ? <span aria-label={`${badge} favori`}>{Math.min(badge, 999)}</span> : null}</Link>; })}<button type="button" aria-label={CART_UTILITY.label} aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={(event) => openDrawer(event.currentTarget)}><StoreIcon name={CART_UTILITY.icon} />{count > 0 ? <span aria-label={`${count} ürün`}>{count}</span> : null}</button></nav>;
}
