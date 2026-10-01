"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ProductExplorerProps } from "../../components/ProductExplorer";
import { ProductGrid } from "../../components/ProductGrid";
import { useCartStatus } from "../../components/CartStatusProvider";
import { catalogHref, isValidProductCatalogSearch, type ProductCatalogSelection } from "../../lib/product-catalog-query.ts";
import { useSioraPanelHistory } from "./useSioraPanelHistory";
import { SIORA_STOREFRONT_ID } from "./theme.ts";

const FILTERS = [["all", "Tüm ürünler"], ["available", "Stokta olanlar"], ["discounted", "İndirimli ürünler"]] as const;
const ORDERS = [["featured", "Öne çıkanlar"], ["title-asc", "Ürün adı"], ["price-asc", "Fiyat: düşükten yükseğe"], ["price-desc", "Fiyat: yüksekten düşüğe"]] as const;

export function SioraProductExplorer({ products, locale, cardStyle, imageRatio, selection, total, nextOffset, path, preserveOrder = false }: ProductExplorerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(selection.query);
  const [draft, setDraft] = useState(selection);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const { drawerOpen } = useCartStatus();
  const panelHistory = useSioraPanelHistory({ storefrontId: SIORA_STOREFRONT_ID, panel: "filters", onClose: () => dialog.current?.close() });
  const activeCount = Number(selection.filter !== "all") + Number(selection.order !== "featured");
  useEffect(() => { setQuery(selection.query); setDraft(selection); }, [selection]);
  useEffect(() => { if (drawerOpen && dialog.current?.open) { dialog.current.close(); void panelHistory.close(); } }, [drawerOpen, panelHistory.close]);
  const navigate = (next: ProductCatalogSelection) => startTransition(() => router.push(catalogHref(path, next, 0), { scroll: false }));
  const search = (event: FormEvent) => { event.preventDefault(); navigate({ ...selection, query: query.trim() }); };
  const close = () => { dialog.current?.close(); return panelHistory.close(); };
  const open = () => { setDraft({ ...selection, query: query.trim() }); if (panelHistory.open()) dialog.current?.showModal(); };
  return <div className="siora-catalog product-explorer" aria-busy={pending}>
    <header className="siora-catalog-heading"><div><h2>Tüm ürünler</h2><p aria-live="polite">{total} ürün</p></div><button className="siora-filter-trigger" ref={trigger} onClick={open} type="button" aria-haspopup="dialog"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="currentColor" /><circle cx="15" cy="17" r="2" fill="currentColor" /></svg>Filtrele ve sırala{activeCount ? <span>{activeCount}</span> : null}</button></header>
    <form className="siora-catalog-search" onSubmit={search} role="search"><label className="sr-only" htmlFor={`${headingId}-search`}>Koleksiyonda ara</label><input id={`${headingId}-search`} name="q" value={query} onChange={(event) => { if (isValidProductCatalogSearch(event.currentTarget.value)) setQuery(event.currentTarget.value); }} type="search" maxLength={100} placeholder="Koleksiyonda ara" /><button type="submit" aria-label="Koleksiyonda ara"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></button></form>
    {activeCount || selection.query ? <div className="siora-applied-filters"><span>{selection.query || FILTERS.find(([value]) => value === selection.filter)?.[1]} · {ORDERS.find(([value]) => value === selection.order)?.[1]}</span><button onClick={() => navigate({ query: "", filter: "all", order: "featured", offset: 0 })} type="button">Temizle</button></div> : null}
    <div className="siora-catalog-products" data-pending={pending ? "true" : undefined}>{products.length ? <ProductGrid products={products} preserveOrder={preserveOrder} locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} /> : <div className="store-empty"><h2>{selection.query || activeCount ? "Sonuç bulunamadı" : "Koleksiyon hazırlanıyor"}</h2><p>{selection.query || activeCount ? "Başka bir ürün adı deneyin veya filtrelerinizi temizleyin." : "Yeni parçalar yakında burada olacak."}</p></div>}</div>
    {selection.offset > 0 || nextOffset !== null ? <nav className="siora-catalog-pagination" aria-label="Ürün sayfaları">{selection.offset > 0 ? <Link prefetch={false} href={catalogHref(path, selection, Math.max(0, selection.offset - 24))}>Önceki ürünler</Link> : null}{nextOffset !== null ? <Link prefetch={false} href={catalogHref(path, selection, nextOffset)}>Sonraki ürünler</Link> : null}</nav> : null}
    <dialog className="siora-filter-dialog" ref={dialog} aria-labelledby={headingId} onCancel={(event) => { event.preventDefault(); void close(); }} onClose={() => trigger.current?.focus()} onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) void close(); } }}>
      <div className="siora-filter-panel"><header><h2 id={headingId}>Filtrele ve sırala</h2><button type="button" aria-label="Filtreleri kapat" onClick={() => void close()}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header><form onSubmit={(event) => { event.preventDefault(); void close().then((sameRoute) => { if (sameRoute) navigate(draft); }); }}><fieldset><legend>Sıralama</legend>{ORDERS.map(([value, label]) => <label key={value}><span>{label}</span><input type="radio" name="sort" value={value} checked={draft.order === value} onChange={() => setDraft({ ...draft, order: value })} /></label>)}</fieldset><fieldset><legend>Ürünler</legend>{FILTERS.map(([value, label]) => <label key={value}><span>{label}</span><input type="radio" name="filter" value={value} checked={draft.filter === value} onChange={() => setDraft({ ...draft, filter: value })} /></label>)}</fieldset><footer><button className="store-button" type="submit">Sonuçları görüntüle</button><button className="siora-filter-clear" type="button" onClick={() => setDraft({ ...draft, filter: "all", order: "featured" })}>Seçimleri temizle</button></footer></form></div>
    </dialog>
  </div>;
}
