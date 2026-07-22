"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CatalogAdminJson, CatalogAdminResource, CatalogAdminResourceKind, Product } from "@celebix/saas-contracts";

import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { catalogAdminApi, CatalogAdminApiError } from "@/lib/catalog-admin-ui/client";
import { catalogApi } from "@/lib/catalog-ui/client";
import { getCatalogResourceRouteDefinitionForKind, selectCatalogResourceForEdit } from "@/lib/catalog-admin-ui/resource-route";
import styles from "./catalog-admin-console.module.css";

const DESCRIPTIONS: Record<CatalogAdminResourceKind, string> = Object.freeze({
  collection: "Ürünleri vitrin ve kampanya koleksiyonlarında yönetin.",
  brand: "Katalog markalarını ve bağlı ürünleri yönetin.",
  attribute: "Renk, beden ve benzeri varyant niteliklerini tanımlayın.",
  extra: "Ürünlere eklenebilen seçenek ve fiyat farklarını yönetin.",
  definition: "Katalogda yeniden kullanılan anahtar-değer tanımlarını yönetin.",
});

function value(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

function values(data: FormData, name: string) {
  return Object.freeze(value(data, name).split(",").map((entry) => entry.trim()).filter(Boolean).slice(0, 64));
}

function config(kind: CatalogAdminResourceKind, data: FormData): Readonly<Record<string, CatalogAdminJson>> {
  if (kind === "collection") return Object.freeze({ featured: data.get("featured") === "on" });
  if (kind === "brand") {
    const website = value(data, "website");
    const result: Record<string, CatalogAdminJson> = {};
    if (website) result.website = website;
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

export function CatalogResourceEditor(props: { kind: CatalogAdminResourceKind; resourceId?: string; canManage: boolean }) {
  const { kind, resourceId, canManage } = props;
  const router = useRouter();
  const route = getCatalogResourceRouteDefinitionForKind(kind);
  const [resource, setResource] = useState<CatalogAdminResource>();
  const [products, setProducts] = useState<readonly Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setResource(undefined);
    try {
      const [resources, catalog] = await Promise.all([
        catalogAdminApi.resources(kind),
        kind === "collection" || kind === "brand" ? catalogApi.listProducts() : Promise.resolve({ items: [] as readonly Product[] }),
      ]);
      if (resourceId !== undefined) {
        const selected = selectCatalogResourceForEdit(resources, kind, resourceId);
        if (selected === undefined) {
          setError("Kayıt bulunamadı veya artık erişilemiyor.");
          return;
        }
        setResource(selected);
      }
      setProducts(catalog.items);
    } catch (caught) {
      setError(safeError(caught));
    } finally {
      setLoading(false);
    }
  }, [kind, resourceId]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || (resourceId !== undefined && resource === undefined)) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await catalogAdminApi.saveResource(kind, {
        ...(resource ? { resourceId: resource.id, expectedVersion: resource.version } : {}),
        name: value(data, "name"),
        slug: value(data, "slug"),
        ...(value(data, "description") ? { description: value(data, "description") } : {}),
        config: config(kind, data),
        productIds: data.getAll("productId").map(String),
      });
      router.push(`/products/${route.segment}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof TypeError && caught.message === "catalog_resource_form_invalid" ? "Gönderilen katalog bilgileri geçersiz." : safeError(caught));
    } finally {
      setBusy(false);
    }
  }

  const title = resourceId === undefined ? `Yeni ${route.title}` : `${route.title} düzenle`;
  if (!canManage) return <PanelPageShell><PanelPageHeader title={title} description={DESCRIPTIONS[kind]} /><p className={styles.error} role="alert">Bu katalog işlemi için yetkiniz yok.</p></PanelPageShell>;

  return <PanelPageShell><PanelPageHeader title={title} description={DESCRIPTIONS[kind]} /><section className={styles.surface}>
    {loading ? <p className={styles.state} role="status">Kayıt yükleniyor…</p> : null}
    {!loading && error ? <p className={styles.error} role="alert">{error}</p> : null}
    {!loading && !error ? <form className={styles.form} onSubmit={submit}>
      <label>Ad<input name="name" required maxLength={120} defaultValue={resource?.name ?? ""} /></label>
      <label>URL anahtarı<input name="slug" required maxLength={120} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={resource?.slug ?? ""} /></label>
      <label className={styles.wide}>Açıklama<textarea name="description" maxLength={2000} defaultValue={resource?.description ?? ""} /></label>
      {kind === "collection" ? <label><span>Vitrinde öne çıkar</span><input name="featured" type="checkbox" defaultChecked={resource?.config.featured === true} /></label> : null}
      {kind === "brand" ? <label>Marka sitesi<input name="website" type="url" maxLength={1000} defaultValue={configValue(resource, "website")} /></label> : null}
      {kind === "attribute" ? <label className={styles.wide}>Değerler (virgülle ayırın)<input name="values" required maxLength={1000} defaultValue={configValue(resource, "values")} /></label> : null}
      {kind === "extra" ? <><label>Seçenekler (virgülle ayırın)<input name="options" required maxLength={1000} defaultValue={configValue(resource, "options")} /></label><label>Fiyat farkı (kuruş)<input name="priceAdjustmentCents" type="number" min={0} step={1} defaultValue={configValue(resource, "priceAdjustmentCents") || "0"} /></label></> : null}
      {kind === "definition" ? <><label>Tanım anahtarı<input name="definitionKey" required maxLength={64} defaultValue={configValue(resource, "key")} /></label><label>Tanım değeri<input name="definitionValue" required maxLength={1000} defaultValue={configValue(resource, "value")} /></label></> : null}
      {kind === "collection" || kind === "brand" ? <fieldset className={`${styles.wide} ${styles.checks}`}><legend>Bağlı ürünler</legend>{products.map((product) => <label className={styles.check} key={product.id}><input name="productId" type="checkbox" value={product.id} defaultChecked={resource?.productIds.includes(product.id)} /><span>{product.title}</span></label>)}</fieldset> : null}
      <div className={`${styles.wide} ${styles.actions}`}><button className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button></div>
    </form> : null}
  </section></PanelPageShell>;
}
