"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { PanelChromeModel } from "@/lib/panel-ui/chrome-model";
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
  const handleChromeChange = useCallback((next: PanelTopbarChromeState | null) => {
    setChrome((current) => {
      if (!next) return current ? null : current;
      if (current?.title === next.title && current?.subtitle === next.subtitle) return current;
      return { title: next.title, subtitle: next.subtitle };
    });
  }, []);
  return (
    <ModelContext.Provider value={model}>
      <div className={styles.shell}>
        <PanelSidebar model={model} mode="desktop" />
        <div className={styles.workspace}>
          <header className={styles.desktopTopbar}>
            <div><strong>{chrome?.title ?? "Genel bakış"}</strong><span>{chrome?.subtitle}</span></div>
            <div id="panel-topbar-actions" />
          </header>
          <PanelTopbarChromeProvider onChange={handleChromeChange}>
            <main className={styles.content}>{children}</main>
          </PanelTopbarChromeProvider>
        </div>
      </div>
    </ModelContext.Provider>
  );
}
