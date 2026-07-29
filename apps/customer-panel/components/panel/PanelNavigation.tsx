"use client";

import {
  Home,
  BarChart3,
  BadgeDollarSign,
  ScanBarcode,
  Warehouse,
  Palette,
  Layers3,
  Link2,
  ListTree,
  Package,
  PieChart,
  Puzzle,
  BadgeCheck,
  Settings,
  SlidersHorizontal,
  ShoppingBag,
  ShoppingCart,
  Star,
  Tags,
  Upload,
  Users,
  Percent,
  Gift,
  Megaphone,
  Mail,
  Phone,
  MessageCircle,
  Newspaper,
  FileText,
  ScrollText,
  Store,
  Languages,
  CreditCard,
  Truck,
  ShieldCheck,
  Calculator,
  ReceiptText,
  Search,
  Map,
  Share2,
  Code2,
  ChevronDown,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  isPanelNavigationPathActive,
  isPanelNavigationPathExact,
  getPanelNavigation,
  type PanelNavigationHref,
  type PanelNavigationIcon,
  type PanelNavigationItem,
} from "@/lib/panel-ui/navigation";
import styles from "./panel-shell.module.css";

const ICONS: Readonly<Record<PanelNavigationIcon, LucideIcon>> = Object.freeze({
  home: Home,
  analytics: BarChart3,
  orders: ShoppingBag,
  "quick-orders": Link2,
  "abandoned-carts": ShoppingCart,
  customers: Users,
  segments: PieChart,
  tags: Tags,
  products: Package,
  collections: Layers3,
  brands: BadgeCheck,
  attributes: SlidersHorizontal,
  extras: Puzzle,
  reviews: Star,
  definitions: ListTree,
  barcode: ScanBarcode,
  purchasing: ReceiptText,
  inventory: Warehouse,
  "price-lists": BadgeDollarSign,
  "bulk-upload": Upload,
  discounts: Percent,
  "lucky-wheel": Gift,
  marketing: Megaphone,
  email: Mail,
  phone: Phone,
  whatsapp: MessageCircle,
  content: FileText,
  blog: Newspaper,
  pages: FileText,
  policies: ScrollText,
  marketplaces: Store,
  settings: Settings,
  design: Palette,
  language: Languages,
  payment: CreditCard,
  shipping: Truck,
  administrators: ShieldCheck,
  accounting: Calculator,
  invoice: ReceiptText,
  seo: Search,
  sitemap: Map,
  "social-preview": Share2,
  code: Code2,
  indexing: Gauge,
  setup: Settings,
});

function getSidebarLabel(item: PanelNavigationItem): string {
  if (item.key === "summary") return "Giriş";
  if (item.key === "seo") return "SEO Araçları";
  return item.label;
}

function getCurrentNavigationHref(
  pathname: string,
  navigation: readonly PanelNavigationItem[],
): PanelNavigationHref | undefined {
  let currentHref: PanelNavigationHref | undefined;
  for (const item of navigation) {
    const hasIndexChild = item.children?.some((child) => child.href === item.href) ?? false;
    const links = item.children?.length
      ? [...(hasIndexChild ? [] : [item]), ...item.children]
      : [item];
    for (const link of links) {
      const indexChild = Boolean(item.children?.length && link.href === item.href);
      if (
        (indexChild
          ? isPanelNavigationPathExact(pathname, link.href)
          : isPanelNavigationPathActive(pathname, link.href)) &&
        (!currentHref || link.href.length > currentHref.length)
      ) {
        currentHref = link.href;
      }
    }
  }
  return currentHref;
}

function NavigationLink({
  item,
  currentHref,
}: {
  item: PanelNavigationItem;
  currentHref: PanelNavigationHref | undefined;
}) {
  const active = item.href === currentHref;
  const Icon = ICONS[item.icon];
  const label = getSidebarLabel(item);
  return (
    <Link
      href={item.href}
      className={`${styles.navigationLink} ${active ? styles.navigationLinkActive : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <span className={styles.activeRail} aria-hidden="true" />
      <span className={styles.iconBox}>
        <Icon aria-hidden="true" />
      </span>
      <span className={styles.navigationLabel}>{label}</span>
    </Link>
  );
}

export function PanelNavigation({
  mode,
  analyticsAvailable = false,
}: {
  mode: "desktop" | "drawer";
  analyticsAvailable?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const navigation = getPanelNavigation({ analyticsAvailable }).filter(({ key }) => key !== "setup");
  const currentHref = getCurrentNavigationHref(pathname, navigation);
  const activeGroupKeys = navigation.filter((item) => (
    item.children?.length && isPanelNavigationPathActive(pathname, item.href)
  )).map(({ key }) => key);
  const [expandedGroup, setExpandedGroup] = useState<string | undefined>(
    () => activeGroupKeys[0],
  );

  useEffect(() => {
    if (!activeGroupKeys.length) return;
    setExpandedGroup(activeGroupKeys[0]);
  }, [pathname]);

  function toggleGroup(key: string) {
    setExpandedGroup((current) => current === key ? undefined : key);
  }

  return (
    <nav
      className={styles.navigation}
      aria-label={mode === "drawer" ? "Mobil panel menüsü" : "Panel menüsü"}
    >
      {navigation.map((item) => {
        if (!item.children?.length) {
          return (
          <NavigationLink
            key={item.key}
            item={item}
            currentHref={currentHref}
          />
          );
        }

        const expanded = expandedGroup === item.key;
        const childrenId = `panel-nav-${item.key}-${mode}`;
        const groupActive = isPanelNavigationPathActive(pathname, item.href);
        const Icon = ICONS[item.icon];
        const label = getSidebarLabel(item);
        return (
          <section className={styles.navigationGroup} key={item.key}>
            <div className={styles.navigationGroupHeader}>
              <Link
                href={item.href}
                className={`${styles.navigationGroupLabel} ${groupActive ? styles.navigationGroupActive : ""}`}
                aria-current={currentHref === item.href && !item.children.some((child) => child.href === item.href) ? "page" : undefined}
              >
                <span className={styles.activeRail} aria-hidden="true" />
                <span className={styles.iconBox}>
                  <Icon aria-hidden="true" />
                </span>
                <span className={styles.navigationLabel}>{label}</span>
              </Link>
              <button
                type="button"
                className={`${styles.navigationGroupToggle} ${groupActive ? styles.navigationGroupToggleActive : ""}`}
                aria-label={`${label} alt menüsünü ${expanded ? "kapat" : "aç"}`}
                aria-expanded={expanded}
                aria-controls={childrenId}
                onClick={() => toggleGroup(item.key)}
              >
                <ChevronDown aria-hidden="true" />
              </button>
            </div>
            <div
              id={childrenId}
              className={styles.navigationChildren}
              hidden={!expanded}
            >
              {item.children.map((child) => (
                <NavigationLink
                  key={child.key}
                  item={child}
                  currentHref={currentHref}
                />
              ))}
            </div>
          </section>
        );
      })}
    </nav>
  );
}
