"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogAdminResource, CatalogAdminResourceKind, StorefrontAsset } from "@celebix/saas-contracts";

import { PanelEmptyState, PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { CatalogAdminApiError, catalogAdminApi } from "@/lib/catalog-admin-ui/client";
import { selectBrandLogoAssets } from "@/lib/catalog-admin-ui/brand-logo";
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
  const [brandLogos, setBrandLogos] = useState<readonly StorefrontAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [logoWarning, setLogoWarning] = useState("");
  const requestSequence = useRef(0);
  const logoRequestController = useRef<AbortController | undefined>(undefined);

  const load = useCallback(async () => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    logoRequestController.current?.abort();
    logoRequestController.current = undefined;
    setLoading(true);
    setError("");
    setLogoWarning("");
    try {
      const resources = await catalogAdminApi.resources(kind);
      if (requestSequence.current !== sequence) return;
      setItems(resources);
      if (kind === "brand") {
        const controller = new AbortController();
        logoRequestController.current = controller;
        void (async () => {
          try {
            const response = await fetch("/api/storefront-assets", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
            if (!response.ok) throw new CatalogAdminApiError("unavailable", response.status);
            const logos = selectBrandLogoAssets(await response.json()).assets;
            if (requestSequence.current !== sequence || controller.signal.aborted) return;
            setBrandLogos(logos);
          } catch {
            if (requestSequence.current === sequence && !controller.signal.aborted) {
              setBrandLogos([]);
              setLogoWarning("Logo arşivi şu anda yüklenemedi; markaları yine de yönetebilirsiniz.");
            }
          } finally {
            if (logoRequestController.current === controller) logoRequestController.current = undefined;
          }
        })();
      } else {
        setBrandLogos([]);
      }
    } catch (caught) {
      if (requestSequence.current === sequence) setError(caught instanceof CatalogAdminApiError ? caught.message : `${meta.title} yüklenemedi.`);
    } finally {
      if (requestSequence.current === sequence) setLoading(false);
    }
  }, [kind, meta.title]);

  useEffect(() => { void load(); return () => { logoRequestController.current?.abort(); requestSequence.current += 1; }; }, [load]);

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

  function brandLogoFor(resource: CatalogAdminResource) {
    const selectedId = typeof resource.config.logoAssetId === "string" ? resource.config.logoAssetId : undefined;
    return brandLogos.find(({ id }) => id === selectedId);
  }

  return <PanelPageShell><PanelPageHeader title={meta.title} description={meta.description} actions={canManage ? <Link className={styles.primary} href={`/products/${route.segment}/new`}>Yeni {meta.singular}</Link> : undefined} /><section className={styles.surface}>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {logoWarning ? <p className={styles.state} role="status">{logoWarning}</p> : null}
    {loading ? <div className={styles.state} role="status">{meta.title} yükleniyor…</div> : items.length === 0 ? <PanelEmptyState title={`Henüz ${meta.singular} yok`} description="İlk gerçek kayıt oluşturulduğunda burada görünecek." /> : <div className={styles.list}>{items.map((resource) => { const logo = kind === "brand" ? brandLogoFor(resource) : undefined; return <article className={styles.item} key={resource.id}><div className={styles.resourceIdentity}>{logo ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img className={styles.brandLogoThumbnail} src={logo.publicUrl} alt={`${resource.name} logosu`} width={logo.width} height={logo.height} /></> : null}<div><h2>{resource.name}</h2><p>/{resource.slug} · {resource.productCount} ürün</p>{resource.description ? <small>{resource.description}</small> : null}</div></div><div className={styles.actions}><span className={styles.status}>v{resource.version}</span>{kind === "extra" ? <Link className={styles.button} href={`/products/${route.segment}/${encodeURIComponent(resource.id)}/preview`}>Önizle</Link> : null}{canManage ? <><Link className={styles.button} href={`/products/${route.segment}/${encodeURIComponent(resource.id)}/edit`}>Düzenle</Link><button className={styles.danger} disabled={busy} onClick={() => void archive(resource)}>Arşivle</button></> : null}</div></article>; })}</div>}
  </section></PanelPageShell>;
}
