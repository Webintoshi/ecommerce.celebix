"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogAdminResource, CatalogCategory } from "@celebix/saas-contracts";
import { Search } from "lucide-react";
import { PanelEmptyState, PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { catalogAdminApi, CatalogAdminApiError } from "@/lib/catalog-admin-ui/client";
import { catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import { CATALOG_EXTRA_TYPES, catalogExtraHref, catalogExtraType, type CatalogExtraType } from "./registry";
import styles from "./extras.module.css";

export function CatalogExtrasConsole({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<readonly CatalogAdminResource[]>([]);
  const [categories, setCategories] = useState<readonly CatalogCategory[]>([]);
  const [categoryState, setCategoryState] = useState<"loading" | "ready" | "error">("loading");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<CatalogExtraType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [archiving, setArchiving] = useState<readonly string[]>([]);
  const request = useRef(0);

  const loadCategories = useCallback(async () => {
    setCategoryState("loading");
    try { setCategories(await catalogOnboardingClient.listCategories()); setCategoryState("ready"); }
    catch { setCategoryState("error"); }
  }, []);
  const load = useCallback(async () => {
    const sequence = ++request.current;
    setLoading(true); setError("");
    try { const resources = await catalogAdminApi.resources("extra"); if (request.current === sequence) setItems(resources.filter((item) => item.status === "active")); }
    catch (caught) { if (request.current === sequence) setError(caught instanceof CatalogAdminApiError ? caught.message : "Ekstralar yüklenemedi."); }
    finally { if (request.current === sequence) setLoading(false); }
  }, []);
  useEffect(() => { void load(); void loadCategories(); return () => { request.current += 1; }; }, [load, loadCategories]);

  async function archive(resource: CatalogAdminResource) {
    if (archiving.includes(resource.id) || !window.confirm(`${resource.name} arşivlensin mi? ${catalogExtraType(resource) === "size_guide" ? "Rehber mağazada gösterilmeyecek." : "Ekstra aktif listeden kaldırılacak."}`)) return;
    setArchiving((current) => [...current, resource.id]); setError("");
    try { await catalogAdminApi.archiveResource("extra", resource.id, resource.version); setItems((current) => current.filter((item) => item.id !== resource.id)); }
    catch (caught) { setError(caught instanceof CatalogAdminApiError ? caught.message : "Ekstra arşivlenemedi."); }
    finally { setArchiving((current) => current.filter((id) => id !== resource.id)); }
  }

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR");
  const visible = items.filter((resource) => (type === "all" || catalogExtraType(resource) === type) && (!normalizedSearch || [resource.name, resource.slug, resource.description ?? "", ...(Array.isArray(resource.config.categoryIds) ? resource.config.categoryIds.map((id) => categoryById.get(String(id))?.name ?? "") : [])].some((value) => value.toLocaleLowerCase("tr-TR").includes(normalizedSearch))));

  return <PanelPageShell><PanelPageHeader title="Ekstralar" actions={canManage ? <Link className={styles.primary} href="/products/extras/new">Yeni ekstra</Link> : undefined} /><h1 className={styles.srOnly}>Ekstralar</h1><section className={styles.workspace}>
    {error ? <p className={styles.error} role="alert">{error} <button className={styles.button} type="button" disabled={loading} onClick={() => void load()}>Tekrar dene</button></p> : null}
    {categoryState === "error" && items.some((item) => catalogExtraType(item) === "size_guide") ? <p className={styles.error} role="alert">Kategori adları yüklenemedi. <button className={styles.button} type="button" onClick={() => void loadCategories()}>Tekrar dene</button></p> : null}
    {items.length ? <div className={styles.toolbar}>
      <label className={styles.search}><Search aria-hidden="true" /><span className={styles.srOnly}>Ekstra veya kategori ara</span><input type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Ekstra veya kategori ara" /></label>
      <label><span className={styles.srOnly}>Ekstra türü</span><select value={type} onChange={(event) => setType(event.currentTarget.value as typeof type)}><option value="all">Tüm türler</option>{CATALOG_EXTRA_TYPES.map((entry) => <option value={entry.type} key={entry.type}>{entry.label}</option>)}</select></label>
      <span className={styles.muted} role="status">{visible.length} / {items.length} ekstra</span>
      {search || type !== "all" ? <button className={styles.button} type="button" onClick={() => { setSearch(""); setType("all"); }}>Temizle</button> : null}
    </div> : null}
    {loading ? <div className={styles.loading} role="status">Ekstralar yükleniyor…</div> : !items.length ? error ? null : <PanelEmptyState title="Henüz ekstra yok" description="Ölçü rehberi veya fiyatlı seçenek oluşturarak başlayın." /> : !visible.length ? <PanelEmptyState title="Eşleşen ekstra yok" description="Arama veya tür filtresini değiştirin." /> : <div className={styles.list}>{visible.map((resource) => {
      const isGuide = catalogExtraType(resource) === "size_guide";
      const categoryIds = isGuide && Array.isArray(resource.config.categoryIds) ? resource.config.categoryIds.filter((id): id is string => typeof id === "string") : [];
      return <article className={styles.row} key={resource.id}><div className={styles.rowInfo}><div className={styles.rowHeading}><h2>{resource.name}</h2><span className={styles.muted}>{isGuide ? "Ölçü rehberi" : "Fiyatlı seçenek"}</span></div>
        {isGuide ? <><p>{categoryState === "loading" ? "Kategoriler yükleniyor…" : categoryIds.map((id) => categoryById.get(id)?.name ?? (categoryState === "error" ? "Kategori adı okunamıyor" : "Kategori artık etkin değil")).join(", ") || "Kategori atanmamış"}</p><small>{resource.config.enabled === true ? "Gösterim açık" : "Gösterim kapalı"}{resource.config.includeDescendants === true ? " · Alt kategoriler dahil" : ""}</small></> : <p>/{resource.slug} · {resource.productCount} ürün</p>}
        {resource.description ? <small>{resource.description}</small> : null}</div><div className={styles.actions}><span className={styles.muted}>v{resource.version}</span><Link className={styles.button} href={catalogExtraHref(resource, "preview")}>Önizle</Link>{canManage ? <><Link className={styles.button} href={catalogExtraHref(resource, "edit")}>Düzenle</Link><button type="button" className={styles.danger} disabled={archiving.includes(resource.id)} onClick={() => void archive(resource)}>{archiving.includes(resource.id) ? "Arşivleniyor…" : "Arşivle"}</button></> : null}</div></article>;
    })}</div>}
  </section></PanelPageShell>;
}
