"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { PublicDesignMedia, PublicStarterNavigationItem } from "@celebix/saas-contracts";
import { useCartStatus } from "../../components/CartStatusProvider";
import { useFavoriteStatus } from "../../components/FavoriteStatusProvider";
import { useHydrated } from "../../components/use-hydrated";
import { StoreIcon } from "../../components/StoreIcon";
import { categoryPath, localizeStorefrontPath, productIndexPath } from "../../lib/storefront-routes.ts";
import { LilyumIcon } from "./LilyumIcon";

function MenuItems({ items, locale, close }: { items: readonly PublicStarterNavigationItem[]; locale: string; close(): void }) {
  return <ul>{items.map(item => <li key={`${item.slug}-${item.path ?? ""}`}>
    <Link href={item.path ? localizeStorefrontPath(item.path, locale) : categoryPath(locale, item.slug)} onClick={close}>{item.name}<LilyumIcon name="arrow" /></Link>
    {item.children.length ? <details><summary>{item.name} alt kategorileri</summary><MenuItems items={item.children} locale={locale} close={close} /></details> : null}
  </li>)}</ul>;
}

export function LilyumHeaderClient({ displayName, logo, navigation, locale, announcement }: {
  displayName: string; logo?: PublicDesignMedia; navigation: readonly PublicStarterNavigationItem[]; locale: string; announcement: string;
}) {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const { cart, drawerOpen, openDrawer } = useCartStatus();
  const { count } = useFavoriteStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const previousPath = useRef(pathname);
  const id = useId();
  const close = () => setMenuOpen(false);
  useEffect(() => { if (previousPath.current !== pathname) { previousPath.current = pathname; setMenuOpen(false); } }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const element = dialog.current;
    if (!element) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => { element.close(); document.body.style.overflow = overflow; trigger.current?.focus(); };
  }, [menuOpen]);
  const cartCount = hydrated ? cart?.itemCount ?? 0 : 0;
  const favoriteCount = hydrated ? count : 0;
  const suppressTabs = /\/(?:checkout|account|search|odeme|urun\/|products\/)/.test(pathname);
  const productRoute = /\/(?:urun\/|products\/)/.test(pathname);
  const catalog = productIndexPath(locale);
  return <>
    <header className="lf-header">
      {announcement ? <aside className="lf-announcement" aria-label="Mağaza duyuruları"><LilyumIcon name="truck" />{announcement}</aside> : null}
      <div className="lf-header-row lf-container">
        <Link className="lf-logo" href="/" aria-label={`${displayName} ana sayfa`}>{logo ? <img src={logo.url} alt={logo.altText || displayName} width="180" height="70" /> : displayName}</Link>
        <nav className="lf-desktop-nav" aria-label="Ana menü">{navigation.map(item => <div className="lf-nav-item" key={item.slug}>
          <Link href={item.path ? localizeStorefrontPath(item.path, locale) : categoryPath(locale, item.slug)}>{item.name}</Link>
          {item.children.length ? <div className="lf-submenu"><MenuItems items={item.children} locale={locale} close={close} /></div> : null}
        </div>)}</nav>
        <nav className="lf-tools" aria-label="Mağaza araçları">
          <Link href="/search" aria-label="Ara"><StoreIcon name="search" /></Link>
          <Link className="lf-desktop-tool" href="/account" aria-label="Hesabım"><StoreIcon name="account" /></Link>
          <button className={`lf-desktop-tool${productRoute ? " lf-product-cart" : ""}`} type="button" aria-label="Sepet" aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={event => openDrawer(event.currentTarget)}><LilyumIcon name="bag" />{cartCount > 0 ? <small>{Math.min(cartCount, 999)}</small> : null}</button>
          <button ref={trigger} className="lf-menu-trigger" aria-label="Menüyü aç" aria-controls={id} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} type="button"><LilyumIcon name="menu" /></button>
        </nav>
      </div>
    </header>
    <dialog ref={dialog} id={id} className="lf-menu" aria-label="Koleksiyonlar" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="lf-menu-top"><span>{displayName}</span><button type="button" autoFocus aria-label="Menüyü kapat" onClick={close}><LilyumIcon name="close" /></button></div>
      <nav aria-label="Mobil menü"><Link className="lf-menu-all" href={catalog} onClick={close}>Tüm çiçekler<LilyumIcon name="arrow" /></Link><MenuItems items={navigation} locale={locale} close={close} /></nav>
      <Link className="lf-menu-account" href="/account" onClick={close}><StoreIcon name="account" />Hesabım</Link>
    </dialog>
    {!suppressTabs ? <nav className="lf-bottom-nav" aria-label="Alt gezinme">
      <Link href="/" aria-current={pathname === "/" ? "page" : undefined}><LilyumIcon name="home" filled={pathname === "/"} /><span>Ana Sayfa</span></Link>
      <Link href={catalog} aria-current={pathname === catalog || pathname.includes("/kategori/") ? "page" : undefined}><StoreIcon name="search" /><span>Keşfet</span></Link>
      <Link href="/favorites" aria-label={`Favoriler${favoriteCount > 0 ? `, ${favoriteCount} ürün` : ""}`} aria-current={pathname === "/favorites" ? "page" : undefined}><StoreIcon name="heart" /><span>Favoriler</span>{favoriteCount > 0 ? <small>{Math.min(favoriteCount, 999)}</small> : null}</Link>
      <button type="button" aria-label={`Sepet${cartCount > 0 ? `, ${cartCount} ürün` : ""}`} aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={event => openDrawer(event.currentTarget)}><LilyumIcon name="bag" /><span>Sepet</span>{cartCount > 0 ? <small>{Math.min(cartCount, 999)}</small> : null}</button>
    </nav> : null}
  </>;
}
