"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ProductExplorerProps } from "../../components/ProductExplorer";
import { CatalogProductList } from "../../components/CatalogProductList";
import { catalogHref, isValidProductCatalogSearch } from "../../lib/product-catalog-query.ts";
import { HizliIcon } from "./HizliIcon";

export function HizliProductExplorer(props: ProductExplorerProps) {
  const { selection, path, total, products, catalog } = props;
  const router = useRouter(), dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(selection), [open, setOpen] = useState(false);
  useEffect(() => { setDraft(selection); setOpen(false); }, [selection.query, selection.order, selection.filter, selection.offset, path]);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current, overflow = document.body.style.overflow;
    element.showModal(); document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; opener.current?.focus(); };
  }, [open]);
  const apply = (event: FormEvent) => { event.preventDefault(); setOpen(false); router.push(catalogHref(path, { ...draft, query: draft.query.trim() }, 0)); };
  const choices = <><label>Sıralama<select value={draft.order} onChange={event => setDraft({ ...draft, order: event.currentTarget.value as typeof draft.order })}><option value="featured">Öne çıkanlar</option><option value="title-asc">Ürün adı</option><option value="price-asc">Fiyat: artan</option><option value="price-desc">Fiyat: azalan</option></select></label><label>Ürünler<select value={draft.filter} onChange={event => setDraft({ ...draft, filter: event.currentTarget.value as typeof draft.filter })}><option value="all">Tüm ürünler</option><option value="available">Stokta olanlar</option><option value="discounted">İndirimli ürünler</option></select></label></>;
  const narrowed = selection.query || selection.filter !== "all";
  return <div className="hk-explorer">
    <div className="hk-catalog-heading"><h1>{catalog?.title ?? "Tüm ürünler"}</h1><span aria-live="polite">{total} ürün</span></div>
    <form className="hk-catalog-toolbar" role="search" onSubmit={apply}><label className="hk-catalog-query">Ürün ara<input type="search" value={draft.query} placeholder="Ürün adı veya kodu" maxLength={100} onChange={event => { if (isValidProductCatalogSearch(event.currentTarget.value)) setDraft({ ...draft, query: event.currentTarget.value }); }} /></label><div className="hk-desktop-filters">{choices}</div><button type="submit" className="hk-button hk-desktop-filter-apply">Uygula</button><button ref={opener} className="hk-mobile-filter" type="button" onClick={() => setOpen(true)}>Filtrele ve sırala<HizliIcon name="chevron" /></button></form>
    {narrowed ? <div className="hk-active-filters"><span>{selection.query ? `“${selection.query}”` : selection.filter === "available" ? "Stokta olanlar" : "İndirimli ürünler"}</span><Link href={path}>Seçimleri temizle</Link></div> : null}
    {total === 0 && products.length === 0 ? <div className="store-empty"><HizliIcon name="bag" /><h2>{narrowed ? "Aradığınız ürün bulunamadı" : "Ürünlerimiz yakında burada"}</h2><p>{narrowed ? "Farklı bir kelimeyle arayabilir veya seçimlerinizi temizleyebilirsiniz." : "Yeni ürünler eklendiğinde bu sayfada yer alacak."}</p><Link className="hk-button" href={narrowed ? path : "/"}>{narrowed ? "Tümünü gör" : "Ana sayfaya dön"}<HizliIcon name="arrow" /></Link></div> : <CatalogProductList {...props} />}
    <dialog className="hk-dialog hk-filter-dialog" ref={dialog} aria-label="Filtrele ve sırala" onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}><div className="hk-panel"><header className="hk-panel-heading"><h2>Filtrele ve sırala</h2><button type="button" aria-label="Filtreleri kapat" onClick={() => setOpen(false)}><HizliIcon name="close" /></button></header><form onSubmit={apply}>{choices}<button className="hk-button" type="submit">Sonuçları göster<HizliIcon name="arrow" /></button></form></div></dialog>
  </div>;
}
