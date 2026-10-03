"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseCatalogSizeGuideConfig, type CatalogAdminResource, type CatalogSizeGuideConfig } from "@celebix/saas-contracts";
import { ProductSizeGuideDialog } from "@celebix/storefront-design-ui";
import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { catalogAdminApi, CatalogAdminApiError } from "@/lib/catalog-admin-ui/client";
import { catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import { CatalogSizeGuideContent } from "./CatalogSizeGuideContent";
import styles from "./extras.module.css";

export function CatalogSizeGuidePreview({ resourceId, initialResource }: { resourceId: string; initialResource?: CatalogAdminResource }) {
  const [resource, setResource] = useState<CatalogAdminResource>();
  const [config, setConfig] = useState<CatalogSizeGuideConfig>();
  const [categoryNames, setCategoryNames] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++request.current;
    setLoading(true); setError(""); setResource(undefined); setConfig(undefined);
    try {
      const selected = initialResource ?? await catalogAdminApi.resource("extra", resourceId);
      const guide = parseCatalogSizeGuideConfig(selected.config);
      if (request.current !== sequence) return;
      setResource(selected); setConfig(guide);
      try { const categories = await catalogOnboardingClient.listCategories(); if (request.current === sequence) setCategoryNames(guide.categoryIds.map((id) => categories.find((category) => category.id === id)?.name ?? "Kategori artık etkin değil")); }
      catch { if (request.current === sequence) setCategoryNames(["Kategori adları okunamıyor"]); }
    } catch (caught) { if (request.current === sequence) setError(caught instanceof CatalogAdminApiError ? caught.message : "Ölçü rehberi güvenle açılamadı."); }
    finally { if (request.current === sequence) setLoading(false); }
  }, [initialResource, resourceId]);
  useEffect(() => { void load(); return () => { request.current += 1; }; }, [load]);
  return <PanelPageShell><PanelPageHeader title="Ölçü rehberi önizlemesi" /><h1 className={styles.srOnly}>Ölçü rehberi önizlemesi</h1><section className={styles.workspace}>
    {loading ? <div className={styles.loading} role="status">Ölçü rehberi yükleniyor…</div> : error ? <p className={styles.error} role="alert">{error} <button className={styles.button} type="button" onClick={() => void load()}>Tekrar dene</button></p> : config && resource ? <article className={styles.preview}>
      <div className={styles.previewMeta}><span>{resource.name}</span><span>{config.enabled && resource.status === "active" ? "Gösterim açık" : "Gösterim kapalı"}</span></div><p className={styles.help}>{categoryNames.join(", ")}{config.includeDescendants ? " · Alt kategoriler dahil" : ""}</p><div><ProductSizeGuideDialog heading={config.heading}><CatalogSizeGuideContent body={config.body} /></ProductSizeGuideDialog></div>
    </article> : null}
    <Link className={styles.backLink} href="/products/extras">Ekstralara dön</Link>
  </section></PanelPageShell>;
}
