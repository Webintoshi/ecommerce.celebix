"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatalogAdminResource } from "@celebix/saas-contracts";

import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { catalogAdminApi, CatalogAdminApiError } from "@/lib/catalog-admin-ui/client";
import { formatTurkishMoney } from "@/lib/catalog-ui/money";
import styles from "./catalog-admin-console.module.css";

function formatTry(priceAdjustmentCents: number) {
  return formatTurkishMoney(priceAdjustmentCents, "TRY");
}

function optionsFor(resource: CatalogAdminResource) {
  const options = resource.config.options;
  return Array.isArray(options) ? options.filter((option): option is string => typeof option === "string") : [];
}

function priceFor(resource: CatalogAdminResource) {
  const price = resource.config.priceAdjustmentCents;
  return typeof price === "number" && Number.isSafeInteger(price) && price >= 0 ? price : 0;
}

export function CatalogExtraPreview({ resourceId }: { resourceId: string }) {
  const [resource, setResource] = useState<CatalogAdminResource>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResource(await catalogAdminApi.resource("extra", resourceId));
    } catch (caught) {
      setError(caught instanceof CatalogAdminApiError ? caught.message : "Ekstra önizlemesi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [resourceId]);
  useEffect(() => { void load(); }, [load]);

  const options = resource ? optionsFor(resource) : [];
  const priceAdjustmentCents = resource ? priceFor(resource) : 0;
  return <PanelPageShell><PanelPageHeader title="Ekstra önizlemesi" description="Müşteri tarafında görünen seçenekleri güvenli biçimde kontrol edin." /><section className={styles.surface}>
    {loading ? <p className={styles.state} role="status">Ekstra yükleniyor…</p> : null}
    {!loading && error ? <p className={styles.error} role="alert">{error}</p> : null}
    {!loading && resource ? <article className={styles.preview}><h2>{resource.name}</h2>{resource.description ? <p>{resource.description}</p> : null}<h3>Seçenekler</h3><ul>{options.map((option, index) => <li key={`${option}-${index}`}>{option}</li>)}</ul><p>Fiyat farkı <output>{formatTry(priceAdjustmentCents)}</output></p></article> : null}
  </section></PanelPageShell>;
}
