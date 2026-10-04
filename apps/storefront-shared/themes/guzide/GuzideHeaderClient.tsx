"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, type MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useCartStatus } from "../../components/CartStatusProvider";
import { CampaignHeaderClient, type CampaignHeaderClientProps } from "../../components/CampaignHeaderClient";
import { GuzideMobileMenu } from "./GuzideMobileMenu";
import { GuzideSearchPanel } from "./GuzideSearchPanel";
import { useGuzideMobileExperience } from "./GuzideMobileExperience";
import { useGuzidePanelHistory } from "./useGuzidePanelHistory";
import type { GuzideMenuImages } from "./guzide-menu.ts";
import styles from "./guzide-mobile-menu.module.css";

type Props = CampaignHeaderClientProps & Readonly<{ menuImages: GuzideMenuImages; supportEmail?: string }>;
function LegacyHeader({ menuImages, supportEmail, ...props }: Props) {
  return <CampaignHeaderClient {...props} mobileMenuClassName={styles.drawer}
    renderMobileMenu={onClose => <GuzideMobileMenu {...props} menuImages={menuImages} supportEmail={supportEmail} onClose={onClose} />} />;
}
function ConnectedHeader({ menuImages, supportEmail, ...props }: Props) {
  const cart = useCartStatus();
  const session = useGuzideMobileExperience()!, router = useRouter(), trigger = useRef<HTMLElement | null>(null);
  const pathname = usePathname(), query = useSearchParams().toString(), openedRoute = useRef<string | null>(null);
  const searchTrigger = useRef<HTMLElement | null>(null), searchRoute = useRef<string | null>(null), openingSearch = useRef(false);
  const finishSearch = useCallback((restore: boolean) => {
    session.setSearchOpen(false);
    if (restore) requestAnimationFrame(() => { if (searchTrigger.current?.isConnected) searchTrigger.current.focus(); });
  }, [session.setSearchOpen]);
  const searchHistory = useGuzidePanelHistory({ storefrontId: session.storefrontId, panel: "search", onClose: reason => finishSearch(reason === "back") });
  const finish = useCallback((restore: boolean) => {
    session.setMenuOpen(false);
    if (restore) requestAnimationFrame(() => { if (trigger.current?.isConnected) trigger.current.focus(); });
  }, [session.setMenuOpen]);
  const history = useGuzidePanelHistory({ storefrontId: session.storefrontId, panel: "menu", onBackWithinPanel: session.backWithinMenu, onClose: reason => finish(reason === "back") });
  const open = useCallback((source: HTMLElement) => {
    const route = `${window.location.pathname}${window.location.search}`;
    const show = () => { if (`${window.location.pathname}${window.location.search}` !== route) return; trigger.current = source; openedRoute.current = route; history.open(); session.setMenuOpen(true); };
    if (session.searchOpen) { finishSearch(false); void searchHistory.close().then(sameRoute => { if (sameRoute) window.setTimeout(show, 0); }); }
    else show();
  }, [history.open, session.setMenuOpen, session.searchOpen, finishSearch, searchHistory.close]);
  useEffect(() => session.registerMenu(open), [session.registerMenu, open]);
  useEffect(() => {
    if (session.menuOpen && openedRoute.current !== `${window.location.pathname}${window.location.search}`) finish(false);
    if (session.searchOpen && searchRoute.current !== `${window.location.pathname}${window.location.search}`) finishSearch(false);
  }, [pathname, query, session.menuOpen, session.searchOpen, finish, finishSearch]);
  useEffect(() => cart.registerDrawerGate?.(() => {
    if (!session.menuOpen && !session.searchOpen) return null;
    const source = `${window.location.pathname}${window.location.search}`;
    finish(false);
    finishSearch(false);
    return (session.searchOpen ? searchHistory.close() : history.close()).then(sameRoute => new Promise<boolean>(resolve => window.setTimeout(() => resolve(sameRoute && `${window.location.pathname}${window.location.search}` === source), 0)));
  }), [cart.registerDrawerGate, session.menuOpen, session.searchOpen, finish, finishSearch, history.close, searchHistory.close]);
  const openSearch = useCallback((source: HTMLElement) => {
    if (session.searchOpen || openingSearch.current) return;
    searchTrigger.current = session.menuOpen ? trigger.current : source;
    const route = `${window.location.pathname}${window.location.search}`;
    const show = () => {
      openingSearch.current = false;
      if (`${window.location.pathname}${window.location.search}` !== route) return;
      searchRoute.current = route; searchHistory.open(); session.setSearchOpen(true);
    };
    if (session.menuOpen || cart.drawerOpen) {
      openingSearch.current = true;
      finish(false);
      void (cart.drawerOpen ? cart.closeDrawerAndWait(false) : history.close()).then(sameRoute => {
        if (sameRoute) window.setTimeout(show, 0); else openingSearch.current = false;
      });
    } else show();
  }, [session.searchOpen, session.menuOpen, session.setSearchOpen, cart.drawerOpen, cart.closeDrawerAndWait, finish, history.close, searchHistory.open]);
  const closeSearch = useCallback(() => { finishSearch(true); void searchHistory.close(); }, [finishSearch, searchHistory.close]);
  const navigateSearch = useCallback((href: string) => {
    const source = `${window.location.pathname}${window.location.search}`;
    finishSearch(false);
    void searchHistory.close().then(sameRoute => { window.setTimeout(() => { if (sameRoute && `${window.location.pathname}${window.location.search}` === source) router.push(href); }, 0); });
  }, [finishSearch, searchHistory.close, router]);
  const close = useCallback(() => { finish(true); void history.close(); }, [finish, history.close]);
  const navigate = useCallback((href: string) => {
    const source = `${window.location.pathname}${window.location.search}`;
    finish(false);
    void history.close().then(sameRoute => { window.setTimeout(() => { if (sameRoute && `${window.location.pathname}${window.location.search}` === source) router.push(href); }, 0); });
  }, [finish, history.close, router]);
  const linkClick = useCallback((event: MouseEvent<HTMLElement>) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || link.target === "_blank" || link.hasAttribute("download")) return;
    const href = link.getAttribute("href");
    if (!href?.startsWith("/") || href.startsWith("//")) return;
    event.preventDefault(); event.stopPropagation(); navigate(href);
  }, [navigate]);
  const controller = useMemo(() => ({ isOpen: session.menuOpen, open, close, linkClick }), [session.menuOpen, open, close, linkClick]);
  return <><CampaignHeaderClient {...props} mobileMenuController={controller} mobileMenuClassName={styles.drawer}
    searchControl={{ isOpen: session.searchOpen, open: openSearch }}
    desktopSearch={<button className="guzide-header-search-trigger" type="button" aria-label="Ürünlerde ara" aria-haspopup="dialog" aria-expanded={session.searchOpen} aria-controls="guzide-search-panel" onClick={event => openSearch(event.currentTarget)}><Search aria-hidden="true" /><span>Ürünlerde ara</span></button>}
    renderMobileMenu={onClose => <GuzideMobileMenu {...props} menuImages={menuImages} supportEmail={supportEmail} onClose={onClose} onNavigate={navigate} onSearch={openSearch} />} />
    {session.searchOpen ? <GuzideSearchPanel navigation={props.navigation} locale={props.locale} onClose={closeSearch} onNavigate={navigateSearch} /> : null}</>;
}
export function GuzideHeaderClient(props: Props) {
  const session = useGuzideMobileExperience();
  return session ? <Suspense fallback={<LegacyHeader {...props} />}><ConnectedHeader {...props} /></Suspense> : <LegacyHeader {...props} />;
}
