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
  Map as MapIcon,
  Share2,
  Code2,
  ChevronDown,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
  sitemap: MapIcon,
  "social-preview": Share2,
  code: Code2,
  indexing: Gauge,
  setup: Settings,
});

function getSidebarLabel(item: PanelNavigationItem): string {
  if (item.key === "summary") return "Genel Bakış";
  if (item.key === "seo") return "SEO Araçları";
  return item.label;
}

const NAVIGATION_SECTIONS = [
  { key: "general", label: "Genel", items: ["summary", "analytics"] },
  { key: "commerce", label: "Ticaret", items: ["orders", "customers", "catalog"] },
  { key: "growth", label: "Büyüme", items: ["discounts", "marketing", "content", "marketplaces", "seo"] },
  { key: "management", label: "Yönetim", items: ["accounting", "settings"] },
] as const;

function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{M}/gu, "").trim();
}

function findNavigationMatches(navigation: readonly PanelNavigationItem[], searchTerm: string) {
  const matches: Array<{ item: PanelNavigationItem; context?: string }> = [];
  const seenHrefs = new Set<PanelNavigationHref>();
  for (const parent of navigation) {
    for (const entry of [parent, ...(parent.children ?? [])]) {
      const context = entry === parent ? undefined : getSidebarLabel(parent);
      if (!normalizeSearch(getSidebarLabel(entry)).includes(searchTerm)) continue;
      if (seenHrefs.has(entry.href)) continue;
      seenHrefs.add(entry.href);
      matches.push({ item: entry, context });
    }
  }
  return matches;
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
  context,
}: {
  item: PanelNavigationItem;
  currentHref: PanelNavigationHref | undefined;
  context?: string;
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
      <span className={styles.iconBox}>
        <Icon aria-hidden="true" />
      </span>
      <span className={styles.navigationLinkCopy}>
        <span className={styles.navigationLabel}>{label}</span>
        {context ? <small className={styles.navigationContext}>{context}</small> : null}
      </span>
    </Link>
  );
}

function NavigationEntry({
  item,
  pathname,
  currentHref,
  mode,
  expandedGroup,
  onToggleGroup,
}: {
  item: PanelNavigationItem;
  pathname: string;
  currentHref: PanelNavigationHref | undefined;
  mode: "desktop" | "drawer";
  expandedGroup: string | undefined;
  onToggleGroup: (key: string) => void;
}) {
  if (!item.children?.length) {
    return <NavigationLink item={item} currentHref={currentHref} />;
  }

  const expanded = expandedGroup === item.key;
  const childrenId = `panel-nav-${item.key}-${mode}`;
  const groupActive = isPanelNavigationPathActive(pathname, item.href);
  const parentCurrent = currentHref === item.href && !item.children.some((child) => child.href === item.href);
  const Icon = ICONS[item.icon];
  const label = getSidebarLabel(item);

  return (
    <div className={styles.navigationGroup}>
      <div className={styles.navigationGroupHeader}>
        <Link
          href={item.href}
          className={`${styles.navigationGroupLabel} ${parentCurrent ? styles.navigationGroupActive : ""} ${groupActive ? styles.navigationGroupInPath : ""}`}
          aria-current={parentCurrent ? "page" : undefined}
        >
          <span className={styles.iconBox}>
            <Icon aria-hidden="true" />
          </span>
          <span className={styles.navigationLabel}>{label}</span>
        </Link>
        <button
          type="button"
          className={styles.navigationGroupToggle}
          aria-label={`${label} alt menüsünü ${expanded ? "kapat" : "aç"}`}
          aria-expanded={expanded}
          aria-controls={childrenId}
          onClick={() => onToggleGroup(item.key)}
        >
          <ChevronDown aria-hidden="true" />
        </button>
      </div>
      <div id={childrenId} className={styles.navigationChildren} hidden={!expanded}>
        {item.children.map((child) => (
          <NavigationLink key={child.key} item={child} currentHref={currentHref} />
        ))}
      </div>
    </div>
  );
}

export function PanelNavigation({
  mode,
  analyticsAvailable = false,
  navigationMode,
}: {
  mode: "desktop" | "drawer";
  analyticsAvailable?: boolean;
  navigationMode?: "register";
}) {
  const pathname = usePathname() ?? "";
  const navigation = getPanelNavigation({ analyticsAvailable, navigationMode }).filter(({ key }) => key !== "setup");
  const currentHref = getCurrentNavigationHref(pathname, navigation);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const searchTerm = normalizeSearch(query);
  const navigationByKey = new Map(navigation.map((item) => [item.key, item]));
  const searchResults = searchTerm ? findNavigationMatches(navigation, searchTerm) : [];
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onShortcut = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      const input = searchRef.current;
      if (!input || input.getClientRects?.().length === 0) return;
      event.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  function toggleGroup(key: string) {
    setExpandedGroup((current) => current === key ? undefined : key);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && searchResults.length) {
      event.preventDefault();
      resultsRef.current?.querySelector<HTMLAnchorElement>("a[href]")?.focus();
      return;
    }
    if (event.key !== "Escape") return;
    if (query) {
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
    } else if (mode === "desktop") {
      searchRef.current?.blur();
    }
  }

  return (
    <div className={styles.navigationShell}>
      <div className={styles.navigationSearch}>
        <Search aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
          aria-label="Menüde ara"
          placeholder="Menüde ara"
          autoComplete="off"
        />
        {!query ? <kbd aria-hidden="true">⌘ K</kbd> : null}
      </div>
      <nav className={styles.navigation} aria-label={mode === "drawer" ? "Mobil panel menüsü" : "Panel menüsü"}>
        {searchTerm ? (
          <section ref={resultsRef} className={styles.navigationSection} aria-label="Arama sonuçları">
            <span className={styles.navigationSectionLabel} role="status">{searchResults.length} sonuç</span>
            {searchResults.length ? searchResults.map(({ item, context }) => (
              <NavigationLink key={item.key} item={item} currentHref={currentHref} context={context} />
            )) : <p className={styles.navigationEmpty}>Sonuç bulunamadı. Başka bir kelime deneyin.</p>}
          </section>
        ) : (navigationMode === 'register' ? [{key:'register',label:'Mağaza',items:['quick-orders']}] : NAVIGATION_SECTIONS).map((section) => {
          const sectionItems = section.items.map((key) => navigationByKey.get(key)).filter((item): item is PanelNavigationItem => Boolean(item));
          if (!sectionItems.length) return null;
          const headingId = `panel-nav-section-${section.key}-${mode}`;
          return (
            <section className={styles.navigationSection} aria-labelledby={headingId} key={section.key}>
              <span id={headingId} className={styles.navigationSectionLabel}>{section.label}</span>
              {sectionItems.map((item) => (
                <NavigationEntry
                  key={item.key}
                  item={item}
                  pathname={pathname}
                  currentHref={currentHref}
                  mode={mode}
                  expandedGroup={expandedGroup}
                  onToggleGroup={toggleGroup}
                />
              ))}
            </section>
          );
        })}
      </nav>
    </div>
  );
}
