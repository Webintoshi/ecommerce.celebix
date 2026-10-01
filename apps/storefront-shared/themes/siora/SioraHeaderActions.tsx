"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type FormEvent } from "react";
import { useCartStatus } from "../../components/CartStatusProvider";
import { useHydrated } from "../../components/use-hydrated";
import { isValidProductCatalogSearch } from "../../lib/product-catalog-query.ts";
import { SioraIcon } from "./SioraIcon";

export function SioraHeaderSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("q") ?? "").trim();
    if (!query || !isValidProductCatalogSearch(query) || /[\u0080-\u009f]/u.test(query)) {
      inputRef.current?.setCustomValidity(!query ? "Aramak istediğiniz ürünü yazın." : "Lütfen daha kısa bir arama metni yazın.");
      inputRef.current?.reportValidity();
      return;
    }
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };
  return <form className="siora-header-search" action="/search" method="get" role="search" onSubmit={submit}>
    <button type="submit" aria-label="Ürün ara"><SioraIcon name="search" /></button>
    <label className="sr-only" htmlFor="siora-header-search">Ürün adı veya anahtar kelime</label>
    <input id="siora-header-search" ref={inputRef} type="search" name="q" placeholder="Ara" required maxLength={100} autoComplete="off" enterKeyHint="search" onInput={(event) => event.currentTarget.setCustomValidity("")} />
  </form>;
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
