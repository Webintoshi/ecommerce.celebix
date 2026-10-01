"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { StorefrontNavigationItems } from "@celebix/storefront-design-ui";
import type { PublicStarterNavigation } from "@celebix/saas-contracts";
import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";

import { useCartStatus } from "../../components/CartStatusProvider";
import { useFavoriteStatus } from "../../components/FavoriteStatusProvider";
import { useHydrated } from "../../components/use-hydrated";
import { categoryPath, productIndexPath, localizeStorefrontPath } from "@/lib/storefront-routes.ts";
import { isValidProductCatalogSearch } from "../../lib/product-catalog-query.ts";
import { SioraIcon } from "./SioraIcon";
import { useSioraPanelHistory } from "./useSioraPanelHistory";
import { isCatalog, useCatalogScrollRestoration } from "./useCatalogScrollRestoration";

type Panel = "menu" | "search";
function isCheckout(pathname: string): boolean {
  return /^(?:\/(?:tr|en))?\/(?:checkout|odeme)(?:\/|$)/u.test(pathname);
}
function visibleCount(value: number): number { return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 999) : 0; }

export function SioraMobileShell({ storefrontId, locale, displayName, navigation, variant = "boutique" }: Readonly<{ storefrontId: string; locale: string; displayName: string; navigation: PublicStarterNavigation; variant?: "boutique" | "sports" }>) {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();
  const { cart, drawerOpen, openDrawer, closeDrawer, closeDrawerAndWait } = useCartStatus();
  const { count: favoriteCount } = useFavoriteStatus();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const panelRef = useRef<Panel | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const checkout = isCheckout(pathname);
  const cartCount = visibleCount(hydrated ? cart?.itemCount ?? 0 : 0);
  const favorites = visibleCount(hydrated ? favoriteCount : 0);
  const sports = variant === "sports";
  const panelId = sports ? "alpler-mobile-panel" : "siora-mobile-panel";
  const panelTitleId = `${panelId}-title`;
  const searchInputId = sports ? "alpler-mobile-search-input" : "siora-mobile-search-input";

  useCatalogScrollRestoration(storefrontId, pathname, Boolean(panel || drawerOpen), sports ? "alpler" : "siora");

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const hidePanel = useCallback((restoreFocus = true) => {
    panelRef.current = null;
    setPanel(null);
    if (restoreFocus) {
      const trigger = triggerRef.current;
      window.requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
    }
  }, []);
  const { open: openHistory, close: closeHistory } = useSioraPanelHistory({ storefrontId, panel: "navigation", onClose: (reason) => hidePanel(reason === "back") });
  const dismissPanel = useCallback((restoreFocus = true) => { hidePanel(restoreFocus); void closeHistory(); }, [closeHistory, hidePanel]);

  const openPanel = useCallback((next: Panel, trigger: HTMLElement) => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    if (sports && drawerOpen) {
      const sourceRoute = `${window.location.pathname}${window.location.search}`;
      void closeDrawerAndWait(false).then((sameRoute) => {
        if (!sameRoute || `${window.location.pathname}${window.location.search}` !== sourceRoute || !trigger.isConnected || !openHistory()) return;
        triggerRef.current = trigger;
        panelRef.current = next;
        setPanel(next);
      });
      return;
    }
    if (drawerOpen) closeDrawer();
    if (!panelRef.current) {
      if (!openHistory()) return;
      triggerRef.current = trigger;
    }
    panelRef.current = next;
    setPanel(next);
  }, [closeDrawer, closeDrawerAndWait, drawerOpen, openHistory, sports]);

  const openCart = (trigger: HTMLElement) => {
    if (!sports) { dismissPanel(false); openDrawer(trigger); return; }
    const sourceRoute = `${window.location.pathname}${window.location.search}`;
    hidePanel(false);
    void closeHistory().then((sameRoute) => {
      if (!sameRoute) return;
      window.setTimeout(() => {
        if (`${window.location.pathname}${window.location.search}` === sourceRoute && trigger.isConnected) openDrawer(trigger);
      }, 0);
    });
  };

  useEffect(() => {
    if ((drawerOpen || checkout) && panelRef.current) dismissPanel(false);
  }, [checkout, drawerOpen, dismissPanel]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const onChange = () => { if (!query.matches && panelRef.current) dismissPanel(); };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [dismissPanel]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !panel) { if (dialog?.open) dialog.close(); return; }
    if (!dialog.open) dialog.showModal();
    const frame = window.requestAnimationFrame(() => (panel === "search" ? searchRef.current : closeRef.current)?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [panel]);

  const navigateAfterPanelClose = (href: string) => {
    const sourceRoute = `${window.location.pathname}${window.location.search}`;
    hidePanel(false);
    void closeHistory().then((sameRoute) => {
      if (!sameRoute) return;
      // Let every popstate listener finish restoring Next's route before pushing.
      window.setTimeout(() => {
        if (`${window.location.pathname}${window.location.search}` === sourceRoute) router.push(href);
      }, 0);
    });
  };

  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.currentTarget.target === "_blank") return;
    event.preventDefault();
    const href = event.currentTarget.getAttribute("href");
    if (!href) return;
    navigateAfterPanelClose(href);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("q") ?? "").trim();
    if (!query || !isValidProductCatalogSearch(query) || /[\u0080-\u009f]/u.test(query)) {
      searchRef.current?.setCustomValidity(!query ? "Aramak istediğiniz ürünü yazın." : "Lütfen daha kısa bir arama metni yazın.");
      searchRef.current?.reportValidity();
      searchRef.current?.focus();
      return;
    }
    navigateAfterPanelClose(`/search?q=${encodeURIComponent(query)}`);
  };

  if (checkout) return null;

  return <div className="siora-mobile-shell" data-siora-home={pathname === "/" ? "true" : "false"} data-siora-scrolled={scrolled ? "true" : "false"}>
    <div className="siora-header-mobile-tools">
      <button type="button" aria-label="Menüyü aç" aria-haspopup="dialog" aria-expanded={panel === "menu"} aria-controls={panelId} onClick={(event) => openPanel("menu", event.currentTarget)}><SioraIcon name="menu" /></button>
      <button type="button" aria-label="Ürün ara" aria-haspopup="dialog" aria-expanded={panel === "search"} aria-controls={panelId} onClick={(event) => openPanel("search", event.currentTarget)}><SioraIcon name="search" /></button>
    </div>
    <div className="siora-mobile-bottom-space" aria-hidden="true" />
    <nav className="siora-mobile-bottom" aria-label="Mobil mağaza gezinmesi">
      <Link href="/" prefetch={false} className={pathname === "/" && !panel ? "is-selected" : undefined} aria-current={pathname === "/" ? "page" : undefined}><SioraIcon name="home" /><span>Ana Sayfa</span></Link>
      <button type="button" className={panel === "menu" || isCatalog(pathname) && pathname !== "/search" && !panel ? "is-selected" : undefined} aria-haspopup="dialog" aria-expanded={panel === "menu"} aria-controls={panelId} onClick={(event) => openPanel("menu", event.currentTarget)}><SioraIcon name="menu" /><span>Menü</span></button>
      <button type="button" className={panel === "search" || pathname === "/search" && !panel ? "is-selected" : undefined} aria-haspopup="dialog" aria-expanded={panel === "search"} aria-controls={panelId} onClick={(event) => openPanel("search", event.currentTarget)}><SioraIcon name="search" /><span>Ara</span></button>
      <Link href="/favorites" prefetch={false} className={pathname.startsWith("/favorites") && !panel ? "is-selected" : undefined} aria-current={pathname.startsWith("/favorites") ? "page" : undefined} aria-label={favorites ? `Favoriler, ${favorites} ürün` : "Favoriler"}><SioraIcon name="heart" />{favorites ? <span className="siora-mobile-badge" aria-hidden="true">{favorites}</span> : null}<span>Favoriler</span></Link>
      <button type="button" className={drawerOpen || pathname === "/cart" ? "is-selected" : undefined} aria-label={cartCount ? `Sepetim, ${cartCount} ürün` : "Sepetim"} aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={(event) => openCart(event.currentTarget)}><SioraIcon name="bag" />{cartCount ? <span className="siora-mobile-badge" aria-hidden="true">{cartCount}</span> : null}<span>Sepetim</span></button>
    </nav>
    <dialog className="siora-mobile-dialog" id={panelId} ref={dialogRef} aria-labelledby={panelTitleId} data-panel={panel ?? undefined} onCancel={(event) => { event.preventDefault(); dismissPanel(); }} onClose={() => { if (panelRef.current) dismissPanel(); }} onClick={(event) => { if (event.target === event.currentTarget) dismissPanel(); }}>
      <div className="siora-mobile-panel-content">
        <header className="siora-mobile-panel-header"><div><span>{displayName}</span><h2 id={panelTitleId}>{panel === "search" ? sports ? "Ürünlerde ara" : "Koleksiyonda ara" : sports ? "Ürünleri keşfet" : "Koleksiyonu keşfet"}</h2></div><button ref={closeRef} type="button" aria-label={panel === "search" ? "Aramayı kapat" : "Menüyü kapat"} onClick={() => dismissPanel()}><SioraIcon name="close" /></button></header>
        {panel === "menu" ? <>
          <nav className="siora-mobile-navigation" aria-label="Kategoriler">
            <Link href="/" prefetch={false} aria-current={pathname === "/" ? "page" : undefined} onClick={navigate}>Ana Sayfa</Link>
            <Link href={productIndexPath(locale)} prefetch={false} aria-current={pathname === productIndexPath(locale) ? "page" : undefined} onClick={navigate}>Tüm Ürünler <SioraIcon name="arrow" /></Link>
            <StorefrontNavigationItems items={navigation.items} mode="mobile" categoryHref={(slug) => categoryPath(locale, slug)} resolveHref={(item) => item.path ? localizeStorefrontPath(item.path, locale) : categoryPath(locale, item.slug)} renderLink={(href, content, className) => <Link href={href} className={className} prefetch={false} aria-current={pathname === href ? "page" : undefined} onClick={navigate}>{content}</Link>} classes={{ root: "siora-mobile-category", summary: "siora-mobile-category-summary", panel: "siora-mobile-category-panel", links: "siora-mobile-category-links", featured: "siora-mobile-featured", branch: "siora-mobile-category-branch" }} />
          </nav>
          <div className="siora-mobile-secondary"><Link href="/account" prefetch={false} onClick={navigate}><SioraIcon name="account" /> Hesabım <SioraIcon name="arrow" /></Link><Link href="/favorites" prefetch={false} onClick={navigate}><SioraIcon name="heart" /> Favorilerim {favorites ? <span>{favorites}</span> : null}</Link><button type="button" onClick={(event) => openPanel("search", event.currentTarget)}><SioraIcon name="search" /> Ürün ara <SioraIcon name="arrow" /></button></div>
        </> : panel === "search" ? <div className="siora-mobile-search"><p>{sports ? "Aradığınız ürünü adıyla bulun." : "Aradığınız parçayı ürün adıyla bulun."}</p><form action="/search" method="get" role="search" onSubmit={submitSearch}><label className="sr-only" htmlFor={searchInputId}>Ürün adı veya anahtar kelime</label><div className="siora-mobile-search-field"><SioraIcon name="search" /><input ref={searchRef} id={searchInputId} name="q" type="search" placeholder="Ne arıyorsunuz?" autoComplete="off" enterKeyHint="search" maxLength={100} required onInput={(event) => event.currentTarget.setCustomValidity("")} /></div><button className="siora-mobile-search-submit" type="submit">Ürünleri ara <SioraIcon name="arrow" /></button></form><Link href={productIndexPath(locale)} prefetch={false} onClick={navigate}>{sports ? "Tüm ürünleri görüntüle" : "Tüm koleksiyonu görüntüle"} <SioraIcon name="arrow" /></Link></div> : null}
      </div>
    </dialog>
  </div>;
}
