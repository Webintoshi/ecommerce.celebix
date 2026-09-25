"use client";

import { ArrowDown, ArrowUp, GripVertical, Package, RotateCcw, Save, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { CatalogOnboardingOptions } from "@celebix/saas-contracts";

import {
  moveProductOrder,
  productOrderClient,
  type CategoryProductOrder,
  type CategoryProductOrderItem,
} from "@/lib/catalog-ui/product-order-client";
import type { ProductFeaturedImage } from "@/lib/catalog-ui/client";
import styles from "./product-category-rank.module.css";

type CategoryOption = CatalogOnboardingOptions["categories"][number];

function categoryName(category: CategoryOption, all: ReadonlyMap<string, CategoryOption>): string {
  const names = [category.name];
  const seen = new Set([category.id]);
  let parentId = category.parentId;
  while (parentId && !seen.has(parentId)) {
    const parent = all.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    seen.add(parent.id);
    parentId = parent.parentId;
  }
  return names.join(" / ");
}

function orderChanged(baseline: CategoryProductOrder | undefined, items: readonly CategoryProductOrderItem[]): boolean {
  return !!baseline && baseline.items.some((item, index) => items[index]?.productId !== item.productId);
}

export function ProductCategoryRankConsole({
  categories,
  initialCategoryId,
  knownImages,
  optionsState,
  onRetryOptions,
  onDirtyChange,
  onSavingChange,
  onClose,
}: Readonly<{
  categories: CatalogOnboardingOptions["categories"];
  initialCategoryId: string;
  knownImages: Readonly<Record<string, ProductFeaturedImage>>;
  optionsState: "loading" | "ready" | "unavailable";
  onRetryOptions(): void;
  onDirtyChange(value: boolean): void;
  onSavingChange(value: boolean): void;
  onClose(): void;
}>) {
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [baseline, setBaseline] = useState<CategoryProductOrder>();
  const [items, setItems] = useState<readonly CategoryProductOrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [draggingId, setDraggingId] = useState<string>();
  const dragIdRef = useRef<string | undefined>(undefined);
  const itemsRef = useRef<readonly CategoryProductOrderItem[]>([]);
  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const dirty = orderChanged(baseline, items);

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onSavingChange(saving); }, [saving, onSavingChange]);

  useEffect(() => {
    setBaseline(undefined);
    setItems([]);
    itemsRef.current = [];
    setError("");
    setNotice("");
    if (!categoryId) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void productOrderClient.get(categoryId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setBaseline(result);
      setItems(result.items);
      itemsRef.current = result.items;
      setLoading(false);
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : "Vitrin sırası yüklenemedi.");
      setLoading(false);
    });
    return () => controller.abort();
  }, [categoryId, reloadToken]);

  function changeCategory(next: string) {
    if (next === categoryId || saving) return;
    if (dirty && !window.confirm("Kaydedilmemiş vitrin sırası silinecek. Devam edilsin mi?")) return;
    setCategoryId(next);
  }

  function close() {
    if (saving) return;
    onClose();
  }

  function move(productId: string, toIndex: number) {
    const current = itemsRef.current;
    const fromIndex = current.findIndex((item) => item.productId === productId);
    const next = moveProductOrder(current, fromIndex, toIndex);
    if (next === current) return;
    itemsRef.current = next;
    setItems(next);
    setNotice(`${current[fromIndex]?.title} ${toIndex + 1}. sıraya taşındı.`);
    setError("");
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>, productId: string) {
    if (saving || loading || (event.pointerType === "mouse" && event.button !== 0)) return;
    dragIdRef.current = productId;
    setDraggingId(productId);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const productId = dragIdRef.current;
    if (!productId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-rank-product-id]");
    const targetId = target?.dataset.rankProductId;
    if (!targetId || targetId === productId) return;
    const targetIndex = items.findIndex((item) => item.productId === targetId);
    if (targetIndex >= 0) move(productId, targetIndex);
  }

  function endPointerDrag() {
    dragIdRef.current = undefined;
    setDraggingId(undefined);
  }

  async function save() {
    if (!baseline || !dirty || saving || loading) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await productOrderClient.save(categoryId, baseline.version, items.map((item) => item.productId));
      setBaseline(result);
      setItems(result.items);
      itemsRef.current = result.items;
      setNotice("Vitrin sırası kaydedildi.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Vitrin sırası kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  const activeCount = items.filter((item) => item.status === "active").length;

  return (
    <section className={styles.root} aria-label="Kategori vitrin sırası">
      <div className={styles.header}>
        <div><h2>Vitrin sırası</h2><p>Kategori içindeki ürünlerin mağazada görünme sırası.</p></div>
        <button className={styles.close} type="button" onClick={close} disabled={saving}><X aria-hidden="true" /> Listeye dön</button>
      </div>
      <div className={styles.controls}>
        <label className={styles.categoryPicker}><span>Kategori / alt kategori</span><select value={categoryId} disabled={saving || optionsState !== "ready"} onChange={(event) => changeCategory(event.currentTarget.value)} aria-label="Vitrin sırası kategorisi"><option value="">{optionsState === "loading" ? "Kategoriler yükleniyor…" : optionsState === "unavailable" ? "Kategoriler yüklenemedi" : "Bir kategori seçin"}</option>{categories.map((category) => <option key={category.id} value={category.id}>{categoryName(category, categoryMap)}</option>)}</select></label>
        <span className={styles.scopeNote}>Sıra yalnızca seçilen kategoride geçerlidir.</span>
      </div>
      <div className={`${styles.state} ${dirty ? styles.dirty : notice === "Vitrin sırası kaydedildi." ? styles.saved : ""}`} role="status" aria-live="polite">
        <span className={styles.dot} aria-hidden="true" />
        {loading ? "Sıra yükleniyor…" : error ? error : notice || (!categoryId ? optionsState === "unavailable" ? "Kategori seçenekleri yüklenemedi." : "Sıralamak için kategori seçin." : `${items.length} ürün · ${activeCount} yayında`)}
        {error && categoryId ? <button type="button" onClick={() => setReloadToken((current) => current + 1)} disabled={loading || saving}>Yeniden yükle</button> : null}
        {optionsState === "unavailable" ? <button type="button" onClick={onRetryOptions}>Kategorileri yenile</button> : null}
      </div>
      {categoryId && !loading && !error && items.length === 0 ? <div className={styles.empty}><Package aria-hidden="true" /><span>Bu kategoride sıralanacak ürün yok.</span></div> : null}
      {categoryId && !loading && items.length > 0 ? <>
        <p id="rank-keyboard-instruction" className={styles.srOnly}>Ürünü sürükleyin veya taşıma tutamacı üzerindeyken yukarı ve aşağı ok tuşlarını kullanın. Yanındaki ok düğmeleri de aynı işlemi yapar.</p>
        <ol className={styles.list} aria-label="Kategori ürün sırası">
          {items.map((item, index) => {
            const image = knownImages[item.productId];
            return <li key={item.productId} className={`${styles.row} ${draggingId === item.productId ? styles.dragging : ""}`} data-rank-product-id={item.productId}>
              <span className={styles.number}>{index + 1}</span>
              <button
                className={styles.handle} type="button" disabled={saving}
                aria-label={`${item.title} ürününü sürükle; ok tuşlarıyla taşı`}
                aria-describedby="rank-keyboard-instruction"
                aria-keyshortcuts="ArrowUp ArrowDown"
                onPointerDown={(event) => handlePointerDown(event, item.productId)}
                onPointerMove={handlePointerMove}
                onPointerUp={endPointerDrag}
                onPointerCancel={endPointerDrag}
                onLostPointerCapture={endPointerDrag}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    move(item.productId, index + (event.key === "ArrowUp" ? -1 : 1));
                  }
                }}
              ><GripVertical aria-hidden="true" /></button>
              <span className={styles.thumbnail} aria-hidden="true">{image ? <img src={image.publicUrl} alt="" loading="lazy" decoding="async" /> : <Package />}</span>
              <span className={styles.product}><strong>{item.title}</strong><small>{item.slug}</small></span>
              <span className={`${styles.status} ${item.status === "active" ? styles.active : ""}`}>{item.status === "active" ? "Yayında" : "Taslak"}</span>
              <span className={styles.moveButtons}>
                <button type="button" disabled={saving || index === 0} aria-label={`${item.title} ürününü bir sıra yukarı taşı`} onClick={() => move(item.productId, index - 1)}><ArrowUp aria-hidden="true" /></button>
                <button type="button" disabled={saving || index === items.length - 1} aria-label={`${item.title} ürününü bir sıra aşağı taşı`} onClick={() => move(item.productId, index + 1)}><ArrowDown aria-hidden="true" /></button>
              </span>
            </li>;
          })}
        </ol>
      </> : null}
      <div className={styles.footer}>
        <span>{dirty ? "Kaydedilmemiş değişiklik var." : ""}</span>
        <div>
          <button type="button" className={styles.undo} disabled={!dirty || saving} onClick={() => { const original = baseline?.items ?? []; itemsRef.current = original; setItems(original); setNotice("Sıra geri alındı."); setError(""); }}><RotateCcw aria-hidden="true" /> Geri al</button>
          <button type="button" className={styles.save} disabled={!dirty || saving || loading} onClick={() => void save()}><Save aria-hidden="true" /> {saving ? "Kaydediliyor…" : "Sırayı kaydet"}</button>
        </div>
      </div>
    </section>
  );
}
