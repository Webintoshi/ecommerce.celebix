"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { parseStorefrontAsset, type CatalogAdminResource, type CatalogAdminResourceKind, type StorefrontAsset } from "@celebix/saas-contracts";
import { ImageOff, Search } from "lucide-react";

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

export function CatalogResourceConsole({ kind, canManage }: { kind: CatalogAdminResourceKind; canManage: boolean }) {
  const route = getCatalogResourceRouteDefinitionForKind(kind);
  const meta = META[kind];
  const [items, setItems] = useState<readonly CatalogAdminResource[]>([]);
  const [brandProducts, setBrandProducts] = useState<readonly BrandProductDirectoryEntry[]>([]);
  const [brandLogos, setBrandLogos] = useState<readonly StorefrontAsset[]>([]);
  const [search, setSearch] = useState("");
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
        setItems(resources);
        setBrandProducts(directory);
        setBrandLogos(Object.freeze(assetBody.assets.map(parseStorefrontAsset).filter((asset) => asset.kind === "logo" && asset.status === "active")));
      } else {
        setItems(await catalogAdminApi.resources(kind));
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
    setBusy(true);
    setError("");
    try {
      await catalogAdminApi.archiveResource(kind, resource.id, resource.version);
      await load();
    } catch (caught) {
      setError(caught instanceof CatalogAdminApiError ? caught.message : "Kayıt arşivlenemedi.");
    } finally {
      setBusy(false);
    }
  }

  const productById = new Map(brandProducts.map((product) => [product.id, product]));
  const logoById = new Map(brandLogos.map((asset) => [asset.id, asset]));
  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR");
  const visibleItems = kind !== "brand" || !normalizedSearch ? items : items.filter((resource) => resource.name.toLocaleLowerCase("tr-TR").includes(normalizedSearch) || resource.productIds.some((id) => productById.get(id)?.title.toLocaleLowerCase("tr-TR").includes(normalizedSearch)));

  function brandCard(resource: CatalogAdminResource) {
    const logo = logoById.get(brandLogoAssetId(resource.config) ?? "");
    const linkedProducts = resource.productIds.map((id) => productById.get(id)).filter((product): product is BrandProductDirectoryEntry => product !== undefined);
    return <article className={styles.brandCard} key={resource.id}>
      <div className={styles.brandCardLogo}>{logo ? <>{/* eslint-disable-next-line @next/next/no-img-element -- tenant R2 URLs are runtime data */}<img src={logo.publicUrl} alt={logo.altText || `${resource.name} logosu`} /></> : <span aria-label="Marka görseli yok">{resource.name[0]?.toLocaleUpperCase("tr-TR") || <ImageOff aria-hidden="true" />}</span>}</div>
      <div className={styles.brandCardBody}>
        <div className={styles.brandCardTitle}><div><h2>{resource.name}</h2><p>/{resource.slug}</p></div><span>{resource.productCount.toLocaleString("tr-TR")} ürün</span></div>
        {resource.description ? <p className={styles.brandDescription}>{resource.description}</p> : null}
        <div className={styles.brandProducts}><strong>Bağlı ürünler</strong>{linkedProducts.length ? <ul>{linkedProducts.slice(0, 4).map((product) => <li key={product.id}><span>{product.title}</span>{product.representativeSku ? <small>{product.representativeSku}</small> : null}</li>)}</ul> : <p>Bağlı ürün adı bulunamadı.</p>}{resource.productCount > 4 ? <small>+{(resource.productCount - 4).toLocaleString("tr-TR")} ürün daha</small> : null}</div>
      </div>
      <div className={styles.brandCardActions}><span className={styles.status}>v{resource.version}</span>{canManage ? <><Link className={styles.button} href={`/products/${route.segment}/${encodeURIComponent(resource.id)}/edit`}>Düzenle</Link><button className={styles.danger} disabled={busy} onClick={() => void archive(resource)}>Arşivle</button></> : null}</div>
    </article>;
  }

  return <PanelPageShell><PanelPageHeader title={meta.title} description={meta.description} actions={canManage ? <Link className={styles.primary} href={`/products/${route.segment}/new`}>Yeni {meta.singular}</Link> : undefined} /><section className={styles.surface}>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {!loading && kind === "brand" && items.length ? <label className={styles.brandSearch}><Search aria-hidden="true" /><span className={styles.srOnly}>Marka veya bağlı ürün ara</span><input type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Marka veya bağlı ürün ara" /></label> : null}
    {loading ? <div className={styles.state} role="status">{meta.title} yükleniyor…</div> : items.length === 0 ? <PanelEmptyState title={`Henüz ${meta.singular} yok`} description="İlk gerçek kayıt oluşturulduğunda burada görünecek." /> : kind === "brand" ? visibleItems.length ? <div className={styles.brandList}>{visibleItems.map(brandCard)}</div> : <PanelEmptyState title="Eşleşen marka yok" description="Arama ifadenizi değiştirip yeniden deneyin." /> : <div className={styles.list}>{items.map((resource) => <article className={styles.item} key={resource.id}><div><h2>{resource.name}</h2><p>/{resource.slug} · {resource.productCount} ürün</p>{resource.description ? <small>{resource.description}</small> : null}</div><div className={styles.actions}><span className={styles.status}>v{resource.version}</span>{kind === "extra" ? <Link className={styles.button} href={`/products/${route.segment}/${encodeURIComponent(resource.id)}/preview`}>Önizle</Link> : null}{canManage ? <><Link className={styles.button} href={`/products/${route.segment}/${encodeURIComponent(resource.id)}/edit`}>Düzenle</Link><button className={styles.danger} disabled={busy} onClick={() => void archive(resource)}>Arşivle</button></> : null}</div></article>)}</div>}
  </section></PanelPageShell>;
}
