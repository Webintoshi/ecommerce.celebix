"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogAdminResource, ProductVariant } from "@celebix/saas-contracts";

import { catalogAdminApi, CatalogAdminApiError } from "@/lib/catalog-admin-ui/client";
import { buildAttributeResourceMutation, saveAttributeForPicker } from "@/lib/catalog-onboarding-ui/attribute-resource";
import { attributeChoices, mergeSelectedVariants, reconcileVariantRows, updateSharedVariantDefault, variantAttributeKey, type CatalogAttributeChoice } from "@/lib/catalog-onboarding-ui/attribute-variants";
import { buildVariantMatrix } from "@/lib/catalog-onboarding-ui/variant-matrix";
import type { VariantDraft } from "./ProductVariantBuilder";
import styles from "./attribute-variant-picker.module.css";

type Editor = Readonly<{ kind: "new" }> | Readonly<{ kind: "existing"; id: string }>;

export function AttributeVariantPicker({ value, onChange, onAttributeIdsChange, existing = [], initialPrice = "", initialStock = "0", disabled = false }: Readonly<{
  value: readonly VariantDraft[];
  onChange(value: readonly VariantDraft[]): void;
  onAttributeIdsChange?(ids: readonly string[]): void;
  existing?: readonly ProductVariant[];
  initialPrice?: string;
  initialStock?: string;
  disabled?: boolean;
}>) {
  const [resources, setResources] = useState<readonly CatalogAdminResource[]>([]);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [selectedValues, setSelectedValues] = useState<Readonly<Record<string, readonly string[]>>>({});
  const [price, setPrice] = useState(initialPrice);
  const [stock, setStock] = useState(initialStock);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorName, setEditorName] = useState("");
  const [editorInput, setEditorInput] = useState("");
  const [editorValues, setEditorValues] = useState<readonly string[]>([]);
  const [editorError, setEditorError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const editorInputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let live = true;
    void catalogAdminApi.resources("attribute").then((resources) => {
      if (live) {
        const loaded = attributeChoices(resources);
        const used = loaded.filter((choice) => value.some((variant) => Object.hasOwn(variant.attributes, choice.key)));
        setResources(resources);
        setSelectedIds(Object.freeze(used.map((choice) => choice.id)));
        setSelectedValues(Object.freeze(Object.fromEntries(used.map((choice) => [choice.id, Object.freeze([...new Set(value.map((variant) => variant.attributes[choice.key]).filter((item): item is string => item !== undefined))])] ))));
        setLoading(false);
      }
    }).catch(() => { if (live) { setError("Nitelikler yüklenemedi. Tekrar deneyin."); setLoading(false); } });
    return () => { live = false; };
  }, []);

  useEffect(() => { if (editor) editorInputRef.current?.focus(); }, [editor]);

  const choices = useMemo(() => attributeChoices(resources), [resources]);
  const invalidChoiceCount = resources.filter((resource) => resource.kind === "attribute" && resource.status === "active").length - choices.length;
  const selectedChoices = selectedIds.map((id) => choices.find((choice) => choice.id === id)).filter((choice): choice is CatalogAttributeChoice => choice !== undefined);
  const options = selectedChoices.map((choice) => ({ name: choice.key, values: selectedValues[choice.id] ?? [] }));
  const matrix = useMemo(() => options.length && options.every(({ values }) => values.length) ? buildVariantMatrix(options) : null, [JSON.stringify(options)]);
  const selectedKeys = new Set(value.map((variant) => variantAttributeKey(variant.attributes)));
  const existingKeys = new Set(existing.map((variant) => variantAttributeKey(variant.attributes)));

  function changeOptions(nextIds: readonly string[], nextValues: Readonly<Record<string, readonly string[]>>) {
    const nextOptions = nextIds.map((id) => choices.find((choice) => choice.id === id)).filter((choice): choice is CatalogAttributeChoice => choice !== undefined)
      .map((choice) => ({ name: choice.key, values: nextValues[choice.id] ?? [] }));
    const nextMatrix = nextOptions.length && nextOptions.every(({ values }) => values.length) ? buildVariantMatrix(nextOptions) : null;
    if (nextMatrix && !nextMatrix.ok) { setError(`${nextMatrix.error} Daha az değer seçin.`); return; }
    const { kept, removed } = reconcileVariantRows(nextOptions, value);
    if (removed.length && !window.confirm(`${removed.length} seçili varyant bu nitelik değişikliğiyle kaldırılacak. Devam edilsin mi?`)) return;
    if (removed.length) onChange(kept);
    setSelectedIds(Object.freeze([...nextIds]));
    setSelectedValues(Object.freeze({ ...nextValues }));
    onAttributeIdsChange?.(Object.freeze([...nextIds]));
    setError("");
  }

  function toggleAttribute(choice: CatalogAttributeChoice) {
    const next = selectedIds.includes(choice.id) ? selectedIds.filter((id) => id !== choice.id) : [...selectedIds, choice.id];
    if (next.length <= 3) changeOptions(next, selectedValues);
  }

  function toggleValue(choice: CatalogAttributeChoice, selected: string) {
    const previous = selectedValues[choice.id] ?? [];
    const next = previous.includes(selected) ? previous.filter((item) => item !== selected) : [...previous, selected];
    if (next.length > 20) { setError("Bir nitelikte en fazla 20 değer seçebilirsiniz."); return; }
    changeOptions(selectedIds, { ...selectedValues, [choice.id]: Object.freeze(next) });
  }

  function toggleCombination(key: string) {
    if (selectedKeys.has(key) && !window.confirm("Bu varyantın girilmiş fiyat, stok ve diğer bilgileri kaldırılacak. Devam edilsin mi?")) return;
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

  function openEditor(next: Editor) {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditor(next);
    setEditorName("");
    setEditorInput("");
    setEditorValues([]);
    setEditorError("");
    setNotice("");
  }

  function closeEditor() {
    if (savingRef.current) return;
    setEditor(null);
    if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
  }

  function addEditorValue() {
    const candidate = editorInput.trim();
    const current = editor?.kind === "existing" ? resources.find((item) => item.id === editor.id)?.config.values : [];
    const previous = Array.isArray(current) ? current.filter((item): item is string => typeof item === "string") : [];
    if (!candidate || candidate.length > 100 || [...previous, ...editorValues].some((item) => item.toLocaleLowerCase("tr-TR") === candidate.toLocaleLowerCase("tr-TR"))) {
      setEditorError("Boş, çok uzun veya tekrar eden değer eklenemez.");
      return;
    }
    setEditorValues((values) => Object.freeze([...values, candidate]));
    setEditorInput("");
    setEditorError("");
    editorInputRef.current?.focus();
  }

  async function saveAttribute() {
    if (!editor || savingRef.current) return;
    const original = editor.kind === "existing" ? resources.find((item) => item.id === editor.id) : undefined;
    if (editor.kind === "existing" && !original) { setEditorError("Nitelik artık kullanılamıyor. Listeyi yenileyin."); return; }
    const parsed = buildAttributeResourceMutation({ ...(original ? { existing: original } : { name: editorName }), values: editorValues });
    if (!parsed.ok) { setEditorError(parsed.error); return; }
    savingRef.current = true;
    setSaving(true);
    setEditorError("");
    try {
      const saved = await saveAttributeForPicker(catalogAdminApi, { ...(original ? { existing: original } : { name: editorName }), values: editorValues });
      if (!attributeChoices([saved]).length) throw new Error("saved_attribute_unavailable");
      setResources((current) => Object.freeze([...current.filter((item) => item.id !== saved.id), saved]));
      if (editor.kind === "new" && !value.length && selectedIds.length < 3) {
        setSelectedIds((current) => Object.freeze([...current, saved.id]));
        setSelectedValues((current) => Object.freeze({ ...current, [saved.id]: Object.freeze([]) }));
        onAttributeIdsChange?.(Object.freeze([...selectedIds, saved.id]));
      }
      setEditor(null);
      setNotice("Nitelik kaydedildi. Ürüne eklenecek değerleri seçin; mevcut varyantlar korunuyor.");
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    } catch (failure) {
      if (failure instanceof CatalogAdminApiError && (failure.code === "version_conflict" || failure.code === "slug_conflict")) {
        try { setResources(await catalogAdminApi.resources("attribute")); } catch { /* Keep the product draft and the current choices. */ }
      }
      setEditorError(failure instanceof CatalogAdminApiError && failure.code === "version_conflict"
        ? "Nitelik başka bir kullanıcı tarafından değiştirildi. Güncel liste yüklendi; değerleri kontrol edip yeniden kaydedin."
        : failure instanceof CatalogAdminApiError && failure.code === "slug_conflict"
          ? "Bu adla bir nitelik zaten var. Güncel listeden mevcut niteliği seçin."
          : failure instanceof CatalogAdminApiError
            ? `${failure.message} Ürün varyantları değiştirilmedi.`
            : "Nitelik kaydedilemedi. Ürün varyantları değiştirilmedi.");
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <fieldset className={styles.picker} disabled={disabled || loading || saving}>
    <legend>Niteliklerden varyant seç</legend>
    <div className={styles.intro}><p className={styles.hint}>Renk, Beden gibi seçenekleri belirleyin; yalnız işaretlediğiniz kombinasyonlar eklenecek.</p><button type="button" onClick={() => openEditor({ kind: "new" })} disabled={selectedIds.length >= 3}>+ Yeni nitelik</button></div>
    {loading ? <p role="status">Nitelikler yükleniyor…</p> : null}
    {!loading && !choices.length ? <p>Henüz nitelik yok. Buradan Renk veya Beden ekleyebilirsiniz.</p> : null}
    {invalidChoiceCount > 0 ? <p role="status" className={styles.error}>{invalidChoiceCount} nitelik kaydının değeri geçersiz; diğer nitelikleri kullanabilirsiniz.</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
    <div className={styles.attributes}>{choices.map((choice) => <label key={choice.id}><input type="checkbox" checked={selectedIds.includes(choice.id)} disabled={!selectedIds.includes(choice.id) && selectedIds.length >= 3} onChange={() => toggleAttribute(choice)} /> {choice.name}</label>)}</div>
    {selectedChoices.map((choice) => <div key={choice.id} className={styles.values}><div className={styles.valueHeading}><strong>{choice.name}</strong><button type="button" onClick={() => openEditor({ kind: "existing", id: choice.id })}>{choice.name} için değer ekle</button></div><div>{choice.values.map((item) => <label key={item}><input type="checkbox" checked={(selectedValues[choice.id] ?? []).includes(item)} onChange={() => toggleValue(choice, item)} /> {item}</label>)}</div></div>)}
    {editor ? <section className={styles.inlineEditor} aria-label="Nitelik düzenleyici" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeEditor(); } }}>
      <div className={styles.editorHeading}><strong>{editor.kind === "new" ? "Yeni nitelik oluştur" : `${choices.find((choice) => choice.id === editor.id)?.name ?? "Nitelik"} için değer ekle`}</strong><button type="button" onClick={closeEditor} aria-label="Nitelik düzenleyiciyi kapat">×</button></div>
      {editor.kind === "new" ? <label>Nitelik adı<input value={editorName} maxLength={120} placeholder="Örn. Renk" onChange={(event) => setEditorName(event.target.value)} /></label> : null}
      <div className={styles.valueEntry}><label>Yeni değer<input ref={editorInputRef} aria-label="Yeni nitelik değeri" value={editorInput} maxLength={100} placeholder="Örn. Siyah" onChange={(event) => setEditorInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addEditorValue(); } }} /></label><button type="button" onClick={addEditorValue}>Değer ekle</button></div>
      {editorValues.length ? <div className={styles.newValues}>{editorValues.map((item) => <button key={item} type="button" onClick={() => setEditorValues((current) => current.filter((value) => value !== item))} aria-label={`${item} değerini kaldır`}>{item} ×</button>)}</div> : null}
      <p className={styles.saveHint}>Nitelik ayrı kaydedilir; üründen vazgeçseniz de Nitelikler bölümünde kalır.</p>
      {editorError ? <p role="alert" className={styles.error}>{editorError}</p> : null}
      <div className={styles.editorActions}><button type="button" onClick={closeEditor}>Vazgeç</button><button type="button" onClick={() => void saveAttribute()} disabled={!editorValues.length}>Niteliği kaydet</button></div>
    </section> : null}
    {selectedChoices.length ? <div className={styles.defaults}><label>Başlangıç fiyatı (₺)<input inputMode="decimal" value={price} onChange={(event) => updateDefault("price", event.target.value)} placeholder="Örn. 199,00" /></label><label>Başlangıç stoku<input inputMode="numeric" pattern="(?:0|[1-9][0-9]*)" value={stock} onChange={(event) => updateDefault("stockQuantity", event.target.value)} /></label></div> : null}
    {matrix && !matrix.ok ? <p role="alert" className={styles.error}>{matrix.error} Daha az nitelik değeri seçin.</p> : null}
    {matrix?.ok ? <div className={styles.combinations}><strong>Satılacak kombinasyonlar ({selectedKeys.size} seçili)</strong><div>{matrix.value.map((candidate) => {
      const key = variantAttributeKey(candidate.attributes);
      const exists = existingKeys.has(key);
      return <label key={key}><input type="checkbox" checked={selectedKeys.has(key) || exists} disabled={exists} onChange={() => toggleCombination(key)} /><span>{candidate.title}</span>{exists ? <small>Zaten var</small> : null}</label>;
    })}</div></div> : null}
  </fieldset>;
}
