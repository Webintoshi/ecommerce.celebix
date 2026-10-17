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
import { LilyumHeaderBar, LilyumMenuItems } from "./LilyumHeaderBar";


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
    <LilyumHeaderBar displayName={displayName} logo={logo} navigation={navigation} locale={locale} announcement={announcement} close={close} cartButton={
          <button className={`lf-desktop-tool${productRoute ? " lf-product-cart" : ""}`} type="button" aria-label="Sepet" aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={event => openDrawer(event.currentTarget)}><LilyumIcon name="bag" />{cartCount > 0 ? <small>{Math.min(cartCount, 999)}</small> : null}</button>
    } menuButton={
          <button ref={trigger} className="lf-menu-trigger" aria-label="Menüyü aç" aria-controls={id} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} type="button"><LilyumIcon name="menu" /></button>
    } />
    <dialog ref={dialog} id={id} className="lf-menu" aria-label="Koleksiyonlar" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="lf-menu-top"><span>{displayName}</span><button type="button" autoFocus aria-label="Menüyü kapat" onClick={close}><LilyumIcon name="close" /></button></div>
      <nav aria-label="Mobil menü"><Link className="lf-menu-all" href={catalog} onClick={close}>Tüm çiçekler<LilyumIcon name="arrow" /></Link><LilyumMenuItems items={navigation} locale={locale} close={close} /></nav>
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
