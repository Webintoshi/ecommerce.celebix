"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { getPanelRoutePresentation } from "@/lib/panel-ui/navigation";
import { PanelMobileDock } from "./PanelMobileDock";
import { PanelSidebar } from "./PanelSidebar";
import {
  PanelTopbarChromeProvider,
  type PanelTopbarChromeState,
} from "./PanelTopbarChrome";
import styles from "./panel-shell.module.css";

const ModelContext = createContext<PanelChromeModel | null>(null);

type PublishedPanelTopbarChrome = Readonly<{
  pathname: string;
  subtitle?: string;
  title: string;
}>;

export function usePanelChromeModel(): PanelChromeModel {
  const model = useContext(ModelContext);
  if (!model) throw new Error("panel_chrome_model_unavailable");
  return model;
}

export function PanelLayoutClient({ model, children }: { model: PanelChromeModel; children: ReactNode }) {
  const [chrome, setChrome] = useState<PublishedPanelTopbarChrome | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPresent, setDrawerPresent] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const desktopFocusRef = useRef<HTMLElement>(null);
  const releasingDrawerForDesktop = useRef(false);
  const pendingFocusTarget = useRef<"desktop" | "menu" | null>(null);
  const pathname = usePathname() ?? "";
  const routePresentation = getPanelRoutePresentation(pathname);
  const activeChrome = chrome?.pathname === pathname ? chrome : null;
  const handleChromeChange = useCallback((next: PanelTopbarChromeState | null) => {
    setChrome((current) => {
      if (!next) return current ? null : current;
      if (
        current?.pathname === pathname
        && current.title === next.title
        && current.subtitle === next.subtitle
      ) return current;
      return { pathname, title: next.title, subtitle: next.subtitle };
    });
  }, [pathname]);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => {
    releasingDrawerForDesktop.current = false;
    setDrawerPresent(true);
    setDrawerOpen((current) => !current);
  }, []);
  const restoreDrawerFocus = useCallback(() => {
    pendingFocusTarget.current = releasingDrawerForDesktop.current ? "desktop" : "menu";
    releasingDrawerForDesktop.current = false;
    setDrawerPresent(false);
  }, []);

  useEffect(() => {
    if (drawerPresent || !pendingFocusTarget.current) return;
    const focusTarget = pendingFocusTarget.current === "desktop"
      ? desktopFocusRef.current
      : menuButtonRef.current;
    pendingFocusTarget.current = null;
    focusTarget?.focus();
  }, [drawerPresent]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1025px)");
    const releaseDrawer = (event: MediaQueryListEvent) => {
      if (event.matches && drawerOpen) {
        releasingDrawerForDesktop.current = true;
        setDrawerOpen(false);
      }
    };
    if (desktop.matches && drawerOpen) {
      releasingDrawerForDesktop.current = true;
      setDrawerOpen(false);
    }
    desktop.addEventListener("change", releaseDrawer);
    return () => {
      desktop.removeEventListener("change", releaseDrawer);
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerPresent) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerPresent]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const sync = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      document.documentElement.style.setProperty("--panel-keyboard-inset", String(inset) + "px");
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      document.documentElement.style.removeProperty("--panel-keyboard-inset");
    };
  }, []);

  return (
    <ModelContext.Provider value={model}>
      <div className={styles.shell}>
        <PanelSidebar model={model} mode="desktop" />
        <PanelSidebar
          model={model}
          mode="drawer"
          open={drawerOpen}
          onClose={closeDrawer}
          onRestoreFocus={restoreDrawerFocus}
        />
        <div className={styles.workspace}>
          <header className={styles.desktopTopbar}>
            <div>
              <strong>{activeChrome?.title ?? routePresentation.title}</strong>
              <span>{activeChrome?.subtitle}</span>
            </div>
            <div id="panel-topbar-actions" />
          </header>
          <PanelTopbarChromeProvider onChange={handleChromeChange}>
            <main ref={desktopFocusRef} className={styles.content} tabIndex={-1}>{children}</main>
          </PanelTopbarChromeProvider>
        </div>
        <PanelMobileDock
          pathname={pathname}
          menuOpen={drawerOpen}
          menuButtonRef={menuButtonRef}
          onMenuToggle={toggleDrawer}
        />
      </div>
    </ModelContext.Provider>
  );
}
