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
import { PanelMobileDock } from "./PanelMobileDock";
import { PanelSidebar } from "./PanelSidebar";
import {
  PanelTopbarChromeProvider,
  type PanelTopbarChromeState,
} from "./PanelTopbarChrome";
import styles from "./panel-shell.module.css";

const ModelContext = createContext<PanelChromeModel | null>(null);

export function usePanelChromeModel(): PanelChromeModel {
  const model = useContext(ModelContext);
  if (!model) throw new Error("panel_chrome_model_unavailable");
  return model;
}

export function PanelLayoutClient({ model, children }: { model: PanelChromeModel; children: ReactNode }) {
  const [chrome, setChrome] = useState<PanelTopbarChromeState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname() ?? "";
  const handleChromeChange = useCallback((next: PanelTopbarChromeState | null) => {
    setChrome((current) => {
      if (!next) return current ? null : current;
      if (current?.title === next.title && current?.subtitle === next.subtitle) return current;
      return { title: next.title, subtitle: next.subtitle };
    });
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((current) => !current), []);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1025px)");
    const releaseDrawer = (event: MediaQueryListEvent) => {
      if (event.matches) closeDrawer();
    };
    if (desktop.matches) closeDrawer();
    desktop.addEventListener("change", releaseDrawer);
    return () => {
      desktop.removeEventListener("change", releaseDrawer);
    };
  }, [closeDrawer]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

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
          triggerRef={menuButtonRef}
        />
        <div className={styles.workspace}>
          <header className={styles.desktopTopbar}>
            <div><strong>{chrome?.title ?? "Genel bakış"}</strong><span>{chrome?.subtitle}</span></div>
            <div id="panel-topbar-actions" />
          </header>
          <PanelTopbarChromeProvider onChange={handleChromeChange}>
            <main className={styles.content}>{children}</main>
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
