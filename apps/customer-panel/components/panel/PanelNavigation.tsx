"use client";

import { Home, Package, Plus, Settings, ShoppingBag, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isPanelNavigationPathActive,
  PANEL_NAVIGATION,
  PANEL_ORDER_NAVIGATION,
  type PanelNavigationHref,
  type PanelNavigationIcon,
  type PanelNavigationItem,
} from "@/lib/panel-ui/navigation";
import styles from "./panel-shell.module.css";

const ICONS: Readonly<Record<PanelNavigationIcon, LucideIcon>> = Object.freeze({
  home: Home,
  orders: ShoppingBag,
  products: Package,
  "add-product": Plus,
  setup: Settings,
});

const NAVIGATION: readonly PanelNavigationItem[] = PANEL_ORDER_NAVIGATION === undefined
  ? PANEL_NAVIGATION
  : Object.freeze([PANEL_NAVIGATION[0]!, PANEL_ORDER_NAVIGATION, ...PANEL_NAVIGATION.slice(1)]);

function getCurrentNavigationHref(pathname: string): PanelNavigationHref | undefined {
  let currentHref: PanelNavigationHref | undefined;
  for (const item of NAVIGATION) {
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
      {NAVIGATION.map((item) => item.children?.length ? (
        <section className={styles.navigationGroup} key={item.key}>
          <div className={`${styles.navigationGroupLabel} ${isPanelNavigationPathActive(pathname, item.href) ? styles.navigationGroupActive : ""}`}>
            <span className={styles.activeRail} aria-hidden="true" />
            <span className={styles.iconBox}>{(() => { const Icon = ICONS[item.icon]; return <Icon aria-hidden="true" />; })()}</span>
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
