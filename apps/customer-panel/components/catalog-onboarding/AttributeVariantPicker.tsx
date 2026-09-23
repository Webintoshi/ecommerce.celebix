"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductVariant } from "@celebix/saas-contracts";

import { catalogAdminApi } from "@/lib/catalog-admin-ui/client";
import { attributeChoices, mergeSelectedVariants, updateSharedVariantDefault, variantAttributeKey, type CatalogAttributeChoice } from "@/lib/catalog-onboarding-ui/attribute-variants";
import { buildVariantMatrix } from "@/lib/catalog-onboarding-ui/variant-matrix";
import type { VariantDraft } from "./ProductVariantBuilder";
import styles from "./attribute-variant-picker.module.css";

export function AttributeVariantPicker({ value, onChange, onAttributeIdsChange, existing = [], disabled = false }: Readonly<{
  value: readonly VariantDraft[];
  onChange(value: readonly VariantDraft[]): void;
  onAttributeIdsChange?(ids: readonly string[]): void;
  existing?: readonly ProductVariant[];
  disabled?: boolean;
}>) {
  const [choices, setChoices] = useState<readonly CatalogAttributeChoice[]>([]);
  const [invalidChoiceCount, setInvalidChoiceCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [selectedValues, setSelectedValues] = useState<Readonly<Record<string, readonly string[]>>>({});
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void catalogAdminApi.resources("attribute").then((resources) => {
      if (live) {
        const loaded = attributeChoices(resources);
        setInvalidChoiceCount(resources.filter((resource) => resource.kind === "attribute" && resource.status === "active").length - loaded.length);
        const used = loaded.filter((choice) => value.some((variant) => Object.hasOwn(variant.attributes, choice.key)));
        setChoices(loaded);
        setSelectedIds(Object.freeze(used.map((choice) => choice.id)));
        setSelectedValues(Object.freeze(Object.fromEntries(used.map((choice) => [choice.id, Object.freeze([...new Set(value.map((variant) => variant.attributes[choice.key]).filter((item): item is string => item !== undefined))])] ))));
        setLoading(false);
      }
    }).catch(() => { if (live) { setError("Nitelikler yüklenemedi. Sayfayı yenileyip tekrar deneyin."); setLoading(false); } });
    return () => { live = false; };
  }, []);

  const selectedChoices = selectedIds.map((id) => choices.find((choice) => choice.id === id)).filter((choice): choice is CatalogAttributeChoice => choice !== undefined);
  const options = selectedChoices.map((choice) => ({ name: choice.key, values: selectedValues[choice.id] ?? [] }));
  const matrix = useMemo(() => options.length && options.every(({ values }) => values.length) ? buildVariantMatrix(options) : null, [JSON.stringify(options)]);
  const selectedKeys = new Set(value.map((variant) => variantAttributeKey(variant.attributes)));
  const existingKeys = new Set(existing.map((variant) => variantAttributeKey(variant.attributes)));

  function resetStaged(): boolean {
    if (!value.length) return true;
    if (!window.confirm("Nitelik seçimi değişirse hazırlanmış varyant satırları kaldırılacak. Devam edilsin mi?")) return false;
    onChange(Object.freeze([]));
    return true;
  }

  function toggleAttribute(choice: CatalogAttributeChoice) {
    if (!resetStaged()) return;
    setError("");
    const next = selectedIds.includes(choice.id) ? selectedIds.filter((id) => id !== choice.id) : [...selectedIds, choice.id];
    if (next.length <= 3) { setSelectedIds(Object.freeze(next)); onAttributeIdsChange?.(Object.freeze(next)); }
  }

  function toggleValue(choice: CatalogAttributeChoice, selected: string) {
    if (!resetStaged()) return;
    setError("");
    const previous = selectedValues[choice.id] ?? [];
    const next = previous.includes(selected) ? previous.filter((item) => item !== selected) : [...previous, selected];
    if (next.length > 20) { setError("Bir nitelikte en fazla 20 değer seçebilirsiniz."); return; }
    setSelectedValues((current) => Object.freeze({ ...current, [choice.id]: Object.freeze(next) }));
  }

  function toggleCombination(key: string) {
    const next = selectedKeys.has(key) ? [...selectedKeys].filter((item) => item !== key) : [...selectedKeys, key];
    if (!next.length) { onChange(Object.freeze([])); setError(""); return; }
    const result = mergeSelectedVariants({ options, selectedKeys: next, current: value, existing: existing.map(({ attributes }) => attributes), defaultPrice: price, defaultStock: stock });
    if (!result.ok) { setError(result.error); return; }
    setError("");
    onChange(result.value);
  }

  function updateDefault(field: "price" | "stockQuantity", next: string) {
    const previous = field === "price" ? price : stock;
    if (field === "price") setPrice(next);
    else setStock(next);
    if (value.length) onChange(updateSharedVariantDefault(value, field, previous, next));
  }

  return <fieldset className={styles.picker} disabled={disabled || loading}>
    <legend>Niteliklerden varyant seç</legend>
    <p className={styles.hint}>Nitelikleri ve değerlerini seçin; yalnız işaretlediğiniz kombinasyonlar ürüne eklenecek.</p>
    {loading ? <p role="status">Nitelikler yükleniyor…</p> : null}
    {!loading && !choices.length ? <p>Henüz nitelik yok. Önce Ürünler → Nitelikler bölümünde Renk, Beden gibi seçenekler oluşturun.</p> : null}
    {invalidChoiceCount > 0 ? <p role="status" className={styles.error}>{invalidChoiceCount} nitelik kaydının değeri geçersiz; diğer nitelikleri kullanabilirsiniz.</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    <div className={styles.attributes}>{choices.map((choice) => <label key={choice.id}><input type="checkbox" checked={selectedIds.includes(choice.id)} disabled={!selectedIds.includes(choice.id) && selectedIds.length >= 3} onChange={() => toggleAttribute(choice)} /> {choice.name}</label>)}</div>
    {selectedChoices.map((choice) => <div key={choice.id} className={styles.values}><strong>{choice.name}</strong><div>{choice.values.map((item) => <label key={item}><input type="checkbox" checked={(selectedValues[choice.id] ?? []).includes(item)} onChange={() => toggleValue(choice, item)} /> {item}</label>)}</div></div>)}
    {selectedChoices.length ? <div className={styles.defaults}><label>Başlangıç fiyatı (₺)<input inputMode="decimal" value={price} onChange={(event) => updateDefault("price", event.target.value)} placeholder="Örn. 199,00" /></label><label>Başlangıç stoku<input inputMode="numeric" pattern="(?:0|[1-9][0-9]*)" value={stock} onChange={(event) => updateDefault("stockQuantity", event.target.value)} /></label></div> : null}
    {matrix && !matrix.ok ? <p role="alert" className={styles.error}>{matrix.error} Daha az nitelik değeri seçin.</p> : null}
    {matrix?.ok ? <div className={styles.combinations}><strong>Satılacak kombinasyonlar ({selectedKeys.size} seçili)</strong><div>{matrix.value.map((candidate) => {
      const key = variantAttributeKey(candidate.attributes);
      const exists = existingKeys.has(key);
      return <label key={key}><input type="checkbox" checked={selectedKeys.has(key) || exists} disabled={exists} onChange={() => toggleCombination(key)} /><span>{candidate.title}</span>{exists ? <small>Zaten var</small> : null}</label>;
    })}</div></div> : null}
  </fieldset>;
}
