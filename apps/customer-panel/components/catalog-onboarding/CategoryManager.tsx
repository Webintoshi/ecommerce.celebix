"use client";

import { Archive, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import type { CatalogCategory } from "@celebix/saas-contracts";

import { CatalogOnboardingApiError, catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import styles from "./product-onboarding.module.css";

function value(data: FormData, key: string) { const selected = data.get(key); return typeof selected === "string" ? selected.trim() : ""; }
function message(error: unknown) { return error instanceof CatalogOnboardingApiError ? error.message : "Kategori işlemi tamamlanamadı."; }

export function CategoryManager() {
  const [categories, setCategories] = useState<readonly CatalogCategory[]>([]);
  const [editing, setEditing] = useState<CatalogCategory>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setCategories(await catalogOnboardingClient.listCategories()); }
    catch (failure) { setError(message(failure)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget);
    const name = value(data, "name"), parentId = value(data, "parentId"), position = Number(value(data, "position"));
    if (!name || !Number.isSafeInteger(position) || position < 0 || position > 9_999) { setError("Kategori adı ve sırası geçerli olmalıdır."); return; }
    setBusy(true); setError("");
    try {
      const fields = { name, position, ...(parentId ? { parentId } : {}) };
      if (editing) await catalogOnboardingClient.updateCategory(editing.id, { expectedVersion: editing.version, fields });
      else await catalogOnboardingClient.createCategory(fields);
      setEditing(undefined); event.currentTarget.reset(); await load();
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  async function archive(category: CatalogCategory) {
    if (busy || !window.confirm(`${category.name} kategorisi arşivlensin mi?`)) return;
    setBusy(true); setError("");
    try { await catalogOnboardingClient.archiveCategory(category.id, category.version); if (editing?.id === category.id) setEditing(undefined); await load(); }
    catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  const active = categories.filter(({ status }) => status === "active");
  return <section className={styles.categoryManager} aria-labelledby="category-manager-title">
    <header><div><span className={styles.eyebrow}>ÜRÜN YAPISI</span><h1 id="category-manager-title">Kategoriler</h1><p>Ürünleri mağazanıza ait, en fazla sekiz seviyeli bir yapıda düzenleyin.</p></div><button type="button" onClick={() => void load()} disabled={loading || busy}><RefreshCw aria-hidden="true" />Yenile</button></header>
    {error ? <div className={styles.error} role="alert">{error}</div> : null}
    <div className={styles.categoryLayout}>
      <form onSubmit={save} className={styles.categoryForm} key={editing?.id ?? "new"}>
        <div className={styles.categoryFormTitle}><span className={styles.icon}><Plus aria-hidden="true" /></span><div><strong>{editing ? "Kategoriyi düzenle" : "Yeni kategori"}</strong><small>Ad, üst kategori ve görünüm sırası</small></div>{editing ? <button type="button" onClick={() => setEditing(undefined)} aria-label="Düzenlemeyi kapat"><X /></button> : null}</div>
        <label><span>Kategori adı *</span><input name="name" required maxLength={120} defaultValue={editing?.name ?? ""} /></label>
        <label><span>Üst kategori</span><select name="parentId" defaultValue={editing?.parentId ?? ""}><option value="">Ana kategori</option>{active.filter(({ id, depth }) => id !== editing?.id && depth < 8).map((category) => <option key={category.id} value={category.id}>{"— ".repeat(Math.max(0, category.depth - 1))}{category.name}</option>)}</select></label>
        <label><span>Sıra</span><input name="position" required inputMode="numeric" defaultValue={editing?.position ?? 0} /></label>
        <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Kaydediliyor…" : editing ? "Değişiklikleri kaydet" : "Kategori oluştur"}</button>
      </form>
      <div className={styles.categoryList} aria-busy={loading}>
        {loading ? <p role="status">Kategoriler yükleniyor…</p> : categories.length === 0 ? <div className={styles.categoryEmpty}><strong>Henüz kategori yok</strong><p>İlk kategoriyi soldaki kısa formdan oluşturun.</p></div> : categories.map((category) => <article key={category.id} data-status={category.status}>
          <span className={styles.categoryDepth} style={{ "--depth": category.depth } as CSSProperties} aria-hidden="true" />
          <div><strong>{category.name}</strong><small>/{category.slug} · Seviye {category.depth} · Sıra {category.position}</small></div>
          <span className={category.status === "active" ? styles.activeBadge : styles.archiveBadge}>{category.status === "active" ? "Aktif" : "Arşiv"}</span>
          {category.status === "active" ? <div className={styles.categoryActions}><button type="button" onClick={() => setEditing(category)} disabled={busy} aria-label={`${category.name} kategorisini düzenle`}><Pencil /></button><button type="button" onClick={() => void archive(category)} disabled={busy} aria-label={`${category.name} kategorisini arşivle`}><Archive /></button></div> : null}
        </article>)}
      </div>
    </div>
  </section>;
}
