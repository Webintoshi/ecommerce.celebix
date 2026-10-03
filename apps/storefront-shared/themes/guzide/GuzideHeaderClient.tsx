"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, type MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCartStatus } from "../../components/CartStatusProvider";
import { CampaignHeaderClient, type CampaignHeaderClientProps } from "../../components/CampaignHeaderClient";
import { GuzideMobileMenu } from "./GuzideMobileMenu";
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
  const finish = useCallback((restore: boolean) => {
    session.setMenuOpen(false);
    if (restore) requestAnimationFrame(() => { if (trigger.current?.isConnected) trigger.current.focus(); });
  }, [session.setMenuOpen]);
  const history = useGuzidePanelHistory({ storefrontId: session.storefrontId, panel: "menu", onBackWithinPanel: session.backWithinMenu, onClose: reason => finish(reason === "back") });
  const open = useCallback((source: HTMLElement) => { trigger.current = source; openedRoute.current = `${window.location.pathname}${window.location.search}`; history.open(); session.setMenuOpen(true); }, [history.open, session.setMenuOpen]);
  useEffect(() => session.registerMenu(open), [session.registerMenu, open]);
  useEffect(() => {
    if (session.menuOpen && openedRoute.current !== `${window.location.pathname}${window.location.search}`) finish(false);
  }, [pathname, query, session.menuOpen, finish]);
  useEffect(() => cart.registerDrawerGate?.(() => {
    if (!session.menuOpen) return null;
    const source = `${window.location.pathname}${window.location.search}`;
    finish(false);
    return history.close().then(sameRoute => new Promise<boolean>(resolve => window.setTimeout(() => resolve(sameRoute && `${window.location.pathname}${window.location.search}` === source), 0)));
  }), [cart.registerDrawerGate, session.menuOpen, finish, history.close]);
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
  return <CampaignHeaderClient {...props} mobileMenuController={controller} mobileMenuClassName={styles.drawer}
    renderMobileMenu={onClose => <GuzideMobileMenu {...props} menuImages={menuImages} supportEmail={supportEmail} onClose={onClose} onNavigate={navigate} />} />;
}
export function GuzideHeaderClient(props: Props) {
  const session = useGuzideMobileExperience();
  return session ? <Suspense fallback={<LegacyHeader {...props} />}><ConnectedHeader {...props} /></Suspense> : <LegacyHeader {...props} />;
}
