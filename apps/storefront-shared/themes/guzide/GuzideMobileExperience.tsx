"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Heart, House, ShoppingBag } from "lucide-react";
import { createContext, Suspense, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useCartStatus } from "../../components/CartStatusProvider";
import { useFavoriteStatus } from "../../components/FavoriteStatusProvider";
import { useHydrated } from "../../components/use-hydrated";
import { guzideThemeFor } from "./theme.ts";
import { GuzideBrowsingContinuity } from "./GuzideBrowsingContinuity";
import styles from "./guzide-mobile-experience.module.css";

type Session = Readonly<{
  storefrontId: string;
  menuOpen: boolean;
  frameActive: boolean;
  setMenuOpen(open: boolean): void;
  registerMenu(handler: (trigger: HTMLElement) => void): () => void;
  openMenu(trigger: HTMLElement): void;
  registerMenuBack(handler: () => boolean): () => void;
  backWithinMenu(): boolean;
}>;
const Context = createContext<Session | null>(null);
export function useGuzideMobileExperience() { return useContext(Context); }

// Existing route pages retain their fallback frame outside the persistent tenant layout.
export function GuzidePageBoundary({ children, fallback, standaloneFrame }: Readonly<{ children: ReactNode; fallback: ReactNode; standaloneFrame?: ReactNode }>) {
  const session = useContext(Context);
  return session ? (session.frameActive ? children : standaloneFrame ?? fallback) : fallback;
}

function routeMode(path: string) {
  const checkout = /^\/(checkout|odeme)(\/|$)/u.test(path);
  const standalone = /^\/(account|odeme)(\/|$)/u.test(path);
  const product = /^\/(products|urun)\/[^/]+\/?$/u.test(path);
  const form = /^\/(account|search)(\/|$)/u.test(path);
  const checkoutChrome = path === "/checkout";
  const catalog = /^\/(products|urunler|categories|kategori|collections|koleksiyon)(\/|$)/u.test(path);
  return { checkout, checkoutChrome, standalone, product, nav: !checkout && !standalone && !product && !form, catalog };
}

function count(value: number | undefined) { return Number.isSafeInteger(value) && value! > 0 ? Math.min(value!, 999) : 0; }

function BottomNavigation({ pathname, catalog, blocked }: Readonly<{ pathname: string; catalog: boolean; blocked: boolean }>) {
  const session = useGuzideMobileExperience()!;
  const cart = useCartStatus(), favorites = useFavoriteStatus(), hydrated = useHydrated();
  const cartCount = hydrated ? count(cart.cart?.itemCount) : 0, favoriteCount = hydrated ? count(favorites.count) : 0;
  return <nav className={styles.navigation} aria-label="Alt gezinme" inert={blocked || undefined} data-overlay-open={blocked ? "true" : undefined}>
    <Link href="/" aria-current={pathname === "/" ? "page" : undefined}><House aria-hidden="true" /><span>Ana Sayfa</span></Link>
    <button type="button" aria-label="Keşfet" aria-haspopup="dialog" aria-expanded={session.menuOpen} aria-controls="campaign-mobile-menu" aria-current={catalog ? "page" : undefined} onClick={event => session.openMenu(event.currentTarget)}><Compass aria-hidden="true" /><span>Keşfet</span></button>
    <Link href="/favorites" prefetch={false} aria-current={pathname === "/favorites" ? "page" : undefined} aria-label={favoriteCount ? `Favoriler, ${favoriteCount} ürün` : "Favoriler"}><Heart aria-hidden="true" /><span>Favoriler</span>{favoriteCount ? <i className={styles.badge} aria-hidden="true">{favoriteCount}</i> : null}</Link>
    <button type="button" aria-label={cartCount ? `Sepet, ${cartCount} ürün` : "Sepet"} aria-haspopup="dialog" aria-expanded={cart.drawerOpen} aria-current={pathname.startsWith("/cart") ? "page" : undefined} onClick={event => cart.openDrawer(event.currentTarget)}><ShoppingBag aria-hidden="true" /><span>Sepet</span>{cartCount ? <i className={styles.badge} aria-hidden="true">{cartCount}</i> : null}</button>
  </nav>;
}

export function GuzideClientFrame({ storefrontId, className, style, publishedDesign, font, header, checkoutHeader, footer, checkoutFooter, children }: Readonly<{
  storefrontId: string; locale: string; className: string; style?: CSSProperties;
  publishedDesign?: string; font?: string; header: ReactNode; checkoutHeader: ReactNode;
  footer: ReactNode; checkoutFooter: ReactNode; children: ReactNode;
}>) {
  const pathname = usePathname(), mode = routeMode(pathname), enabled = Boolean(guzideThemeFor({ id: storefrontId }));
  const cart = useCartStatus(), favorites = useFavoriteStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<((trigger: HTMLElement) => void) | null>(null), menuBack = useRef<(() => boolean) | null>(null);
  const previous = useRef(pathname);
  const registerMenu = useCallback((handler: (trigger: HTMLElement) => void) => { menu.current = handler; return () => { if (menu.current === handler) menu.current = null; }; }, []);
  const registerMenuBack = useCallback((handler: () => boolean) => { menuBack.current = handler; return () => { if (menuBack.current === handler) menuBack.current = null; }; }, []);
  const backWithinMenu = useCallback(() => menuBack.current?.() ?? false, []);
  const openMenu = useCallback((trigger: HTMLElement) => {
    if (!cart.drawerOpen) { menu.current?.(trigger); return; }
    void cart.closeDrawerAndWait(false).then(sameRoute => { if (sameRoute) menu.current?.(trigger); });
  }, [cart.drawerOpen, cart.closeDrawerAndWait]);
  useLayoutEffect(() => {
    if (!enabled || previous.current === pathname) return;
    const before = routeMode(previous.current); previous.current = pathname;
    setMenuOpen(false);
    if (cart.drawerOpen) void cart.closeDrawerAndWait(false);
    // A persistent provider must still revalidate server cart authority at checkout boundaries.
    if ((mode.checkout && !before.checkout) || (before.checkout && !mode.checkout) || (before.standalone && !mode.standalone)) void cart.refresh();
    if (before.standalone) void favorites.refresh();
  }, [pathname, enabled, mode.checkout, cart.drawerOpen, cart.closeDrawerAndWait, cart.refresh, favorites.refresh]);
  const session = useMemo<Session>(() => ({ storefrontId, menuOpen, frameActive: !mode.standalone, setMenuOpen, registerMenu, registerMenuBack, backWithinMenu, openMenu }), [storefrontId, menuOpen, mode.standalone, registerMenu, registerMenuBack, backWithinMenu, openMenu]);
  if (!enabled) return children;
  const overlayOpen = menuOpen || cart.drawerOpen;
  return <Context.Provider value={session}>
    <Suspense fallback={null}><GuzideBrowsingContinuity storefrontId={storefrontId} overlayOpen={overlayOpen} /></Suspense>
    {mode.standalone ? children : <div className={`${className} ${styles.frame}`} style={style} data-published-design={publishedDesign} data-font={font} data-storefront-theme="guzide-deniz" data-storefront-checkout={mode.checkoutChrome ? "true" : undefined} data-guzide-mobile-nav={mode.nav ? "true" : undefined} data-guzide-product={mode.product ? "true" : undefined}>
      {mode.checkoutChrome ? checkoutHeader : header}
      <main inert={overlayOpen || undefined}>{children}</main>
      <div inert={overlayOpen || undefined}>{mode.checkoutChrome ? checkoutFooter : footer}</div>
      {mode.nav ? <BottomNavigation pathname={pathname} catalog={mode.catalog} blocked={overlayOpen} /> : null}
    </div>}
  </Context.Provider>;
}

export function GuzideLoadingBoundary({ fallback }: Readonly<{ fallback: ReactNode }>) {
  return useGuzideMobileExperience() ? <section className={styles.loading} role="status" aria-label="Sayfa yükleniyor"><span className={styles.loadingLine} /><div aria-hidden="true"><i /><i /></div><span className="sr-only">Sayfa yükleniyor</span></section> : fallback;
}
