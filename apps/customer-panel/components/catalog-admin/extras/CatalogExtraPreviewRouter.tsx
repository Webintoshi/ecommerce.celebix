"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogAdminResource } from "@celebix/saas-contracts";
import { CatalogExtraPreview } from "@/components/catalog-admin/CatalogExtraPreview";
import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { catalogAdminApi, CatalogAdminApiError } from "@/lib/catalog-admin-ui/client";
import { CatalogSizeGuidePreview } from "./CatalogSizeGuidePreview";
import { catalogExtraType } from "./registry";
import styles from "./extras.module.css";

export function CatalogExtraPreviewRouter({ resourceId }: { resourceId: string }) {
  const [resource, setResource] = useState<CatalogAdminResource>();
  const [error, setError] = useState("");
  const request = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++request.current;
    setResource(undefined); setError("");
    try { const selected = await catalogAdminApi.resource("extra", resourceId); if (request.current === sequence) setResource(selected); }
    catch (caught) { if (request.current === sequence) setError(caught instanceof CatalogAdminApiError ? caught.message : "Ekstra yüklenemedi."); }
  }, [resourceId]);
  useEffect(() => { void load(); return () => { request.current += 1; }; }, [load]);
  if (resource) return catalogExtraType(resource) === "size_guide" ? <CatalogSizeGuidePreview resourceId={resourceId} initialResource={resource} /> : <CatalogExtraPreview resourceId={resourceId} />;
  return <PanelPageShell><PanelPageHeader title="Ekstra önizlemesi" /><h1 className={styles.srOnly}>Ekstra önizlemesi</h1>{error ? <p className={styles.error} role="alert">{error} <button className={styles.button} type="button" onClick={() => void load()}>Tekrar dene</button></p> : <div className={styles.loading} role="status">Ekstra yükleniyor…</div>}</PanelPageShell>;
}
