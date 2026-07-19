"use client";

import Link from "next/link";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";

import { CatalogApiError, catalogApi } from "@/lib/catalog-ui/client";
import { buildCreateProductPayload } from "@/lib/catalog-ui/forms";
import { ProductMediaApiError, productMediaApi } from "@/lib/catalog-ui/media-client";

function value(data: FormData, key: string) {
  const candidate = data.get(key);
  return typeof candidate === "string" ? candidate : "";
}

export function ProductCreateForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [image, setImage] = useState<File>();
  const [imagePreview, setImagePreview] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [createdProductId, setCreatedProductId] = useState("");

  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setError(""); setUploadProgress(0);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    if (file === undefined) { setImage(undefined); setImagePreview(""); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 5_242_880) {
      event.currentTarget.value = ""; setImage(undefined); setImagePreview("");
      setError("PNG, JPEG veya WebP biçiminde ve en fazla 5 MB bir görsel seçin."); return;
    }
    setImage(file); setImagePreview(URL.createObjectURL(file));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const parsed = buildCreateProductPayload({
      title: value(data, "title"),
      slug: value(data, "slug"),
      description: value(data, "description"),
      status: value(data, "status"),
      currency: value(data, "currency"),
      variantTitle: value(data, "variantTitle"),
      sku: value(data, "sku"),
      barcode: value(data, "barcode"),
      price: value(data, "price"),
      compareAt: value(data, "compareAt"),
      cost: value(data, "cost"),
      stockTracking: data.get("stockTracking") === "on",
      stockQuantity: value(data, "stockQuantity"),
    });
    if (!parsed.ok) { setError(parsed.message); return; }
    setSubmitting(true);
    try {
      const result = await catalogApi.createProduct(parsed.value);
      setCreatedProductId(result.product.id);
      if (image !== undefined) {
        const altText = value(data, "imageAltText");
        await productMediaApi.upload(result.product.id, { file: image, altText, onProgress: setUploadProgress });
      }
      location.assign(`/products/${result.product.id}`);
    } catch (failure) {
      setError(failure instanceof CatalogApiError || failure instanceof ProductMediaApiError ? failure.message : "Ürün oluşturulamadı. Lütfen yeniden deneyin.");
      setSubmitting(false);
    }
  }

  return (
    <section className="catalog-page narrow-catalog-page" aria-labelledby="create-title">
      <Link className="back-link" href="/products">← Ürünlere dön</Link>
      <div className="catalog-heading hemenaku-form-hero">
        <span className="eyebrow">YENİ KAYIT</span>
        <h1 id="create-title">Yeni ürün oluştur</h1>
        <p>Ürün bilgilerini ve satışa hazır ilk varyantı birlikte ekleyin.</p>
      </div>

      <div className="hemenaku-wizard-stepper" aria-label="Ürün oluşturma adımları">
        <span className="is-current"><b>1</b><span><strong>Temel Bilgiler</strong><small>Ürün tanımı ve durum</small></span></span>
        <i aria-hidden="true" />
        <span><b>2</b><span><strong>Fiyat ve Stok</strong><small>İlk satış varyantı</small></span></span>
        <i aria-hidden="true" />
        <span><b>3</b><span><strong>Ürün Görseli</strong><small>İsteğe bağlı ilk fotoğraf</small></span></span>
      </div>

      <form className="catalog-form" onSubmit={submit} noValidate>
        {error ? <div className="feedback feedback-error" role="alert"><div><strong>Formu kontrol edin</strong><p>{error}</p></div></div> : null}
        <fieldset disabled={submitting}>
          <legend><span>01</span><span><strong>Temel Bilgiler</strong><small>Müşterilerin göreceği temel bilgiler</small></span></legend>
          <div className="form-grid">
            <label className="field field-wide"><span>Ürün adı <b>*</b></span><input name="title" required maxLength={200} autoComplete="off" placeholder="Örn. Seramik kahve kupası" /></label>
            <label className="field"><span>URL anahtarı <b>*</b></span><input name="slug" required minLength={3} maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" autoComplete="off" placeholder="seramik-kahve-kupasi" /><small>Küçük harf, rakam ve tire kullanın.</small></label>
            <label className="field"><span>Durum <b>*</b></span><select name="status" defaultValue="draft"><option value="draft">Taslak</option><option value="active">Aktif</option></select></label>
            <label className="field"><span>Para birimi</span><select name="currency" defaultValue="TRY"><option value="TRY">TRY — Türk lirası</option></select></label>
            <label className="field field-wide"><span>Açıklama</span><textarea name="description" maxLength={10_000} rows={4} placeholder="Ürünün özelliklerini kısa ve açık biçimde anlatın." /></label>
          </div>
        </fieldset>

        <fieldset disabled={submitting}>
          <legend><span>02</span><span><strong>Fiyat ve Stok</strong><small>İlk varyantın fiyat, kod ve stok bilgileri</small></span></legend>
          <div className="form-grid">
            <label className="field field-wide"><span>Varyant adı <b>*</b></span><input name="variantTitle" required maxLength={200} defaultValue="Standart" /></label>
            <label className="field"><span>SKU</span><input name="sku" maxLength={64} pattern="[A-Z0-9][A-Z0-9._-]{0,63}" placeholder="KUPA-BEYAZ-01" /><small>Büyük harf ve rakam önerilir.</small></label>
            <label className="field"><span>Barkod</span><input name="barcode" maxLength={128} inputMode="numeric" placeholder="8690000000001" /></label>
            <label className="field"><span>Satış fiyatı <b>*</b></span><div className="money-input"><input name="price" required inputMode="decimal" placeholder="0,00" /><span>₺</span></div></label>
            <label className="field"><span>Karşılaştırma fiyatı</span><div className="money-input"><input name="compareAt" inputMode="decimal" placeholder="0,00" /><span>₺</span></div></label>
            <label className="field"><span>Maliyet</span><div className="money-input"><input name="cost" inputMode="decimal" placeholder="0,00" /><span>₺</span></div></label>
            <label className="field"><span>Stok adedi <b>*</b></span><input name="stockQuantity" required inputMode="numeric" pattern="(?:0|[1-9][0-9]*)" defaultValue="0" /></label>
            <label className="check-field field-wide"><input name="stockTracking" type="checkbox" defaultChecked /><span><strong>Stok takibi açık</strong><small>Satışlarda mevcut stok adedini izleyin.</small></span></label>
          </div>
        </fieldset>

        <fieldset disabled={submitting || createdProductId !== ""}>
          <legend><span>03</span><span><strong>Ürün Görseli</strong><small>İsteğe bağlı ilk ürün fotoğrafı</small></span></legend>
          <div className="media-create-grid">
            <label className="media-picker"><span>{image ? "Başka görsel seç" : "Görsel seç"}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} /></label>
            <div className="media-upload-preview">{imagePreview ? <img src={imagePreview} alt="Yüklenecek görsel önizlemesi" /> : <span aria-hidden="true">◇</span>}<label className="field"><span>Görsel alt metni</span><input name="imageAltText" maxLength={500} placeholder="Örn. Seramik kupanın ön görünümü" /></label></div>
            {submitting && image ? <div className="upload-progress"><span>Yükleme ilerlemesi</span><progress role="progressbar" max="100" value={uploadProgress}>{uploadProgress}%</progress><b>{uploadProgress}%</b></div> : null}
          </div>
        </fieldset>

        <div className="form-actions">
          <Link className="button button-secondary" href="/products">Vazgeç</Link>
          {createdProductId ? <Link className="button button-primary" href={`/products/${createdProductId}`}>Oluşturulan ürüne git</Link> : <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? (image ? "Ürün ve görsel yükleniyor…" : "Ürün oluşturuluyor…") : "Ürünü oluştur"}</button>}
        </div>
      </form>
    </section>
  );
}
