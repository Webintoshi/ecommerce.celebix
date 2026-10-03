"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { parseCatalogSizeGuideConfig, type CatalogAdminResource, type CatalogCategory, type CatalogSizeGuideConfig } from "@celebix/saas-contracts";
import { MerchantContentBodyField } from "@/components/content/MerchantContentBodyField";
import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { catalogAdminApi, CatalogAdminApiError } from "@/lib/catalog-admin-ui/client";
import { catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import { attributeSlug } from "@/lib/catalog-onboarding-ui/attribute-resource";
import { CatalogSizeGuideContent } from "./CatalogSizeGuideContent";
import styles from "./extras.module.css";

export function CatalogSizeGuideEditor({ resourceId, canManage, initialResource }: { resourceId?: string; canManage: boolean; initialResource?: CatalogAdminResource }) {
  const router = useRouter();
  const [resource, setResource] = useState<CatalogAdminResource>();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [heading, setHeading] = useState("Ölçü rehberi");
  const [body, setBody] = useState("");
  const [bodyFormat, setBodyFormat] = useState<"legacy" | "normalized_html">("legacy");
  const [bodyValid, setBodyValid] = useState(true);
  const [categoryIds, setCategoryIds] = useState<readonly string[]>([]);
  const [includeDescendants, setIncludeDescendants] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [categories, setCategories] = useState<readonly CatalogCategory[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryState, setCategoryState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [versionConflict, setVersionConflict] = useState(false);
  const [latestResource, setLatestResource] = useState<CatalogAdminResource>();
  const [reviewing, setReviewing] = useState(false);
  const request = useRef(0);
  const operation = useRef<Readonly<{ fingerprint: string; id: string }>>(undefined);

  const loadCategories = useCallback(async () => {
    setCategoryState("loading");
    try { const loaded = await catalogOnboardingClient.listCategories(); setCategories(loaded.filter((category) => category.status === "active")); setCategoryState("ready"); }
    catch { setCategoryState("error"); }
  }, []);
  const load = useCallback(async () => {
    const sequence = ++request.current;
    setLoading(true); setError(""); setReady(false);
    try {
      const selected = initialResource ?? (resourceId ? await catalogAdminApi.resource("extra", resourceId) : undefined);
      const config = selected ? parseCatalogSizeGuideConfig(selected.config) : undefined;
      if (selected && (selected.kind !== "extra" || selected.id !== resourceId || selected.status !== "active")) throw new Error();
      if (request.current !== sequence) return;
      setResource(selected); setName(selected?.name ?? ""); setHeading(config?.heading ?? "Ölçü rehberi"); setBody(config?.body ?? ""); setBodyFormat("legacy"); setBodyValid(true);
      setCategoryIds(config?.categoryIds ?? []); setIncludeDescendants(config?.includeDescendants ?? true); setEnabled(config?.enabled ?? true);
      operation.current = undefined; setVersionConflict(false); setLatestResource(undefined); setReady(true);
    } catch (caught) { if (request.current === sequence) setError(caught instanceof CatalogAdminApiError ? caught.message : "Ölçü rehberi güvenle açılamadı."); }
    finally { if (request.current === sequence) setLoading(false); }
  }, [initialResource, resourceId]);
  useEffect(() => { if (canManage) { void load(); void loadCategories(); } else setLoading(false); return () => { request.current += 1; }; }, [canManage, load, loadCategories]);

  const activeIds = new Set(categories.map((category) => category.id));
  const missingIds = categoryState === "ready" ? categoryIds.filter((id) => !activeIds.has(id)) : [];
  const normalizedSearch = categorySearch.trim().toLocaleLowerCase("tr-TR");
  const visibleCategories = categories.filter((category) => !normalizedSearch || category.name.toLocaleLowerCase("tr-TR").includes(normalizedSearch));

  function toggleCategory(id: string, checked: boolean) {
    setCategoryIds((current) => checked ? current.includes(id) || current.length >= 64 ? current : [...current, id] : current.filter((categoryId) => categoryId !== id));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy || versionConflict || !ready || categoryState !== "ready") return;
    if (!name.trim() || !attributeSlug(name.trim())) { setError("Rehber adını girin."); return; }
    if (!heading.trim() || heading.trim().length > 120) { setError("Bağlantı başlığı 1–120 karakter olmalı."); return; }
    if (!bodyValid || !body.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() || body.length > 10000) { setError("Rehber içeriği boş olamaz ve biçimlendirmeyle birlikte 10.000 karakteri aşamaz."); return; }
    if (!categoryIds.length || missingIds.length) { setError(missingIds.length ? "Artık etkin olmayan kategori atamalarını kaldırın." : "En az bir kategori seçin."); return; }
    let config: CatalogSizeGuideConfig;
    try { config = parseCatalogSizeGuideConfig({ schemaVersion: 1, type: "size_guide", heading: heading.trim(), body, categoryIds, includeDescendants, enabled }); }
    catch { setError("Rehber bilgilerini ve kategori seçimlerini kontrol edin."); return; }
    const mutation = { ...(resource ? { resourceId: resource.id, expectedVersion: resource.version } : {}), ...(resource?.description ? { description: resource.description } : {}), name: name.trim(), slug: resource?.slug ?? attributeSlug(name.trim()), config, productIds: [] as readonly string[] };
    const fingerprint = JSON.stringify(mutation);
    if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, id: crypto.randomUUID() };
    const sequence = request.current;
    setBusy(true); setError("");
    try { await catalogAdminApi.saveResource("extra", mutation, operation.current.id); if (request.current === sequence) { router.push("/products/extras"); router.refresh(); } }
    catch (caught) {
      if (request.current !== sequence) return;
      if (caught instanceof CatalogAdminApiError && caught.code === "version_conflict") { setVersionConflict(true); setError("Rehber başka bir oturumda güncellendi. Taslağınız korunuyor; güncel sürümü inceleyin."); }
      else setError(caught instanceof CatalogAdminApiError ? caught.code === "slug_conflict" ? "Bu adla bir ekstra zaten var. Rehber için farklı bir ad girin." : `${caught.message} Değişiklikleriniz korunuyor.` : "Rehber kaydedilemedi. Değişiklikleriniz korunuyor; tekrar deneyin.");
    } finally { if (request.current === sequence) setBusy(false); }
  }

  async function reviewCurrentVersion() {
    if (!resourceId || reviewing) return;
    const sequence = request.current;
    setReviewing(true);
    try {
      const latest = await catalogAdminApi.resource("extra", resourceId);
      parseCatalogSizeGuideConfig(latest.config);
      if (latest.status !== "active") throw new Error();
      if (request.current === sequence) setLatestResource(latest);
    } catch { if (request.current === sequence) setError("Güncel rehber yüklenemedi. Taslağınız korunuyor; tekrar deneyin."); }
    finally { if (request.current === sequence) setReviewing(false); }
  }

  const title = resourceId ? "Ölçü rehberi düzenle" : "Yeni ölçü rehberi";
  return <PanelPageShell><PanelPageHeader title={title} /><h1 className={styles.srOnly}>{title}</h1><section className={styles.workspace}>
    {!canManage ? <p className={styles.error} role="alert">Bu katalog işlemi için yetkiniz yok.</p> : loading ? <div className={styles.loading} role="status">Ölçü rehberi yükleniyor…</div> : <>
      {error ? <div className={styles.error} role="alert"><p>{error}</p>{!ready ? <button className={styles.button} type="button" onClick={() => void load()}>Tekrar dene</button> : versionConflict ? <button className={styles.button} type="button" disabled={reviewing} onClick={() => void reviewCurrentVersion()}>{reviewing ? "Yükleniyor…" : "Güncel sürümü incele"}</button> : null}</div> : null}
      {versionConflict && latestResource ? <section className={styles.conflictReview} aria-label="Güncel rehber sürümü"><h2>Güncel sürüm · v{latestResource.version}</h2><p>{latestResource.name} · {String(latestResource.config.heading)}</p><div className={styles.previewBody}><CatalogSizeGuideContent body={String(latestResource.config.body)} /></div><p>Taslağınız bu içeriğin yerine kaydedilecek. Devam ettikten sonra Uygula ile kaydedin.</p><button className={styles.button} type="button" onClick={() => { setResource(latestResource); setVersionConflict(false); setLatestResource(undefined); operation.current = undefined; setError(""); }}>Bu taslakla devam et</button></section> : null}
      {ready ? <form className={styles.form} onSubmit={submit}>
        <fieldset className={styles.formSection} disabled={busy}><legend>Rehber bilgileri</legend><div className={styles.fieldGrid}>
          <label>Rehber adı<input name="name" required maxLength={120} value={name} onChange={(event) => setName(event.currentTarget.value)} /><small>Panelde görünen ad.</small></label>
          <label>Bağlantı başlığı<input name="heading" required maxLength={120} value={heading} onChange={(event) => setHeading(event.currentTarget.value)} /><small>Ürün sayfasında müşterinin göreceği başlık.</small></label>
        </div></fieldset>
        <section className={styles.formSection} aria-labelledby="size-guide-body-label"><h2 id="size-guide-body-label">Rehber içeriği</h2><p className={styles.help}>Biçimlendirme dahil en fazla 10.000 karakter.</p>
          <div className={styles.bodyEditor}><MerchantContentBodyField value={body} bodyFormat={bodyFormat} readOnly={busy} hideCounter onChange={(next, format, valid) => { setBody(next); setBodyFormat(format); setBodyValid(valid); }} /></div>
          <output className={body.length > 10000 ? styles.invalidCount : styles.muted} aria-live="polite">{body.length.toLocaleString("tr-TR")} / 10.000 karakter</output>
        </section>
        <fieldset className={styles.formSection} disabled={busy}><legend>Kategoriler <span className={styles.muted}>{categoryIds.length} seçili</span></legend>
          {categoryState === "loading" ? <p className={styles.muted} role="status">Kategoriler yükleniyor…</p> : categoryState === "error" ? <div className={styles.error} role="alert">Kategoriler yüklenemedi. Seçimleriniz korunuyor. <button className={styles.button} type="button" onClick={() => void loadCategories()}>Tekrar dene</button></div> : !categories.length ? <p className={styles.help}>Etkin kategori yok. <Link href="/products/categories">Kategori oluşturun</Link>.</p> : <>
            <label className={styles.categorySearch}>Kategori ara<input type="search" value={categorySearch} onChange={(event) => setCategorySearch(event.currentTarget.value)} placeholder="Kategori adı" /></label>
            <div className={styles.categoryList}>{visibleCategories.length ? visibleCategories.map((category) => <label className={styles.category} key={category.id}><input type="checkbox" value={category.id} checked={categoryIds.includes(category.id)} disabled={!categoryIds.includes(category.id) && categoryIds.length >= 64} onChange={(event) => toggleCategory(category.id, event.currentTarget.checked)} /><span>{category.name}{category.depth > 1 ? <small>Alt kategori</small> : null}</span></label>) : <p className={styles.help}>Eşleşen kategori yok.</p>}</div>
          </>}
          {missingIds.length ? <div className={styles.missingCategories}><p className={styles.help}>Artık etkin olmayan kategori atamaları:</p>{missingIds.map((id) => <label className={styles.category} key={id}><input type="checkbox" value={id} checked onChange={() => toggleCategory(id, false)} /><span>Kategori artık etkin değil<small>Kaydetmek için bu atamayı kaldırın.</small></span></label>)}</div> : null}
          <label className={styles.toggle}><span>Alt kategorileri dahil et</span><input name="includeDescendants" type="checkbox" checked={includeDescendants} onChange={(event) => setIncludeDescendants(event.currentTarget.checked)} /></label>
        </fieldset>
        <label className={styles.toggle}><span>Mağazada göster<small>Seçilen kategorilerin ürünlerinde görünür.</small></span><input name="enabled" type="checkbox" checked={enabled} disabled={busy} onChange={(event) => setEnabled(event.currentTarget.checked)} /></label>
        <div className={styles.formActions}><Link className={styles.button} href="/products/extras">Vazgeç</Link><button className={styles.primary} type="submit" disabled={busy || versionConflict || categoryState !== "ready"}>{busy ? "Uygulanıyor…" : "Uygula"}</button></div>
      </form> : null}
    </>}
  </section></PanelPageShell>;
}
