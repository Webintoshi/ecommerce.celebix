"use client";

import { parseStorefrontAsset, type CatalogCategory, type MerchantAdminRecord, type StorefrontAsset } from "@celebix/saas-contracts";
import { ArrowDown, ArrowUp, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import {
  buildCategoryShowcaseConfig,
  type CategoryShowcaseLayout,
  type CategoryShowcaseRow,
} from "@/lib/category-showcase-model";
import { catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import { merchantAdminApi } from "@/lib/merchant-admin-ui/client";
import styles from "./category-showcase-editor.module.css";

type EditorRow = Readonly<CategoryShowcaseRow & { rowKey: string }>;
const emptyRow = (rowKey: string): EditorRow => Object.freeze({ rowKey, categoryId: "", assetId: "" });

function selectRecord(records: readonly MerchantAdminRecord[]) {
  return records.find((record) => record.status === "active") ?? records.find((record) => record.status === "draft") ?? null;
}

function existingState(record: MerchantAdminRecord | null) {
  if (!record) return { heading: "Kategorileri keşfedin", enabled: true, layout: "grid" as const, rows: [emptyRow("initial-0")] as readonly EditorRow[] };
  const items = record.config.items;
  if (typeof record.config.heading !== "string" || typeof record.config.enabled !== "boolean" || !Array.isArray(items)) throw new TypeError("category_showcase_unavailable");
  const layoutValue = record.config.layout;
  if (layoutValue !== undefined && layoutValue !== "duo" && layoutValue !== "grid") throw new TypeError("category_showcase_unavailable");
  const layout: CategoryShowcaseLayout = layoutValue ?? "grid";
  const rows = items.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item) || typeof item.categoryId !== "string" || typeof item.assetId !== "string") throw new TypeError("category_showcase_unavailable");
    return Object.freeze({ rowKey: `persisted-${index}`, categoryId: item.categoryId, assetId: item.assetId });
  });
  const config = buildCategoryShowcaseConfig({
    heading: record.config.heading,
    enabled: record.config.enabled,
    layout,
    rows,
  });
  return { heading: config.heading as string, enabled: config.enabled as boolean, layout, rows: Object.freeze(rows) as readonly EditorRow[] };
}

export function CategoryShowcaseEditor({ canManage }: Readonly<{ canManage: boolean }>) {
  const rowSerial = useRef(1);
  const [categories, setCategories] = useState<readonly CatalogCategory[]>([]);
  const [assets, setAssets] = useState<readonly StorefrontAsset[]>([]);
  const [current, setCurrent] = useState<MerchantAdminRecord | null>(null);
  const [heading, setHeading] = useState("Kategorileri keşfedin");
  const [enabled, setEnabled] = useState(true);
  const [layout, setLayout] = useState<CategoryShowcaseLayout>("grid");
  const [rows, setRows] = useState<readonly EditorRow[]>([emptyRow("initial-0")]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [loadedCategories, response, records] = await Promise.all([
        catalogOnboardingClient.listCategories(),
        fetch("/api/storefront-assets", { credentials: "same-origin", cache: "no-store" }),
        merchantAdminApi.records("category_showcase"),
      ]);
      if (!response.ok) throw new Error();
      const body = await response.json() as { assets?: unknown };
      if (!Array.isArray(body.assets) || body.assets.length > 64) throw new Error();
      const categoryAssets = Object.freeze(body.assets.map(parseStorefrontAsset).filter((asset) => asset.kind === "category" && asset.status === "active"));
      const activeCategories = Object.freeze(loadedCategories.filter((category) => category.status === "active"));
      const record = selectRecord(records);
      const state = existingState(record);
      setCategories(activeCategories); setAssets(categoryAssets); setCurrent(record);
      setHeading(state.heading); setEnabled(state.enabled); setLayout(state.layout); setRows(state.rows);
    } catch { setError("Kategori vitrini şu anda yüklenemiyor."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function updateRow(index: number, patch: Partial<CategoryShowcaseRow>) {
    setRows((value) => Object.freeze(value.map((row, rowIndex) => rowIndex === index ? Object.freeze({ ...row, ...patch }) : row)));
  }

  function move(index: number, offset: -1 | 1) {
    setRows((value) => {
      const destination = index + offset;
      if (destination < 0 || destination >= value.length) return value;
      const next = [...value]; [next[index], next[destination]] = [next[destination]!, next[index]!];
      return Object.freeze(next);
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canManage || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const config = buildCategoryShowcaseConfig({ heading, enabled, layout, rows });
      await merchantAdminApi.save("category_showcase", {
        ...(current ? { recordId: current.id, expectedVersion: current.version } : {}),
        name: current?.name ?? "Ana sayfa kategori vitrini",
        config,
        status: current?.status === "draft" ? "draft" : "active",
      });
      await load(); setMessage("Kategori vitrini kaydedildi.");
    } catch { setError("Kategori ve görselleri eksiksiz, benzersiz seçin."); }
    finally { setBusy(false); }
  }

  return <section className={styles.editor} aria-labelledby="category-showcase-title">
    <div className={styles.heading}>
      <div><p className={styles.eyebrow}>Tek yönetim alanı</p><h2 id="category-showcase-title">Kategori vitrini</h2><p>Başlık, görünürlük, düzen, kategori ve görseller yalnız buradan yönetilir.</p></div>
    </div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {message ? <p className={styles.success} role="status">{message}</p> : null}
    {loading ? <p className={styles.state}>Kategori vitrini yükleniyor…</p> : <form onSubmit={save} className={styles.form}>
      <div className={styles.settings}>
        <label>Başlık<input value={heading} onChange={(event) => setHeading(event.currentTarget.value)} maxLength={160} disabled={!canManage || busy} required /></label>
        <label className={styles.toggle}><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.currentTarget.checked)} disabled={!canManage || busy} /> Ana sayfada göster</label>
      </div>
      <fieldset className={styles.layoutPicker} disabled={!canManage || busy}>
        <legend>Görseller nasıl dizilsin?</legend>
        <p>Masaüstü ve telefon düzeni birlikte ayarlanır.</p>
        <div className={styles.layoutChoices}>
          <label className={styles.layoutCard} data-selected={layout === "duo"}>
            <input type="radio" name="category-showcase-layout" value="duo" checked={layout === "duo"} onChange={() => setLayout("duo")} />
            <span className={`${styles.layoutDiagram} ${styles.layoutDiagramDuo}`} aria-hidden="true"><i /><i /></span>
            <strong>İki büyük görsel</strong>
            <small>Masaüstünde yan yana, telefonda alt alta.</small>
          </label>
          <label className={styles.layoutCard} data-selected={layout === "grid"}>
            <input type="radio" name="category-showcase-layout" value="grid" checked={layout === "grid"} onChange={() => setLayout("grid")} />
            <span className={`${styles.layoutDiagram} ${styles.layoutDiagramGrid}`} aria-hidden="true"><i /><i /><i /><i /></span>
            <strong>Düzenli ızgara</strong>
            <small>Masaüstünde dört, telefonda iki sütun.</small>
          </label>
        </div>
      </fieldset>
      {categories.length === 0 || assets.length === 0 ? <p className={styles.notice}>En az bir etkin kategori ve “Kategori görseli” türünde yüklenmiş görsel gerekir.</p> : null}
      <ol className={styles.rows}>
        {rows.map((row, index) => <li key={row.rowKey} className={styles.row}>
          <span className={styles.index} aria-hidden="true">{index + 1}</span>
          <label>Kategori<select value={row.categoryId} onChange={(event) => updateRow(index, { categoryId: event.currentTarget.value })} disabled={!canManage || busy} required><option value="">Kategori seçin</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>Görsel<select value={row.assetId} onChange={(event) => updateRow(index, { assetId: event.currentTarget.value })} disabled={!canManage || busy} required><option value="">Görsel seçin</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.altText}</option>)}</select></label>
          {canManage ? <div className={styles.actions}>
            <button type="button" aria-label={`${index + 1}. kartı yukarı taşı`} onClick={() => move(index, -1)} disabled={busy || index === 0}><ArrowUp aria-hidden="true" /></button>
            <button type="button" aria-label={`${index + 1}. kartı aşağı taşı`} onClick={() => move(index, 1)} disabled={busy || index === rows.length - 1}><ArrowDown aria-hidden="true" /></button>
            <button type="button" aria-label={`${index + 1}. kartı kaldır`} onClick={() => setRows((value) => value.length === 1 ? value : Object.freeze(value.filter((_, rowIndex) => rowIndex !== index)))} disabled={busy || rows.length === 1}><Trash2 aria-hidden="true" /></button>
          </div> : null}
        </li>)}
      </ol>
      {canManage ? <div className={styles.footer}>
        <button type="button" className={styles.secondary} onClick={() => setRows((value) => value.length >= 8 ? value : Object.freeze([...value, emptyRow(`new-${rowSerial.current++}`)]))} disabled={busy || rows.length >= 8}><Plus aria-hidden="true" /> Kart ekle</button>
        <button type="submit" className={styles.primary} disabled={busy || categories.length === 0 || assets.length === 0}>{busy ? <LoaderCircle aria-hidden="true" /> : <Save aria-hidden="true" />} Kaydet</button>
      </div> : null}
    </form>}
  </section>;
}
