"use client";

import { Home, Package, Plus, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isPanelNavigationPathActive,
  PANEL_NAVIGATION,
  type PanelNavigationHref,
  type PanelNavigationIcon,
  type PanelNavigationItem,
} from "@/lib/panel-ui/navigation";
import styles from "./panel-shell.module.css";

const ICONS: Readonly<Record<PanelNavigationIcon, LucideIcon>> = Object.freeze({
  home: Home,
  products: Package,
  "add-product": Plus,
  setup: Settings,
});

function getCurrentNavigationHref(pathname: string): PanelNavigationHref | undefined {
  let currentHref: PanelNavigationHref | undefined;
  for (const item of PANEL_NAVIGATION) {
    const links = item.children?.length ? item.children : [item];
    for (const link of links) {
      if (
        isPanelNavigationPathActive(pathname, link.href)
        && (!currentHref || link.href.length > currentHref.length)
      ) {
        currentHref = link.href;
      }
    }
  }
  return currentHref;
}

function NavigationLink({ item, currentHref }: {
  item: PanelNavigationItem;
  currentHref: PanelNavigationHref | undefined;
}) {
  const active = item.href === currentHref;
  const Icon = ICONS[item.icon];
  return (
    <Link
      href={item.href}
      className={`${styles.navigationLink} ${active ? styles.navigationLinkActive : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <span className={styles.activeRail} aria-hidden="true" />
      <span className={styles.iconBox}><Icon aria-hidden="true" /></span>
      <span className={styles.navigationLabel}>{item.label}</span>
    </Link>
  );
}

export function PanelNavigation({ mode }: { mode: "desktop" | "drawer" }) {
  const pathname = usePathname() ?? "";
  const currentHref = getCurrentNavigationHref(pathname);
  return (
    <nav className={styles.navigation} aria-label={mode === "drawer" ? "Mobil panel menüsü" : "Panel menüsü"}>
      {PANEL_NAVIGATION.map((item) => item.children?.length ? (
        <section className={styles.navigationGroup} key={item.key}>
          <div className={`${styles.navigationGroupLabel} ${isPanelNavigationPathActive(pathname, item.href) ? styles.navigationGroupActive : ""}`}>
            <span className={styles.activeRail} aria-hidden="true" />
            <span className={styles.iconBox}><Package aria-hidden="true" /></span>
            <span className={styles.navigationLabel}>{item.label}</span>
          </div>
          <div className={styles.navigationChildren}>
            {item.children.map((child) => <NavigationLink key={child.key} item={child} currentHref={currentHref} />)}
          </div>
        </section>
      ) : <NavigationLink key={item.key} item={item} currentHref={currentHref} />)}
    </nav>
  );
}
