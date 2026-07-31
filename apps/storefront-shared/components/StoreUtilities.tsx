import Link from "next/link";

import { StoreIcon, type StoreIconName } from "./StoreIcon";

const UTILITIES = Object.freeze([
  Object.freeze({ href: "/search", label: "Ara", icon: "search" as const }),
  Object.freeze({ href: "/favorites", label: "Favoriler", icon: "heart" as const }),
  Object.freeze({ href: "/account", label: "Hesabım", icon: "account" as const }),
  Object.freeze({ href: "/cart", label: "Sepet", icon: "cart" as const }),
] satisfies readonly Readonly<{ href: string; label: string; icon: StoreIconName }>[]);

export function StoreUtilities({ cartCount }: Readonly<{ cartCount: number }>) {
  const count = Number.isSafeInteger(cartCount) && cartCount > 0 ? Math.min(cartCount, 999) : 0;
  return <nav className="store-utilities" aria-label="Mağaza araçları">{UTILITIES.map((item) => <Link aria-label={item.label} href={item.href} key={item.href}><StoreIcon name={item.icon} />{item.icon === "cart" && count > 0 ? <span aria-label={`${count} ürün`}>{count}</span> : null}</Link>)}</nav>;
}
