"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Product, ProductVariant } from "@celebix/saas-contracts";

import {
  CatalogApiError,
  catalogApi,
  type ProductDetailResult,
} from "@/lib/catalog-ui/client";
import { buildProductUpdatePayload, buildVariantPayload } from "@/lib/catalog-ui/forms";
import { formatTurkishMoney, formatTurkishMoneyInput } from "@/lib/catalog-ui/money";

function value(data: FormData, key: string) {
  const candidate = data.get(key);
  return typeof candidate === "string" ? candidate : "";
}

function variantValues(data: FormData) {
  return {
    title: value(data, "title"),
    sku: value(data, "sku"),
    barcode: value(data, "barcode"),
    price: value(data, "price"),
    compareAt: value(data, "compareAt"),
    cost: value(data, "cost"),
    stockTracking: data.get("stockTracking") === "on",
    stockQuantity: value(data, "stockQuantity"),
  };
}

function safeMessage(error: unknown) {
  return error instanceof CatalogApiError ? error.message : "İşlem tamamlanamadı. Lütfen yeniden deneyin.";
}

function VariantFields({ variant }: { variant?: ProductVariant }) {
  return (
    <div className="form-grid compact-form-grid">
      <label className="field field-wide"><span>Varyant adı <b>*</b></span><input name="title" required maxLength={200} defaultValue={variant?.title ?? ""} /></label>
      <label className="field"><span>SKU</span><input name="sku" maxLength={64} pattern="[A-Z0-9][A-Z0-9._-]{0,63}" defaultValue={variant?.sku ?? ""} /></label>
      <label className="field"><span>Barkod</span><input name="barcode" maxLength={128} defaultValue={variant?.barcode ?? ""} /></label>
      <label className="field"><span>Satış fiyatı <b>*</b></span><div className="money-input"><input name="price" required inputMode="decimal" defaultValue={variant ? formatTurkishMoneyInput(variant.priceCents) : ""} /><span>₺</span></div></label>
      <label className="field"><span>Karşılaştırma fiyatı</span><div className="money-input"><input name="compareAt" inputMode="decimal" defaultValue={variant?.compareAtCents === undefined ? "" : formatTurkishMoneyInput(variant.compareAtCents)} /><span>₺</span></div></label>
      <label className="field"><span>Maliyet</span><div className="money-input"><input name="cost" inputMode="decimal" defaultValue={variant?.costCents === undefined ? "" : formatTurkishMoneyInput(variant.costCents)} /><span>₺</span></div></label>
      <label className="field"><span>Stok adedi <b>*</b></span><input name="stockQuantity" required inputMode="numeric" pattern="(?:0|[1-9][0-9]*)" defaultValue={String(variant?.stockQuantity ?? 0)} /></label>
      <label className="check-field field-wide"><input name="stockTracking" type="checkbox" defaultChecked={variant?.stockTracking ?? true} /><span><strong>Stok takibi açık</strong><small>Mevcut stok adedini satışlarla birlikte izleyin.</small></span></label>
    </div>
  );
}

export function ProductDetailConsole({ productId }: { productId: string }) {
  const [detail, setDetail] = useState<ProductDetailResult>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingProduct, setEditingProduct] = useState(false);
  const [creatingVariant, setCreatingVariant] = useState(false);
  const [editingVariant, setEditingVariant] = useState<string>();
  const [archiveVariant, setArchiveVariant] = useState<ProductVariant>();
  const [archiveProduct, setArchiveProduct] = useState(false);

  const load = useCallback(async (conflict = false) => {
    setError("");
    try {
      const current = await catalogApi.getProduct(productId);
      setDetail(current);
      if (conflict) setNotice("Başka bir güncelleme algılandı. En güncel veriler yeniden yüklendi; değişiklikleriniz gönderilmedi.");
    } catch (failure) {
      setError(safeMessage(failure));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  async function mutation(name: string, action: () => Promise<void>) {
    setBusy(name);
    setError("");
    setNotice("");
    try { await action(); }
    catch (failure) {
      if (failure instanceof CatalogApiError && failure.code === "version_conflict") {
        await load(true);
        setEditingProduct(false);
        setEditingVariant(undefined);
        setArchiveVariant(undefined);
        setArchiveProduct(false);
      } else setError(safeMessage(failure));
    } finally { setBusy(""); }
  }

  async function updateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (detail === undefined) return;
    const data = new FormData(event.currentTarget);
    const parsed = buildProductUpdatePayload({
      title: value(data, "title"), slug: value(data, "slug"), description: value(data, "description"),
      status: value(data, "status"), currency: value(data, "currency"),
    }, detail.product.version);
    if (!parsed.ok) { setError(parsed.message); return; }
    await mutation("product", async () => {
      const result = await catalogApi.updateProduct(productId, parsed.value);
      setDetail((current) => current && Object.freeze({ ...current, product: result.product }));
      setEditingProduct(false);
      setNotice("Ürün bilgileri güncellendi.");
    });
  }

  async function createVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = buildVariantPayload(variantValues(new FormData(event.currentTarget)));
    if (!parsed.ok) { setError(parsed.message); return; }
    await mutation("new-variant", async () => {
      const result = await catalogApi.createVariant(productId, parsed.value);
      setDetail((current) => current && Object.freeze({ ...current, variants: Object.freeze([...current.variants, result.variant]) }));
      setCreatingVariant(false);
      setNotice("Yeni varyant oluşturuldu.");
    });
  }

  async function updateVariant(event: FormEvent<HTMLFormElement>, variant: ProductVariant) {
    event.preventDefault();
    const parsed = buildVariantPayload(variantValues(new FormData(event.currentTarget)), variant.version);
    if (!parsed.ok) { setError(parsed.message); return; }
    await mutation(`variant-${variant.id}`, async () => {
      const result = await catalogApi.updateVariant(productId, variant.id, parsed.value);
      setDetail((current) => current && Object.freeze({
        ...current,
        variants: Object.freeze(current.variants.map((item) => item.id === variant.id ? result.variant : item)),
      }));
      setEditingVariant(undefined);
      setNotice("Varyant güncellendi.");
    });
  }

  async function confirmVariantArchive() {
    if (archiveVariant === undefined) return;
    await mutation(`archive-${archiveVariant.id}`, async () => {
      await catalogApi.archiveVariant(productId, archiveVariant.id, archiveVariant.version);
      setDetail((current) => current && Object.freeze({
        ...current,
        variants: Object.freeze(current.variants.filter((item) => item.id !== archiveVariant.id)),
      }));
      setArchiveVariant(undefined);
      setNotice("Varyant arşivlendi ve aktif listeden kaldırıldı.");
    });
  }

  async function confirmProductArchive() {
    if (detail === undefined) return;
    await mutation("archive-product", async () => {
      await catalogApi.archiveProduct(productId, detail.product.version);
      location.assign("/products");
    });
  }

  if (loading) return <div className="catalog-loading page-loading" role="status"><span className="spinner" aria-hidden="true" /> Ürün ayrıntıları yükleniyor…</div>;
  if (detail === undefined) return <section className="catalog-page"><div className="feedback feedback-error" role="alert"><div><strong>Ürün açılamadı</strong><p>{error || "Ürün bulunamadı."}</p></div><button className="button button-secondary" type="button" onClick={() => { setLoading(true); void load(); }}>Tekrar dene</button></div></section>;

  const { product, variants } = detail;
  return (
    <section className="catalog-page" aria-labelledby="product-title">
      <Link className="back-link" href="/products">← Ürünlere dön</Link>
      <div className="detail-heading-row">
        <div className="catalog-heading">
          <div className="heading-meta"><span className={`status-pill status-${product.status}`}>{product.status === "active" ? "Aktif" : "Taslak"}</span><span className="version-badge">v{product.version}</span></div>
          <h1 id="product-title">{product.title}</h1>
          <p>/{product.slug} · {product.currency}</p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" type="button" onClick={() => setEditingProduct((current) => !current)}>Ürünü düzenle</button>
          <button className="button button-quiet-danger" type="button" onClick={() => setArchiveProduct(true)}>Arşivle</button>
        </div>
      </div>

      {error ? <div className="feedback feedback-error" role="alert"><div><strong>İşlem tamamlanamadı</strong><p>{error}</p></div></div> : null}
      {notice ? <div className="feedback feedback-success" role="status"><div><strong>Bilgi</strong><p>{notice}</p></div></div> : null}

      {editingProduct ? (
        <form className="catalog-form inset-form" onSubmit={updateProduct} key={product.version}>
          <fieldset disabled={busy !== ""}>
            <legend><span>01</span><span><strong>Ürün bilgilerini düzenle</strong><small>Güncel sürüm: v{product.version}</small></span></legend>
            <div className="form-grid">
              <label className="field field-wide"><span>Ürün adı <b>*</b></span><input name="title" required maxLength={200} defaultValue={product.title} /></label>
              <label className="field"><span>URL anahtarı <b>*</b></span><input name="slug" required minLength={3} maxLength={100} defaultValue={product.slug} /></label>
              <label className="field"><span>Durum <b>*</b></span><select name="status" defaultValue={product.status}><option value="draft">Taslak</option><option value="active">Aktif</option></select></label>
              <label className="field"><span>Para birimi</span><select name="currency" defaultValue={product.currency}><option value="TRY">TRY — Türk lirası</option></select></label>
              <label className="field field-wide"><span>Açıklama</span><textarea name="description" maxLength={10_000} rows={4} defaultValue={product.description ?? ""} /></label>
            </div>
          </fieldset>
          <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => setEditingProduct(false)}>Vazgeç</button><button className="button button-primary" type="submit" disabled={busy !== ""}>{busy === "product" ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></div>
        </form>
      ) : (
        <div className="product-summary-grid">
          <article><span>Açıklama</span><p>{product.description ?? "Bu ürün için açıklama eklenmemiş."}</p></article>
          <article><span>Son güncelleme</span><strong>{new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short" }).format(new Date(product.updatedAt))}</strong></article>
        </div>
      )}

      <div className="section-heading-row">
        <div><span className="eyebrow">SATIŞ SEÇENEKLERİ</span><h2>Varyantlar</h2><p>SKU, fiyat ve stok bilgilerini ayrı ayrı yönetin.</p></div>
        <button className="button button-primary" type="button" onClick={() => setCreatingVariant(true)} disabled={creatingVariant}>＋ Yeni varyant</button>
      </div>

      {creatingVariant ? (
        <form className="catalog-form inset-form" onSubmit={createVariant}>
          <fieldset disabled={busy !== ""}><legend><span>＋</span><span><strong>Yeni varyant</strong><small>Ürüne yeni bir satış seçeneği ekleyin</small></span></legend><VariantFields /></fieldset>
          <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => setCreatingVariant(false)}>Vazgeç</button><button className="button button-primary" type="submit" disabled={busy !== ""}>{busy === "new-variant" ? "Oluşturuluyor…" : "Varyantı oluştur"}</button></div>
        </form>
      ) : null}

      <div className="variant-list">
        {variants.length === 0 ? <div className="empty-variants"><strong>Aktif varyant yok</strong><p>Ürünü satışa hazırlamak için bir varyant ekleyin.</p></div> : variants.map((variant) => (
          <article className="variant-card" key={variant.id}>
            <div className="variant-card-heading">
              <div><span className="variant-mark" aria-hidden="true">V</span><span><strong>{variant.title}</strong><small>{variant.sku ? `SKU ${variant.sku}` : "SKU eklenmemiş"}{variant.barcode ? ` · ${variant.barcode}` : ""}</small></span></div>
              <span className="version-badge">v{variant.version}</span>
            </div>
            {editingVariant === variant.id ? (
              <form onSubmit={(event) => void updateVariant(event, variant)} key={variant.version}>
                <fieldset disabled={busy !== ""}><VariantFields variant={variant} /></fieldset>
                <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => setEditingVariant(undefined)}>Vazgeç</button><button className="button button-primary" type="submit" disabled={busy !== ""}>{busy === `variant-${variant.id}` ? "Kaydediliyor…" : "Varyantı kaydet"}</button></div>
              </form>
            ) : (
              <>
                <div className="variant-metrics">
                  <span><small>Satış fiyatı</small><strong>{formatTurkishMoney(variant.priceCents, product.currency)}</strong></span>
                  <span><small>Karşılaştırma</small><strong>{variant.compareAtCents === undefined ? "—" : formatTurkishMoney(variant.compareAtCents, product.currency)}</strong></span>
                  <span><small>Stok</small><strong>{variant.stockTracking ? `${variant.stockQuantity} adet` : "Takip dışı"}</strong></span>
                </div>
                <div className="variant-actions"><button className="button button-secondary" type="button" onClick={() => setEditingVariant(variant.id)}>Düzenle</button><button className="text-danger-button" type="button" onClick={() => setArchiveVariant(variant)}>Arşivle</button></div>
              </>
            )}
          </article>
        ))}
      </div>

      {archiveVariant ? <div className="inline-confirmation" role="alertdialog" aria-labelledby="archive-variant-title"><div><strong id="archive-variant-title">Varyantı arşivlemeyi onayla</strong><p><b>{archiveVariant.title}</b> aktif varyantlardan kaldırılacak.</p></div><div className="confirmation-actions"><button className="button button-secondary" type="button" onClick={() => setArchiveVariant(undefined)} disabled={busy !== ""}>Vazgeç</button><button className="button button-danger" type="button" onClick={() => void confirmVariantArchive()} disabled={busy !== ""}>Varyantı arşivle</button></div></div> : null}
      {archiveProduct ? <div className="inline-confirmation" role="alertdialog" aria-labelledby="archive-product-title"><div><strong id="archive-product-title">Ürünü arşivlemeyi onayla</strong><p><b>{product.title}</b> varsayılan listeden kaldırılacak. Bu işlem v{product.version} üzerinden yapılacak.</p></div><div className="confirmation-actions"><button className="button button-secondary" type="button" onClick={() => setArchiveProduct(false)} disabled={busy !== ""}>Vazgeç</button><button className="button button-danger" type="button" onClick={() => void confirmProductArchive()} disabled={busy !== ""}>{busy === "archive-product" ? "Arşivleniyor…" : "Ürünü arşivle"}</button></div></div> : null}
    </section>
  );
}
