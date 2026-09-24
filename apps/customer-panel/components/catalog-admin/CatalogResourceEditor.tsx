"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CatalogAdminJson, CatalogAdminResource, CatalogAdminResourceKind, Product } from "@celebix/saas-contracts";

import { CatalogBrandLogoPicker } from "@/components/catalog-admin/CatalogBrandLogoPicker";
import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { catalogAdminApi, CatalogAdminApiError } from "@/lib/catalog-admin-ui/client";
import { brandLogoAssetId, loadBrandProductDirectory, type BrandProductDirectoryEntry } from "@/lib/catalog-admin-ui/brand-product-directory";
import { catalogApi } from "@/lib/catalog-ui/client";
import { getCatalogResourceRouteDefinitionForKind } from "@/lib/catalog-admin-ui/resource-route";
import styles from "./catalog-admin-console.module.css";

const DESCRIPTIONS: Record<CatalogAdminResourceKind, string> = Object.freeze({
  collection: "Ürünleri vitrin ve kampanya koleksiyonlarında yönetin.",
  brand: "Katalog markalarını ve bağlı ürünleri yönetin.",
  attribute: "Renk, beden ve benzeri varyant niteliklerini tanımlayın.",
  extra: "Ürünlere eklenebilen seçenek ve fiyat farklarını yönetin.",
  definition: "Katalogda yeniden kullanılan anahtar-değer tanımlarını yönetin.",
  tag: "Ürünleri tekrar kullanılabilir katalog etiketleriyle gruplandırın.",
});

function value(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

function attributeSlug(name: string) {
  return name.toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i").replaceAll("ğ", "g").replaceAll("ü", "u")
    .replaceAll("ş", "s").replaceAll("ö", "o").replaceAll("ç", "c")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 120).replace(/-$/g, "");
}

function appendAttributeValue(current: readonly string[], raw: string) {
  const next = raw.trim();
  if (!next) return { values: current, error: "" };
  if (next.length > 120) return { values: current, error: "Değer en fazla 120 karakter olabilir." };
  if (current.some((entry) => entry.toLocaleLowerCase("tr-TR") === next.toLocaleLowerCase("tr-TR"))) return { values: current, error: "Bu değer zaten eklendi." };
  if (current.length >= 64) return { values: current, error: "En fazla 64 değer ekleyebilirsiniz." };
  return { values: Object.freeze([...current, next]), error: "" };
}

function values(data: FormData, name: string) {
  return Object.freeze(value(data, name).split(",").map((entry) => entry.trim()).filter(Boolean).slice(0, 64));
}

function config(kind: CatalogAdminResourceKind, data: FormData): Readonly<Record<string, CatalogAdminJson>> {
  if (kind === "tag") return Object.freeze({});
  if (kind === "collection") return Object.freeze({ featured: data.get("featured") === "on" });
  if (kind === "brand") {
    const website = value(data, "website");
    const logoAssetId = value(data, "logoAssetId");
    const result: Record<string, CatalogAdminJson> = {};
    if (website) result.website = website;
    if (logoAssetId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(logoAssetId)) throw new TypeError("catalog_resource_form_invalid");
      result.logoAssetId = logoAssetId;
    }
    return Object.freeze(result);
  }
  if (kind === "attribute") return Object.freeze({ values: values(data, "values") });
  if (kind === "extra") {
    const priceAdjustmentCents = Number(value(data, "priceAdjustmentCents") || "0");
    if (!Number.isSafeInteger(priceAdjustmentCents) || priceAdjustmentCents < 0) throw new TypeError("catalog_resource_form_invalid");
    return Object.freeze({ options: values(data, "options"), priceAdjustmentCents });
  }
  return Object.freeze({ key: value(data, "definitionKey"), value: value(data, "definitionValue") });
}

function configValue(resource: CatalogAdminResource | undefined, key: string) {
  const item = resource?.config[key];
  return typeof item === "string" || typeof item === "number" ? String(item) : Array.isArray(item) ? item.join(", ") : "";
}

function safeError(caught: unknown) {
  return caught instanceof CatalogAdminApiError ? caught.message : "Kayıt tamamlanamadı.";
}

function hasProductRelations(kind: CatalogAdminResourceKind) {
  return kind === "collection" || kind === "brand" || kind === "tag";
}

export function CatalogResourceEditor(props: { kind: CatalogAdminResourceKind; resourceId?: string; canManage: boolean }) {
  const { kind, resourceId, canManage } = props;
  const router = useRouter();
  const route = getCatalogResourceRouteDefinitionForKind(kind);
  const [resource, setResource] = useState<CatalogAdminResource>();
  const [products, setProducts] = useState<readonly Product[]>([]);
  const [brandProducts, setBrandProducts] = useState<readonly BrandProductDirectoryEntry[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<readonly string[]>([]);
  const [selectedLogoAssetId, setSelectedLogoAssetId] = useState<string>();
  const [brandName, setBrandName] = useState("");
  const [attributeValues, setAttributeValues] = useState<readonly string[]>([]);
  const [attributeValueError, setAttributeValueError] = useState("");
  const attributeValueInput = useRef<HTMLInputElement>(null);
  const [productCursor, setProductCursor] = useState<string>();
  const [productSearch, setProductSearch] = useState("");
  const [visibleProductLimit, setVisibleProductLimit] = useState(100);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setLoading(true);
    setError("");
    setResource(undefined);
    setProducts([]);
    setBrandProducts([]);
    setSelectedProductIds([]);
    setSelectedLogoAssetId(undefined);
    setBrandName("");
    setAttributeValues([]);
    setAttributeValueError("");
    setProductCursor(undefined);
    setProductSearch("");
    setVisibleProductLimit(100);
    setLoadingProducts(false);
    setBusy(false);
    try {
      const [selected, catalog, directory] = await Promise.all([
        resourceId === undefined ? Promise.resolve(undefined) : catalogAdminApi.resource(kind, resourceId),
        hasProductRelations(kind) && kind !== "brand" ? catalogApi.listProducts() : Promise.resolve({ items: [] as readonly Product[], nextCursor: undefined }),
        kind === "brand" ? loadBrandProductDirectory(catalogApi) : Promise.resolve([] as readonly BrandProductDirectoryEntry[]),
      ]);
      if (requestSequence.current !== sequence) return;
      if (selected) setResource(selected);
      setProducts(catalog.items);
      setBrandProducts(directory);
      setSelectedProductIds(selected?.productIds ?? []);
      setSelectedLogoAssetId(selected ? brandLogoAssetId(selected.config) : undefined);
      setBrandName(selected?.name ?? "");
      setAttributeValues(Array.isArray(selected?.config.values) ? selected.config.values.filter((entry): entry is string => typeof entry === "string") : []);
      setProductCursor(catalog.nextCursor);
    } catch (caught) {
      if (requestSequence.current === sequence) setError(safeError(caught));
    } finally {
      if (requestSequence.current === sequence) setLoading(false);
    }
  }, [kind, requestSequence, resourceId]);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load, requestSequence]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy) return;
    if (resourceId === undefined ? resource !== undefined : resource === undefined || resource.id !== resourceId || resource.kind !== kind) return;
    const sequence = requestSequence.current;
    const data = new FormData(event.currentTarget);
    const name = value(data, "name");
    const slug = kind === "attribute" ? resource?.slug ?? attributeSlug(name) : value(data, "slug");
    const submittedAttributeValues = kind === "attribute" ? appendAttributeValue(attributeValues, attributeValueInput.current?.value ?? "") : { values: attributeValues, error: "" };
    if (kind === "attribute" && !slug) {
      setError("Nitelik adı en az bir harf veya rakam içermeli.");
      return;
    }
    if (kind === "attribute" && (submittedAttributeValues.error || submittedAttributeValues.values.length === 0)) {
      setAttributeValueError(submittedAttributeValues.error || "En az bir değer ekleyin.");
      return;
    }
    if (kind === "attribute" && submittedAttributeValues.values !== attributeValues) {
      setAttributeValues(submittedAttributeValues.values);
      if (attributeValueInput.current) attributeValueInput.current.value = "";
      setAttributeValueError("");
    }
    setBusy(true);
    setError("");
    try {
      await catalogAdminApi.saveResource(kind, {
        ...(resource ? { resourceId: resource.id, expectedVersion: resource.version } : {}),
        name,
        slug,
        ...(value(data, "description") ? { description: value(data, "description") } : {}),
        config: kind === "attribute" ? Object.freeze({ values: submittedAttributeValues.values }) : config(kind, data),
        productIds: selectedProductIds,
      });
      if (requestSequence.current === sequence) {
        router.push(`/products/${route.segment}`);
        router.refresh();
      }
    } catch (caught) {
      if (requestSequence.current === sequence) setError(kind === "attribute" && caught instanceof CatalogAdminApiError && caught.code === "slug_conflict"
        ? "Bu adla bir nitelik zaten var. Farklı bir ad deneyin."
        : caught instanceof TypeError && caught.message === "catalog_resource_form_invalid" ? "Gönderilen katalog bilgileri geçersiz." : safeError(caught));
    } finally {
      if (requestSequence.current === sequence) setBusy(false);
    }
  }

  function addAttributeValue() {
    const result = appendAttributeValue(attributeValues, attributeValueInput.current?.value ?? "");
    if (result.values === attributeValues && !result.error) return;
    if (result.error) { setAttributeValueError(result.error); return; }
    setAttributeValues(result.values);
    if (attributeValueInput.current) attributeValueInput.current.value = "";
    setAttributeValueError("");
  }

  async function loadMoreProducts() {
    if (!productCursor || loadingProducts) return;
    const sequence = requestSequence.current;
    const cursor = productCursor;
    setLoadingProducts(true);
    setError("");
    try {
      const next = await catalogApi.listProducts({ cursor });
      if (requestSequence.current !== sequence) return;
      setProducts((current) => Object.freeze([...new Map([...current, ...next.items].map((product) => [product.id, product])).values()]));
      setProductCursor(next.nextCursor);
    } catch (caught) {
      if (requestSequence.current === sequence) setError(safeError(caught));
    } finally {
      if (requestSequence.current === sequence) setLoadingProducts(false);
    }
  }

  function toggleProduct(productId: string, checked: boolean) {
    setSelectedProductIds((current) => checked
      ? current.includes(productId) ? current : Object.freeze([...current, productId])
      : Object.freeze(current.filter((id) => id !== productId)));
  }

  const title = resourceId === undefined ? `Yeni ${route.title}` : `${route.title} düzenle`;
  const normalizedSearch = productSearch.trim().toLocaleLowerCase("tr-TR");
  const productOptions: readonly BrandProductDirectoryEntry[] = kind === "brand" ? brandProducts : products.map((product) => Object.freeze({ id: product.id, title: product.title, variantCount: 0, status: product.status === "draft" ? "draft" as const : "active" as const }));
  const selectedProductIdSet = new Set(selectedProductIds);
  const filteredProducts = [...(normalizedSearch
    ? productOptions.filter((product) => product.title.toLocaleLowerCase("tr-TR").includes(normalizedSearch) || product.representativeSku?.toLocaleLowerCase("tr-TR").includes(normalizedSearch))
    : productOptions)].sort((left, right) => Number(selectedProductIdSet.has(right.id)) - Number(selectedProductIdSet.has(left.id)) || left.title.localeCompare(right.title, "tr-TR"));
  const visibleProducts = filteredProducts.slice(0, visibleProductLimit);
  const loadedProductIds = new Set(productOptions.map(({ id }) => id));
  const unseenSelectedProductIds = selectedProductIds.filter((id) => !loadedProductIds.has(id));
  if (!canManage) return <PanelPageShell><PanelPageHeader title={title} description={DESCRIPTIONS[kind]} /><p className={styles.error} role="alert">Bu katalog işlemi için yetkiniz yok.</p></PanelPageShell>;

  return <PanelPageShell><PanelPageHeader title={title} description={DESCRIPTIONS[kind]} /><section className={styles.surface}>
    {loading ? <p className={styles.state} role="status">Kayıt yükleniyor…</p> : null}
    {!loading && error ? <p className={styles.error} role="alert">{error}</p> : null}
    {!loading && (kind === "attribute" ? resourceId === undefined || resource !== undefined : !error) ? <form className={`${styles.form} ${kind === "attribute" ? styles.attributeForm : ""}`} onSubmit={submit}>
      {kind === "brand" ? <div className={`${styles.wide} ${styles.brandEditorIntro}`}><CatalogBrandLogoPicker value={selectedLogoAssetId} brandName={brandName} canManage={canManage} onChange={setSelectedLogoAssetId} /><input type="hidden" name="logoAssetId" value={selectedLogoAssetId ?? ""} /></div> : null}
      {kind === "attribute" ? <div className={`${styles.wide} ${styles.attributeFormIntro}`}><span>ÜRÜN SEÇENEĞİ</span><h2>{resource ? "Niteliği düzenle" : "Yeni nitelik"}</h2><p>Bir ad verin, ardından müşterinin seçeceği değerleri ekleyin.</p></div> : null}
      <label className={kind === "attribute" ? styles.wide : undefined}>{kind === "attribute" ? "Nitelik adı" : "Ad"}<input name="name" required maxLength={120} placeholder={kind === "attribute" ? "Örn. Renk veya Beden" : undefined} {...(kind === "brand" ? { value: brandName, onChange: (event) => setBrandName(event.currentTarget.value) } : { defaultValue: resource?.name ?? "" })} /></label>
      {kind !== "attribute" ? <label>URL anahtarı<input name="slug" required maxLength={120} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={resource?.slug ?? ""} /></label> : null}
      {kind !== "attribute" ? <label className={styles.wide}>Açıklama<textarea name="description" maxLength={2000} defaultValue={resource?.description ?? ""} /></label> : null}
      {kind === "collection" ? <label><span>Vitrinde öne çıkar</span><input name="featured" type="checkbox" defaultChecked={resource?.config.featured === true} /></label> : null}
      {kind === "brand" ? <label>Marka sitesi<input name="website" type="url" maxLength={1000} defaultValue={configValue(resource, "website")} /></label> : null}
      {kind === "attribute" ? <>
        <div className={`${styles.wide} ${styles.attributeValueField}`}>
          <label htmlFor="attribute-value-draft">Seçenek değerleri</label>
          <p>Örneğin Renk için Siyah, Beyaz; Beden için S, M, L ekleyin.</p>
          <div className={styles.attributeValueEntry}>
            <input ref={attributeValueInput} id="attribute-value-draft" placeholder="Örn. Siyah" maxLength={120} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addAttributeValue(); } }} />
            <button className={styles.button} type="button" onClick={addAttributeValue}>Değer ekle</button>
          </div>
          {attributeValueError ? <p className={styles.error} role="alert">{attributeValueError}</p> : null}
          {attributeValues.length ? <ul className={styles.attributeValueList}>{attributeValues.map((entry) => <li key={entry}><span>{entry}</span><button type="button" aria-label={`${entry} değerini kaldır`} onClick={() => setAttributeValues((current) => Object.freeze(current.filter((value) => value !== entry)))}>×</button></li>)}</ul> : <p className={styles.attributeValueEmpty}>Henüz değer eklenmedi.</p>}
        </div>
        <details className={`${styles.wide} ${styles.attributeDetails}`}><summary>Ek açıklama</summary><label>Açıklama<textarea name="description" maxLength={2000} defaultValue={resource?.description ?? ""} /></label></details>
      </> : null}
      {kind === "extra" ? <><label>Seçenekler (virgülle ayırın)<input name="options" required maxLength={1000} defaultValue={configValue(resource, "options")} /></label><label>Fiyat farkı (kuruş)<input name="priceAdjustmentCents" type="number" min={0} step={1} defaultValue={configValue(resource, "priceAdjustmentCents") || "0"} /></label></> : null}
      {kind === "definition" ? <><label>Tanım anahtarı<input name="definitionKey" required maxLength={64} defaultValue={configValue(resource, "key")} /></label><label>Tanım değeri<input name="definitionValue" required maxLength={1000} defaultValue={configValue(resource, "value")} /></label></> : null}
      {hasProductRelations(kind) ? <fieldset className={`${styles.wide} ${styles.checks}`}>
        <legend>Bağlı ürünler <span>{selectedProductIds.length} seçili</span></legend>
        <label className={styles.productSearch}>Ürün adı veya SKU ile ara<input type="search" value={productSearch} placeholder="Örn. Altın kolye veya KLY-1293" onChange={(event) => { setProductSearch(event.currentTarget.value); setVisibleProductLimit(100); }} /></label>
        {unseenSelectedProductIds.map((productId) => <label className={styles.check} key={productId}>
          <input name="productId" type="checkbox" value={productId} checked onChange={(event) => toggleProduct(productId, event.currentTarget.checked)} />
          <span><strong>Ürün bilgisi artık katalogda okunamıyor</strong><small>Bağı koruyabilir veya kaldırabilirsiniz.</small></span>
        </label>)}
        {visibleProducts.map((product) => <label className={styles.check} key={product.id}>
          <input name="productId" type="checkbox" value={product.id} checked={selectedProductIds.includes(product.id)} onChange={(event) => toggleProduct(product.id, event.currentTarget.checked)} />
          <span><strong>{product.title}</strong><small>{product.representativeSku ? `SKU: ${product.representativeSku}` : product.status === "draft" ? "Taslak ürün" : "SKU bilgisi yok"}{product.variantCount > 1 ? ` · ${product.variantCount} varyant` : ""}</small></span>
        </label>)}
        {kind === "brand" && visibleProducts.length < filteredProducts.length ? <button className={styles.button} type="button" onClick={() => setVisibleProductLimit((current) => current + 100)}>Daha fazla ürün göster</button> : null}
        {kind !== "brand" && productCursor ? <button className={styles.button} type="button" disabled={loadingProducts} onClick={() => { void loadMoreProducts(); }}>{loadingProducts ? "Ürünler yükleniyor…" : "Daha fazla ürün yükle"}</button> : null}
      </fieldset> : null}
      <div className={`${styles.wide} ${styles.actions} ${kind === "attribute" ? styles.attributeFormActions : ""}`}>{kind === "attribute" ? <a className={styles.button} href="/products/attributes">Vazgeç</a> : null}<button className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : kind === "attribute" ? resource ? "Değişiklikleri kaydet" : "Niteliği oluştur" : "Kaydet"}</button></div>
    </form> : null}
  </section></PanelPageShell>;
}
