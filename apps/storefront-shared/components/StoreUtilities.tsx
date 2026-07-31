"use client";

import Link from "next/link";

import { useCartStatus } from "./CartStatusProvider";
import { useFavoriteStatus } from "./FavoriteStatusProvider";
import { StoreIcon, type StoreIconName } from "./StoreIcon";

const UTILITIES = Object.freeze([
  Object.freeze({ href: "/search", label: "Ara", icon: "search" as const }),
  Object.freeze({ href: "/favorites", label: "Favoriler", icon: "heart" as const }),
  Object.freeze({ href: "/account", label: "Hesabım", icon: "account" as const }),
  Object.freeze({ href: "/cart", label: "Sepet", icon: "cart" as const }),
] satisfies readonly Readonly<{ href: string; label: string; icon: StoreIconName }>[]);

export function StoreUtilities() {
  const { cart } = useCartStatus();
  const { count: favoriteCount } = useFavoriteStatus();
  const cartCount = cart?.itemCount ?? 0;
  const count = Number.isSafeInteger(cartCount) && cartCount > 0 ? Math.min(cartCount, 999) : 0;
  return <nav className="store-utilities" aria-label="Mağaza araçları">{UTILITIES.map((item) => { const badge = item.icon === "cart" ? count : item.icon === "heart" ? favoriteCount : 0; return <Link aria-label={item.label} href={item.href} key={item.href}><StoreIcon name={item.icon} />{badge > 0 ? <span aria-label={`${badge} ${item.icon === "cart" ? "ürün" : "favori"}`}>{Math.min(badge, 999)}</span> : null}</Link>; })}</nav>;
}
