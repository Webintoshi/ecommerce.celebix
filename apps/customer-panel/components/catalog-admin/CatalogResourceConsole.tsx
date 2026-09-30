"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseStorefrontAsset, type CatalogAdminResource, type CatalogAdminResourceKind, type StorefrontAsset } from "@celebix/saas-contracts";
import { ImageOff, Search, Pencil, Archive } from "lucide-react";

import { PanelEmptyState, PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { CatalogAdminApiError, catalogAdminApi } from "@/lib/catalog-admin-ui/client";
import { brandLogoAssetId, loadBrandProductDirectory, type BrandProductDirectoryEntry } from "@/lib/catalog-admin-ui/brand-product-directory";
import { catalogApi } from "@/lib/catalog-ui/client";
import { getCatalogResourceRouteDefinitionForKind } from "@/lib/catalog-admin-ui/resource-route";
import styles from "./catalog-admin-console.module.css";

const META: Record<CatalogAdminResourceKind, Readonly<{ title: string; description: string; singular: string }>> = Object.freeze({
  collection: { title: "Koleksiyonlar", singular: "koleksiyon", description: "Ürünleri vitrin ve kampanya koleksiyonlarında yönetin." },
  brand: { title: "Markalar", singular: "marka", description: "Katalog markalarını ve bağlı ürünleri yönetin." },
  attribute: { title: "Nitelikler", singular: "nitelik", description: "Renk, beden ve benzeri varyant niteliklerini tanımlayın." },
  extra: { title: "Ekstralar", singular: "ekstra", description: "Ürünlere eklenebilen seçenek ve fiyat farklarını yönetin." },
  definition: { title: "Tanımlamalar", singular: "tanımlama", description: "Katalogda yeniden kullanılan anahtar-değer tanımlarını yönetin." },
  tag: { title: "Etiketler", singular: "etiket", description: "Ürünleri tekrar kullanılabilir katalog etiketleriyle gruplandırın." },
});

function activeResources(resources: readonly CatalogAdminResource[]) {
  return Object.freeze(resources.filter((resource) => resource.status === "active"));
}

function attributeValues(resource: CatalogAdminResource) {
  return Array.isArray(resource.config.values)
    ? resource.config.values.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function CatalogResourceConsole({ kind, canManage }: { kind: CatalogAdminResourceKind; canManage: boolean }) {
  const route = getCatalogResourceRouteDefinitionForKind(kind);
  const meta = META[kind];
  const [items, setItems] = useState<readonly CatalogAdminResource[]>([]);
  const [brandProducts, setBrandProducts] = useState<readonly BrandProductDirectoryEntry[]>([]);
  const [brandLogos, setBrandLogos] = useState<readonly StorefrontAsset[]>([]);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState<"all" | "unlinked" | "no-logo">("all");
  const [brandSort, setBrandSort] = useState("name");
  const [archivingIds, setArchivingIds] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (kind === "brand") {
        const [resources, directory, assetResponse] = await Promise.all([
          catalogAdminApi.resources(kind),
          loadBrandProductDirectory(catalogApi),
          fetch("/api/storefront-assets", { credentials: "same-origin", cache: "no-store" }),
        ]);
        if (!assetResponse.ok) throw new Error();
        const assetBody = await assetResponse.json() as { assets?: unknown };
        if (!Array.isArray(assetBody.assets) || assetBody.assets.length > 64) throw new Error();
        setItems(activeResources(resources));
        setBrandProducts(directory);
        setBrandLogos(Object.freeze(assetBody.assets.map(parseStorefrontAsset).filter((asset) => asset.kind === "logo" && asset.status === "active")));
      } else {
        setItems(activeResources(await catalogAdminApi.resources(kind)));
        setBrandProducts([]);
        setBrandLogos([]);
      }
    } catch (caught) {
      setError(caught instanceof CatalogAdminApiError ? caught.message : `${meta.title} yüklenemedi.`);
    } finally {
      setLoading(false);
    }
  }, [kind, meta.title]);

  useEffect(() => { void load(); }, [load]);

  async function archive(resource: CatalogAdminResource) {
    if (kind === "brand" && (archivingIds.includes(resource.id) || !window.confirm(`${resource.name} arşivlensin mi? Marka aktif listeden kaldırılacak.`))) return;
    if (kind === "brand") setArchivingIds((current) => [...current, resource.id]); else setBusy(true);
    setError("");
    try {
      await catalogAdminApi.archiveResource(kind, resource.id, resource.version);
      if (kind === "brand") setItems((current) => current.filter((item) => item.id !== resource.id)); else await load();
    } catch (caught) {
      setError(caught instanceof CatalogAdminApiError ? caught.message : "Kayıt arşivlenemedi.");
    } finally {
      if (kind === "brand") setArchivingIds((current) => current.filter((id) => id !== resource.id)); else setBusy(false);
    }
  }

  const productById = useMemo(() => new Map(brandProducts.map((product) => [product.id, product])), [brandProducts]);
  const logoById = useMemo(() => new Map(brandLogos.map((asset) => [asset.id, asset])), [brandLogos]);
  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR");
  const visibleItems = kind === "brand"
    ? items.filter((resource) => (brandFilter === "all" || (brandFilter === "unlinked" ? resource.productCount === 0 : !logoById.has(brandLogoAssetId(resource.config) ?? ""))) && (!normalizedSearch || [resource.name, resource.slug].some((entry) => entry.toLocaleLowerCase("tr-TR").includes(normalizedSearch)) || resource.productIds.some((id) => { const product = productById.get(id); return [product?.title, product?.representativeSku].some((entry) => entry?.toLocaleLowerCase("tr-TR").includes(normalizedSearch)); }))).sort((left, right) => brandSort === "products" ? right.productCount - left.productCount || left.name.localeCompare(right.name, "tr-TR") : left.name.localeCompare(right.name, "tr-TR"))
    : !normalizedSearch ? items
    : items.filter((resource) => [resource.name, resource.slug, resource.description ?? "", ...attributeValues(resource)].some((entry) => entry.toLocaleLowerCase("tr-TR").includes(normalizedSearch)));

  function brandCard(resource: CatalogAdminResource) {
    const logo = logoById.get(brandLogoAssetId(resource.config) ?? "");
    const linkedProducts = resource.productIds.map((id) => productById.get(id)).filter((product): product is BrandProductDirectoryEntry => product !== undefined);
    return <article className={styles.brandCard} key={resource.id}>
      <div className={styles.brandCardLogo}>{logo ? <>{/* eslint-disable-next-line @next/next/no-img-element -- tenant R2 URLs are runtime data */}<img src={logo.publicUrl} alt={logo.altText || `${resource.name} logosu`} /></> : <span aria-label="Marka görseli yok">{resource.name[0]?.toLocaleUpperCase("tr-TR") || <ImageOff aria-hidden="true" />}</span>}</div>
      <div className={styles.brandCardBody}>
        <div className={styles.brandCardTitle}><div><h2>{canManage ? <Link href={`/products/${route.segment}/${encodeURIComponent(resource.id)}/edit`}>{resource.name}</Link> : resource.name}</h2><p>/{resource.slug}</p></div><span>{resource.productCount.toLocaleString("tr-TR")} ürün</span></div>
        {resource.description ? <p className={styles.brandDescription}>{resource.description}</p> : null}
        <details className={styles.brandProducts}><summary>Bağlı ürünler</summary>{linkedProducts.length ? <ul>{linkedProducts.slice(0, 4).map((product) => <li key={product.id}><span>{product.title}</span>{product.representativeSku ? <small>{product.representativeSku}</small> : null}</li>)}</ul> : <p>{resource.productCount ? "Ürün adları okunamadı." : "Ürün bağlanmamış."}</p>}{resource.productCount > 4 ? <small>+{(resource.productCount - 4).toLocaleString("tr-TR")} ürün daha</small> : null}</details>
      </div>
      <div className={styles.brandCardActions}><span className={styles.status}>v{resource.version}</span>{canManage ? <><Link className={styles.button} href={`/products/${route.segment}/${encodeURIComponent(resource.id)}/edit`}><Pencil aria-hidden="true" /> Düzenle</Link><button className={styles.danger} type="button" aria-label={`${resource.name} markasını arşivle`} disabled={archivingIds.includes(resource.id)} onClick={() => void archive(resource)}><Archive aria-hidden="true" /><span className={styles.srOnly}>{archivingIds.includes(resource.id) ? "Arşivleniyor" : "Arşivle"}</span></button></> : null}</div>
    </article>;
  }

  function attributeCard(resource: CatalogAdminResource) {
    const values = attributeValues(resource);
    return <article className={styles.attributeCard} key={resource.id}>
      <div className={styles.attributeMonogram} aria-hidden="true">{resource.name.charAt(0).toLocaleUpperCase("tr-TR")}</div>
      <div className={styles.attributeCardBody}>
        <div className={styles.attributeCardHeading}><h2>{resource.name}</h2><span>{values.length} değer</span></div>
        {resource.description ? <p>{resource.description}</p> : null}
        <ul className={styles.attributeChips}>{values.map((entry) => <li key={entry}>{entry}</li>)}</ul>
      </div>
      {canManage ? <div className={styles.attributeCardActions}><Link className={styles.button} href={`/products/${route.segment}/${encodeURIComponent(resource.id)}/edit`}>Düzenle</Link><button className={styles.danger} type="button" disabled={busy} onClick={() => void archive(resource)}>Arşivle</button></div> : null}
    </article>;
  }

  return <PanelPageShell><PanelPageHeader title={meta.title} description={meta.description} actions={canManage ? <span className={styles.workspace}><Link className={styles.primary} href={`/products/${route.segment}/new`}>Yeni {meta.singular}</Link></span> : undefined} /><h1 className={styles.srOnly}>{meta.title}</h1><section className={`${styles.surface} ${styles.workspace} ${kind === "brand" ? styles.brandWorkspace : ""}`}>
    {error ? <p className={styles.error} role="alert">{error} <button className={styles.button} type="button" disabled={loading || busy} onClick={() => void load()}>Tekrar dene</button></p> : null}
    {!loading && items.length ? <div className={styles.resourceToolbar}>
      <label className={styles.resourceSearch}><Search aria-hidden="true" /><span className={styles.srOnly}>{kind === "brand" ? "Marka veya bağlı ürün ara" : kind === "attribute" ? "Nitelik veya değer ara" : `${meta.title} içinde ara`}</span><input type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder={kind === "brand" ? "Marka veya bağlı ürün ara" : kind === "attribute" ? "Nitelik veya değer ara" : "Ad veya URL anahtarı ara"} /></label>
      {kind === "brand" ? <><div className={styles.brandFilters} role="group" aria-label="Marka filtresi">{([["all", "Tümü"], ["unlinked", "Ürünsüz"], ["no-logo", "Görselsiz"]] as const).map(([filter, label]) => <button type="button" key={filter} aria-pressed={brandFilter === filter} onClick={() => setBrandFilter(filter)}>{label}</button>)}</div><label className={styles.brandSort}><span className={styles.srOnly}>Markaları sırala</span><select value={brandSort} onChange={(event) => setBrandSort(event.currentTarget.value)}><option value="name">Ada göre</option><option value="products">Ürün sayısına göre</option></select></label></> : null}
      <span className={styles.resultCount} role="status">{visibleItems.length} / {items.length} {kind === "brand" ? "marka" : "kayıt"}</span>
      {search ? <button className={styles.button} type="button" onClick={() => setSearch("")}>Temizle</button> : null}
    </div> : null}
    {loading ? <div className={styles.state} role="status">{meta.title} yükleniyor…</div> : items.length === 0 ? error ? null : kind === "attribute" ? <PanelEmptyState title="Henüz nitelik yok" description="Renk veya beden ekleyerek başlayın; değerleri ürün varyantlarında seçebilirsiniz." action={canManage ? <Link className={styles.button} href="/products/attributes/new">İlk niteliği oluştur</Link> : undefined} /> : <PanelEmptyState title={`Henüz ${meta.singular} yok`} description="İlk gerçek kayıt oluşturulduğunda burada görünecek." /> : kind === "brand" ? visibleItems.length ? <div className={styles.brandList}>{visibleItems.map(brandCard)}</div> : <PanelEmptyState title="Eşleşen marka yok" description="Arama veya filtreyi değiştirin." action={<button className={styles.button} type="button" onClick={() => { setSearch(""); setBrandFilter("all"); }}>Filtreleri temizle</button>} /> : kind === "attribute" ? visibleItems.length ? <div className={styles.attributeList}>{visibleItems.map(attributeCard)}</div> : <PanelEmptyState title="Eşleşen nitelik yok" description="Başka bir ad veya değer arayın." /> : !visibleItems.length ? <PanelEmptyState title="Eşleşen kayıt yok" description="Aramanızı değiştirin veya temizleyin." /> : <div className={styles.list}>{visibleItems.map((resource) => <article className={styles.item} key={resource.id}><div><h2>{resource.name}</h2><p>/{resource.slug} · {resource.productCount} ürün</p>{resource.description ? <small>{resource.description}</small> : null}</div><div className={styles.actions}><span className={styles.status}>v{resource.version}</span>{kind === "extra" ? <Link className={styles.button} href={`/products/${route.segment}/${encodeURIComponent(resource.id)}/preview`}>Önizle</Link> : null}{canManage ? <><Link className={styles.button} href={`/products/${route.segment}/${encodeURIComponent(resource.id)}/edit`}>Düzenle</Link><button className={styles.danger} type="button" disabled={busy} onClick={() => void archive(resource)}>Arşivle</button></> : null}</div></article>)}</div>}
  </section></PanelPageShell>;
}
