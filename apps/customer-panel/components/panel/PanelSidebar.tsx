"use client";

import Link from "next/link";
import type { PanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { LogoutButton } from "./LogoutButton";
import { PanelNavigation } from "./PanelNavigation";
import styles from "./panel-shell.module.css";

export function PanelSidebar({ model, mode }: {
  model: PanelChromeModel;
  mode: "desktop" | "drawer";
}) {
  return (
    <aside className={mode === "desktop" ? styles.desktopSidebar : styles.drawer}>
      <Link className={styles.brand} href="/" aria-label="Celebix Panel ana sayfa">
        <span aria-hidden="true">C</span><strong>Celebix</strong>
      </Link>
      <div className={styles.merchantIdentity} aria-label="Etkin mağaza">
        <strong>{model.storeSlug}</strong><small>{model.membershipLabel}</small>
      </div>
      <PanelNavigation mode={mode} />
      <div className={styles.sidebarFooter}><LogoutButton /></div>
    </aside>
  );
}
