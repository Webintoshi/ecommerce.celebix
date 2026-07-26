"use client";

import {
  Home,
  Layers3,
  Link2,
  ListTree,
  Package,
  PieChart,
  Plus,
  Puzzle,
  BadgeCheck,
  Settings,
  SlidersHorizontal,
  ShoppingBag,
  ShoppingCart,
  Star,
  Tags,
  Upload,
  UserPlus,
  Users,
  BadgePercent,
  CirclePlus,
  Gift,
  Megaphone,
  Mail,
  Phone,
  MessageCircle,
  Newspaper,
  FileText,
  ScrollText,
  Store,
  Settings2,
  Languages,
  CreditCard,
  Truck,
  ShieldCheck,
  Calculator,
  ReceiptText,
  SearchCheck,
  Map,
  Share2,
  Code2,
  Gauge,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isPanelNavigationPathActive,
  getPanelNavigation,
  type PanelNavigationHref,
  type PanelNavigationIcon,
  type PanelNavigationItem,
} from "@/lib/panel-ui/navigation";
import styles from "./panel-shell.module.css";

const ICONS: Readonly<Record<PanelNavigationIcon, LucideIcon>> = Object.freeze({
  home: Home,
  orders: ShoppingBag,
  "quick-orders": Link2,
  "abandoned-carts": ShoppingCart,
  customers: Users,
  segments: PieChart,
  tags: Tags,
  "add-customer": UserPlus,
  products: Package,
  "add-product": Plus,
  collections: Layers3,
  brands: BadgeCheck,
  attributes: SlidersHorizontal,
  extras: Puzzle,
  reviews: Star,
  definitions: ListTree,
  "bulk-upload": Upload,
  discounts: BadgePercent,
  "add-discount": CirclePlus,
  "lucky-wheel": Gift,
  marketing: Megaphone,
  email: Mail,
  phone: Phone,
  whatsapp: MessageCircle,
  content: Newspaper,
  blog: Newspaper,
  pages: FileText,
  policies: ScrollText,
  marketplaces: Store,
  settings: Settings2,
  language: Languages,
  payment: CreditCard,
  shipping: Truck,
  administrators: ShieldCheck,
  accounting: Calculator,
  invoice: ReceiptText,
  seo: SearchCheck,
  sitemap: Map,
  "social-preview": Share2,
  code: Code2,
  indexing: Gauge,
  setup: Settings,
  analytics: BarChart3,
});

function getCurrentNavigationHref(
  pathname: string,
  navigation: readonly PanelNavigationItem[],
): PanelNavigationHref | undefined {
  let currentHref: PanelNavigationHref | undefined;
  for (const item of navigation) {
    const links = item.children?.length ? item.children : [item];
    for (const link of links) {
      if (
        isPanelNavigationPathActive(pathname, link.href) &&
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
      <span className={styles.navigationLabel}>{item.label}</span>
    </Link>
  );
}

export function PanelNavigation({ mode, analyticsAvailable }: { mode: "desktop" | "drawer"; analyticsAvailable: boolean }) {
  const pathname = usePathname() ?? "";
  const navigation = getPanelNavigation({ analyticsAvailable });
  const currentHref = getCurrentNavigationHref(pathname, navigation);
  return (
    <nav
      className={styles.navigation}
      aria-label={mode === "drawer" ? "Mobil panel menüsü" : "Panel menüsü"}
    >
      {navigation.map((item) =>
        item.children?.length ? (
          <section className={styles.navigationGroup} key={item.key}>
            <div
              className={`${styles.navigationGroupLabel} ${isPanelNavigationPathActive(pathname, item.href) ? styles.navigationGroupActive : ""}`}
            >
              <span className={styles.activeRail} aria-hidden="true" />
              <span className={styles.iconBox}>
                {(() => {
                  const Icon = ICONS[item.icon];
                  return <Icon aria-hidden="true" />;
                })()}
              </span>
              <span className={styles.navigationLabel}>{item.label}</span>
            </div>
            <div className={styles.navigationChildren}>
              {item.children.map((child) => (
                <NavigationLink
                  key={child.key}
                  item={child}
                  currentHref={currentHref}
                />
              ))}
            </div>
          </section>
        ) : (
          <NavigationLink
            key={item.key}
            item={item}
            currentHref={currentHref}
          />
        ),
      )}
    </nav>
  );
}
