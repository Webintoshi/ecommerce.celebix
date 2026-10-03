"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { ProductExplorerProps } from "../../components/ProductExplorer";
import { ProductGrid } from "../../components/ProductGrid";
import { catalogHref, PRODUCT_CATALOG_PAGE_SIZE, type ProductCatalogSelection } from "../../lib/product-catalog-query.ts";
import { guzideCatalogNavigation } from "./guzide-catalog.ts";
import styles from "./guzide-product-explorer.module.css";

const FILTERS = [["all", "Tüm ürünler"], ["available", "Stokta olanlar"], ["discounted", "İndirimli ürünler"]] as const;
const ORDERS = [["featured", "Öne çıkanlar"], ["title-asc", "Ürün adı"], ["price-asc", "Fiyat: düşükten yükseğe"], ["price-desc", "Fiyat: yüksekten düşüğe"]] as const;

export function GuzideProductExplorer({ products, locale, cardStyle, imageRatio, selection, total, nextOffset, path, catalog }: ProductExplorerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draftFilter, setDraftFilter] = useState(selection.filter);
  const [draftOrder, setDraftOrder] = useState(selection.order);
  const filter = useRef<HTMLDetailsElement>(null);
  const sort = useRef<HTMLDetailsElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const id = useId();
  const navigation = catalog ? guzideCatalogNavigation(catalog, locale) : { backHref: "/", links: [] };
  const title = catalog?.title ?? "Ürünler";
  const active = selection.filter !== "all" || selection.order !== "featured" || !!selection.query;

  const dismiss = (panel: HTMLDetailsElement | null, restoreFocus = false) => {
    if (!panel?.open) return;
    panel.open = false;
    if (restoreFocus) panel.querySelector("summary")?.focus();
  };
  useEffect(() => {
    setDraftFilter(selection.filter);
    setDraftOrder(selection.order);
    dismiss(filter.current);
    dismiss(sort.current);
  }, [selection.query, selection.filter, selection.order, selection.offset, path]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof window.Node && !controls.current?.contains(event.target)) {
        dismiss(filter.current);
        dismiss(sort.current);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  const navigate = (next: ProductCatalogSelection) => {
    if (pending) return;
    startTransition(() => router.push(catalogHref(path, next, 0), { scroll: false }));
  };
  const escape = (event: KeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    dismiss(event.currentTarget, true);
  };

  return <div className={styles.catalog} data-guzide-catalog aria-busy={pending}>
    <header className={styles.heading}>
      <Link href={navigation.backHref} prefetch={false} aria-label={navigation.backHref === "/" ? "Ana sayfaya dön" : "Üst kategoriye dön"}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M19 12H5m6-6-6 6 6 6" /></svg></Link>
      <h1>{title}</h1>
    </header>
    {navigation.links.length ? <nav className={styles.categories} aria-label="Kategoriler">{navigation.links.map(({ name, href, current }) => <Link prefetch={false} key={href} href={current ? catalogHref(href, selection, 0) : catalogHref(href, { ...selection, query: "" }, 0)} aria-current={current ? "page" : undefined}>{name}</Link>)}</nav> : null}
    <div className={styles.controls} ref={controls}>
      <details ref={filter} className={styles.control} data-catalog-panel="filter" onKeyDown={escape}>
        <summary onClick={(event) => { if (pending) { event.preventDefault(); return; } setDraftFilter(selection.filter); dismiss(sort.current); }}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" /><path d="M8 3v6m8 0v6m-5 0v6" /></svg>Filtrele{selection.filter !== "all" ? <span className={styles.activeDot} aria-label="Etkin filtre" /> : null}</summary>
        <div className={styles.panel}><form onSubmit={(event) => { event.preventDefault(); dismiss(filter.current, true); navigate({ ...selection, filter: draftFilter }); }}>
          <fieldset><legend>Ürünleri filtrele</legend>{FILTERS.map(([value, label]) => <label key={value} htmlFor={`${id}-filter-${value}`}><span>{label}</span><input id={`${id}-filter-${value}`} name="filter" type="radio" value={value} checked={draftFilter === value} onChange={() => setDraftFilter(value)} /></label>)}</fieldset>
          <button type="submit" disabled={pending}>Uygula</button>
        </form></div>
      </details>
      <details ref={sort} className={styles.control} data-catalog-panel="sort" onKeyDown={escape}>
        <summary onClick={(event) => { if (pending) { event.preventDefault(); return; } setDraftOrder(selection.order); dismiss(filter.current); }}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 4v16m-4-4 4 4 4-4m4-12v16m-4-12 4-4 4 4" /></svg>Sırala{selection.order !== "featured" ? <span className={styles.activeDot} aria-label="Etkin sıralama" /> : null}</summary>
        <div className={styles.panel}><form onSubmit={(event) => { event.preventDefault(); dismiss(sort.current, true); navigate({ ...selection, order: draftOrder }); }}>
          <fieldset><legend>Ürünleri sırala</legend>{ORDERS.map(([value, label]) => <label key={value} htmlFor={`${id}-sort-${value}`}><span>{label}</span><input id={`${id}-sort-${value}`} name="sort" type="radio" value={value} checked={draftOrder === value} onChange={() => setDraftOrder(value)} /></label>)}</fieldset>
          <button type="submit" disabled={pending}>Uygula</button>
        </form></div>
      </details>
    </div>
    {active ? <div className={styles.applied}><span>{[selection.query ? `“${selection.query}”` : "", selection.filter !== "all" ? FILTERS.find(([value]) => value === selection.filter)?.[1] : "", selection.order !== "featured" ? ORDERS.find(([value]) => value === selection.order)?.[1] : ""].filter(Boolean).join(" · ")}</span><button type="button" data-catalog-clear disabled={pending} onClick={() => navigate({ query: "", filter: "all", order: "featured", offset: 0 })}>Temizle</button></div> : null}
    <p className="sr-only" role="status">{pending ? "Ürünler güncelleniyor…" : `${total} ürün bulundu`}</p>
    <div className={styles.products} data-pending={pending ? "true" : undefined}>{products.length ? <ProductGrid products={products} preserveOrder locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} /> : <div className={styles.empty}><h2>{active ? "Sonuç bulunamadı" : "Ürünler hazırlanıyor"}</h2><p>{active ? "Filtreleri temizleyerek tekrar deneyebilirsiniz." : "Bu kategorinin aktif ürünleri yakında burada olacak."}</p></div>}</div>
    {selection.offset > 0 || nextOffset !== null ? <nav className={styles.pagination} aria-label="Ürün sayfaları">
      {selection.offset > 0 ? <Link prefetch={false} href={catalogHref(path, selection, Math.max(0, selection.offset - PRODUCT_CATALOG_PAGE_SIZE))}>Önceki ürünler</Link> : null}
      {nextOffset !== null ? <Link prefetch={false} href={catalogHref(path, selection, nextOffset)}>Sonraki ürünler</Link> : null}
    </nav> : null}
  </div>;
}
