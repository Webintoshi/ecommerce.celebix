"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CatalogAdminJson, CatalogAdminResource, CatalogAdminResourceKind, Product } from "@celebix/saas-contracts";
import { PanelEmptyState, PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { catalogApi } from "@/lib/catalog-ui/client";
import { CatalogAdminApiError, catalogAdminApi } from "@/lib/catalog-admin-ui/client";
import styles from "./catalog-admin-console.module.css";
const META: Record<CatalogAdminResourceKind, Readonly<{ title: string; description: string; singular: string }>> = {
  collection: { title: "Koleksiyonlar", singular: "koleksiyon", description: "Ürünleri vitrin ve kampanya koleksiyonlarında yönetin." },
  brand: { title: "Markalar", singular: "marka", description: "Katalog markalarını ve bağlı ürünleri yönetin." },
  attribute: { title: "Nitelikler", singular: "nitelik", description: "Renk, beden ve benzeri varyant niteliklerini tanımlayın." },
  extra: { title: "Ekstralar", singular: "ekstra", description: "Ürünlere eklenebilen seçenek ve fiyat farklarını yönetin." },
  definition: { title: "Tanımlamalar", singular: "tanımlama", description: "Katalogda yeniden kullanılan anahtar-değer tanımlarını yönetin." },
};
function config(kind: CatalogAdminResourceKind, data: FormData): Readonly<Record<string, CatalogAdminJson>> {
  if (kind === "collection") return Object.freeze({ featured: data.get("featured") === "on" });
  if (kind === "brand") { const website = String(data.get("website") ?? "").trim(); return Object.freeze({ ...(website ? { website } : {}) }); }
  if (kind === "attribute") return Object.freeze({ values: Object.freeze(String(data.get("values") ?? "").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 64)) });
  if (kind === "extra") return Object.freeze({ options: Object.freeze(String(data.get("options") ?? "").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 64)), priceAdjustmentCents: Number(data.get("priceAdjustmentCents") ?? 0) });
  return Object.freeze({ key: String(data.get("definitionKey") ?? "").trim(), value: String(data.get("definitionValue") ?? "").trim() });
}
function configValue(resource: CatalogAdminResource | null, key: string) { const value = resource?.config[key]; return typeof value === "string" || typeof value === "number" ? String(value) : Array.isArray(value) ? value.join(", ") : ""; }
export function CatalogResourceConsole({ kind, canManage }: { kind: CatalogAdminResourceKind; canManage: boolean }) {
  const meta = META[kind], [items, setItems] = useState<readonly CatalogAdminResource[]>([]), [products, setProducts] = useState<readonly Product[]>([]), [editing, setEditing] = useState<CatalogAdminResource | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [resources, catalog] = await Promise.all([catalogAdminApi.resources(kind), kind === "collection" || kind === "brand" ? catalogApi.listProducts() : Promise.resolve({ items: [] as readonly Product[] })]); setItems(resources); setProducts(catalog.items); } catch (caught) { setError(caught instanceof CatalogAdminApiError ? caught.message : `${meta.title} yüklenemedi.`); } finally { setLoading(false); } }, [kind, meta.title]);
  useEffect(() => { void load(); }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget, data = new FormData(form), productIds = data.getAll("productId").map(String); setBusy(true); setError(""); setMessage(""); try { await catalogAdminApi.saveResource(kind, { ...(editing ? { resourceId: editing.id, expectedVersion: editing.version } : {}), name: String(data.get("name") ?? "").trim(), slug: String(data.get("slug") ?? "").trim(), ...(String(data.get("description") ?? "").trim() ? { description: String(data.get("description")).trim() } : {}), config: config(kind, data), productIds }); setMessage(`${meta.singular[0]?.toLocaleUpperCase("tr-TR")}${meta.singular.slice(1)} kaydedildi.`); setEditing(null); form.reset(); await load(); } catch (caught) { setError(caught instanceof CatalogAdminApiError ? caught.message : "Kayıt tamamlanamadı."); } finally { setBusy(false); } }
  async function archive(resource: CatalogAdminResource) { setBusy(true); setError(""); try { await catalogAdminApi.archiveResource(kind, resource.id, resource.version); if (editing?.id === resource.id) setEditing(null); await load(); } catch (caught) { setError(caught instanceof CatalogAdminApiError ? caught.message : "Kayıt arşivlenemedi."); } finally { setBusy(false); } }
  return <PanelPageShell><PanelPageHeader title={meta.title} description={meta.description} /><section className={styles.surface}>
    {canManage ? <form key={editing?.id ?? "new"} className={styles.form} onSubmit={submit}>
      <label>Ad<input name="name" required maxLength={120} defaultValue={editing?.name} /></label><label>URL anahtarı<input name="slug" required maxLength={120} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={editing?.slug} /></label>
      <label className={styles.wide}>Açıklama<textarea name="description" maxLength={2000} defaultValue={editing?.description} /></label>
      {kind === "collection" ? <label><span>Vitrinde öne çıkar</span><input name="featured" type="checkbox" defaultChecked={editing?.config.featured === true} /></label> : null}
      {kind === "brand" ? <label>Marka sitesi<input name="website" type="url" maxLength={1000} defaultValue={configValue(editing, "website")} /></label> : null}
      {kind === "attribute" ? <label className={styles.wide}>Değerler (virgülle ayırın)<input name="values" required maxLength={1000} defaultValue={configValue(editing, "values")} /></label> : null}
      {kind === "extra" ? <><label>Seçenekler (virgülle ayırın)<input name="options" required maxLength={1000} defaultValue={configValue(editing, "options")} /></label><label>Fiyat farkı (kuruş)<input name="priceAdjustmentCents" type="number" min={0} step={1} defaultValue={configValue(editing, "priceAdjustmentCents") || "0"} /></label></> : null}
      {kind === "definition" ? <><label>Tanım anahtarı<input name="definitionKey" required maxLength={64} defaultValue={configValue(editing, "key")} /></label><label>Tanım değeri<input name="definitionValue" required maxLength={1000} defaultValue={configValue(editing, "value")} /></label></> : null}
      {kind === "collection" || kind === "brand" ? <fieldset className={`${styles.wide} ${styles.checks}`}><legend>Bağlı ürünler</legend>{products.map((product) => <label className={styles.check} key={product.id}><input name="productId" type="checkbox" value={product.id} defaultChecked={editing?.productIds.includes(product.id)} /><span>{product.title}</span></label>)}</fieldset> : null}
      <div className={`${styles.wide} ${styles.actions}`}><button className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : editing ? "Değişiklikleri kaydet" : "Oluştur"}</button>{editing ? <button className={styles.button} type="button" onClick={() => setEditing(null)}>Vazgeç</button> : null}</div>
    </form> : null}
    {message ? <p className={styles.notice} role="status">{message}</p> : null}{error ? <p className={styles.error} role="alert">{error}</p> : null}
    {loading ? <div className={styles.state} role="status">{meta.title} yükleniyor…</div> : items.length === 0 ? <PanelEmptyState title={`Henüz ${meta.singular} yok`} description="İlk gerçek kayıt oluşturulduğunda burada görünecek." /> : <div className={styles.list}>{items.map((resource) => <article className={styles.item} key={resource.id}><div><h2>{resource.name}</h2><p>/{resource.slug} · {resource.productCount} ürün</p>{resource.description ? <small>{resource.description}</small> : null}</div><div className={styles.actions}><span className={styles.status}>v{resource.version}</span>{canManage ? <><button className={styles.button} disabled={busy} onClick={() => setEditing(resource)}>Düzenle</button><button className={styles.danger} disabled={busy} onClick={() => void archive(resource)}>Arşivle</button></> : null}</div></article>)}</div>}
  </section></PanelPageShell>;
}
