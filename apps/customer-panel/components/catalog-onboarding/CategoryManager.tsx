"use client";

import { Archive, ChevronDown, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import type { CatalogCategory } from "@celebix/saas-contracts";

import {
  buildCategoryAccordionGroups,
  presentCategoryAccordion,
  toggleCategoryAccordion,
  type CategoryAccordionPresentation,
} from "@/lib/catalog-onboarding-ui/category-accordion";
import { CatalogOnboardingApiError, catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import {
  buildCatalogCategoryHierarchy,
  type CatalogCategoryTreeRow,
} from "@/lib/catalog-onboarding-ui/category-tree";
import styles from "./product-onboarding.module.css";

function value(data: FormData, key: string) { const selected = data.get(key); return typeof selected === "string" ? selected.trim() : ""; }
function message(error: unknown) { return error instanceof CatalogOnboardingApiError ? error.message : "Kategori işlemi tamamlanamadı."; }

export function CategoryManager() {
  const [categories, setCategories] = useState<readonly CatalogCategory[]>([]);
  const [editing, setEditing] = useState<CatalogCategory>();
  const [creatingUnderId, setCreatingUnderId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expandedRootIds, setExpandedRootIds] = useState<ReadonlySet<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setCategories(await catalogOnboardingClient.listCategories()); }
    catch (failure) { setError(message(failure)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (!hierarchy.valid) { setError("Kategori hizmetinden gelen hiyerarşi doğrulanamadı."); return; }
    const data = new FormData(event.currentTarget);
    const name = value(data, "name"), parentId = value(data, "parentId"), position = Number(value(data, "position"));
    if (!name || !Number.isSafeInteger(position) || position < 0 || position > 9_999) { setError("Kategori adı ve sırası geçerli olmalıdır."); return; }
    setBusy(true); setError("");
    try {
      const fields = { name, position, ...(parentId ? { parentId } : {}) };
      if (editing) await catalogOnboardingClient.updateCategory(editing.id, { expectedVersion: editing.version, fields });
      else await catalogOnboardingClient.createCategory(fields);
      setEditing(undefined); setCreatingUnderId(undefined); event.currentTarget.reset(); await load();
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  async function archive(category: CatalogCategory) {
    if (busy || !window.confirm(`${category.name} kategorisi arşivlensin mi?`)) return;
    setBusy(true); setError("");
    try { await catalogOnboardingClient.archiveCategory(category.id, category.version); if (editing?.id === category.id) setEditing(undefined); if (creatingUnderId === category.id) setCreatingUnderId(undefined); await load(); }
    catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  const hierarchy = buildCatalogCategoryHierarchy(categories);
  const unavailableParents = new Set(editing ? [editing.id, ...hierarchy.descendantIds(editing.id)] : []);
  const activeRows = hierarchy.rows.filter(({ category }) => category.status === "active");
  const categoryGroups = presentCategoryAccordion(
    buildCategoryAccordionGroups(hierarchy.rows),
    expandedRootIds,
  );

  function createChild(category: CatalogCategory) {
    setEditing(undefined);
    setCreatingUnderId(category.id);
  }

  function toggleRoot(rootId: string) {
    setExpandedRootIds((current) => toggleCategoryAccordion(current, rootId));
  }

  function renderCategoryRow(
    { category, depth, label }: CatalogCategoryTreeRow<CatalogCategory>,
    accordion?: CategoryAccordionPresentation<CatalogCategory>,
  ) {
    const hasControls = accordion?.hasChildren === true || category.status === "active";

    return <article key={category.id} data-status={category.status}>
      <span className={styles.categoryDepth} style={{ "--depth": depth } as CSSProperties} aria-hidden="true" />
      <div><strong>{label}</strong><small>Seviye {depth} · Sıra {category.position}</small></div>
      <span className={category.status === "active" ? styles.activeBadge : styles.archiveBadge}>{category.status === "active" ? "Aktif" : "Arşiv"}</span>
      {hasControls ? <div className={styles.categoryActions}>
        {accordion?.hasChildren ? <button
          type="button"
          className={styles.categoryToggle}
          aria-expanded={accordion.expanded}
          aria-controls={accordion.childrenId}
          aria-label={`${category.name} alt kategorilerini ${accordion.expanded ? "kapat" : "aç"}`}
          onClick={() => toggleRoot(category.id)}
        ><ChevronDown aria-hidden="true" /></button> : null}
        {category.status === "active" ? <>
          <button type="button" className={styles.categoryChildAction} onClick={() => createChild(category)} disabled={busy || depth >= 8} aria-label={`${category.name} altında alt kategori ekle`}><Plus aria-hidden="true" /><span>Alt kategori ekle</span></button>
          <button type="button" onClick={() => { setCreatingUnderId(undefined); setEditing(category); }} disabled={busy} aria-label={`${category.name} kategorisini düzenle`}><Pencil /></button>
          <button type="button" onClick={() => void archive(category)} disabled={busy} aria-label={`${category.name} kategorisini arşivle`}><Archive /></button>
        </> : null}
      </div> : null}
    </article>;
  }

  return <section className={styles.categoryManager} aria-labelledby="category-manager-title">
    <header><div><span className={styles.eyebrow}>ÜRÜN YAPISI</span><h1 id="category-manager-title">Kategoriler</h1><p>Ürünleri mağazanıza ait, en fazla sekiz seviyeli bir yapıda düzenleyin.</p></div><button type="button" onClick={() => void load()} disabled={loading || busy}><RefreshCw aria-hidden="true" />Yenile</button></header>
    {error || !hierarchy.valid ? <div className={styles.error} role="alert">{error || "Kategori hizmetinden gelen hiyerarşi doğrulanamadı."}</div> : null}
    {hierarchy.valid ? <div className={styles.categoryLayout}>
      <form onSubmit={save} className={styles.categoryForm} key={editing?.id ?? `new:${creatingUnderId ?? "root"}`}>
        <div className={styles.categoryFormTitle}><span className={styles.icon}><Plus aria-hidden="true" /></span><div><strong>{editing ? "Kategoriyi düzenle" : "Yeni kategori"}</strong><small>Ad, üst kategori ve görünüm sırası</small></div>{editing || creatingUnderId ? <button type="button" onClick={() => { setEditing(undefined); setCreatingUnderId(undefined); }} aria-label={editing ? "Düzenlemeyi kapat" : "Alt kategori eklemeyi iptal et"}><X /></button> : null}</div>
        <label><span>Kategori adı *</span><input name="name" required maxLength={120} defaultValue={editing?.name ?? ""} /></label>
        <label><span>Üst kategori</span><select name="parentId" defaultValue={editing?.parentId ?? creatingUnderId ?? ""}><option value="">Ana kategori</option>{activeRows.filter(({ category, depth }) => !unavailableParents.has(category.id) && depth < 8).map(({ category, label }) => <option key={category.id} value={category.id}>{label}</option>)}</select></label>
        <label><span>Sıra</span><input name="position" required inputMode="numeric" defaultValue={editing?.position ?? 0} /></label>
        <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Kaydediliyor…" : editing ? "Değişiklikleri kaydet" : "Kategori oluştur"}</button>
      </form>
      <div className={styles.categoryList} aria-busy={loading}>
        {loading ? <p role="status">Kategoriler yükleniyor…</p> : categoryGroups.length === 0 ? <div className={styles.categoryEmpty}><strong>Henüz kategori yok</strong><p>İlk kategoriyi soldaki kısa formdan oluşturun.</p></div> : categoryGroups.map((group) => <div className={styles.categoryGroup} key={group.root.category.id}>
          {renderCategoryRow(group.root, group)}
          {group.expanded ? <div id={group.childrenId} className={styles.categoryChildren} role="group" aria-label={`${group.root.category.name} alt kategorileri`}>
            {group.visibleDescendants.map((row) => renderCategoryRow(row))}
          </div> : null}
        </div>)}
      </div>
    </div> : null}
  </section>;
}
