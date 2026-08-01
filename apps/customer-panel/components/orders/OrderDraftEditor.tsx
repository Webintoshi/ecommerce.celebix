"use client";

import type {
  CustomerListItem,
  OrderAddress,
  OrderDraftDetail,
  OrderDraftSaveIntent,
} from "@celebix/saas-contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  PanelPageHeader,
  PanelPageShell,
  PanelStatusBadge,
} from "@/components/panel/PanelPageShell";
import {
  loadCatalogVariantChoices,
  type CatalogVariantChoice,
} from "@/lib/catalog-ui/variant-choices";
import { customerApi } from "@/lib/customer-ui/client";
import { OrderApiError, orderApi } from "@/lib/order-ui/client";
import styles from "./order-drafts.module.css";

type Phase = "loading" | "ready" | "error";
type Busy = "" | "saving" | "archiving" | "converting";
type Confirmation = "" | "archive" | "convert";
type AddressDraft = Readonly<{
  recipientName: string;
  line1: string;
  line2: string;
  district: string;
  city: string;
  postalCode: string;
  country: string;
}>;
type LineDraft = Readonly<{
  lineId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: string;
  discount: string;
}>;

const EMPTY_ADDRESS: AddressDraft = Object.freeze({
  recipientName: "",
  line1: "",
  line2: "",
  district: "",
  city: "",
  postalCode: "",
  country: "TR",
});

function money(cents: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(cents / 100);
}

function decimal(cents: number) {
  return (cents / 100).toFixed(2);
}

function cents(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^(?:0|[1-9]\d{0,7})(?:[.]\d{1,2})?$/.test(normalized)) throw new TypeError("order_draft_money_invalid");
  const result = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(result) || result < 0 || result > 8_000_000_000) throw new TypeError("order_draft_money_invalid");
  return result;
}

function addressDraft(address: Readonly<OrderAddress>): AddressDraft {
  return Object.freeze({
    recipientName: address.recipientName,
    line1: address.line1,
    line2: address.line2 ?? "",
    district: address.district ?? "",
    city: address.city,
    postalCode: address.postalCode ?? "",
    country: address.country,
  });
}

function addressValue(address: AddressDraft): Readonly<OrderAddress> {
  const recipientName = address.recipientName.trim();
  const line1 = address.line1.trim();
  const line2 = address.line2.trim();
  const district = address.district.trim();
  const city = address.city.trim();
  const postalCode = address.postalCode.trim();
  const country = address.country.trim().toUpperCase();
  return Object.freeze({
    recipientName,
    line1,
    ...(line2 ? { line2 } : {}),
    ...(district ? { district } : {}),
    city,
    ...(postalCode ? { postalCode } : {}),
    country,
  });
}

function lineDrafts(record: OrderDraftDetail): readonly LineDraft[] {
  return Object.freeze(record.lines.map((line) => Object.freeze({
    lineId: line.lineId,
    productId: line.productId,
    variantId: line.variantId,
    productName: line.productName,
    variantName: line.variantName ?? "",
    sku: line.sku ?? "",
    quantity: String(line.quantity),
    discount: decimal(line.discountCents),
  })));
}

function errorMessage(error: unknown) {
  if (error instanceof OrderApiError) return error.message;
  if (error instanceof TypeError && error.message === "order_draft_money_invalid") return "Tutar alanlarını TL biçiminde kontrol edin.";
  return "Taslak sipariş işlemi tamamlanamadı. Lütfen yeniden deneyin.";
}

function AddressFields(props: Readonly<{
  legend: string;
  value: AddressDraft;
  disabled: boolean;
  onChange(value: AddressDraft): void;
}>) {
  const change = (field: keyof AddressDraft, value: string) => props.onChange(Object.freeze({ ...props.value, [field]: value }));
  return (
    <fieldset className={styles.addressFields} disabled={props.disabled}>
      <legend>{props.legend}</legend>
      <label className={styles.fullField}>Alıcı adı<input required maxLength={200} autoComplete="name" value={props.value.recipientName} onChange={(event) => change("recipientName", event.target.value)} /></label>
      <label className={styles.fullField}>Adres<input required maxLength={500} autoComplete="address-line1" value={props.value.line1} onChange={(event) => change("line1", event.target.value)} /></label>
      <label className={styles.fullField}>Adres devamı <span>(isteğe bağlı)</span><input maxLength={500} autoComplete="address-line2" value={props.value.line2} onChange={(event) => change("line2", event.target.value)} /></label>
      <label>İl<input required maxLength={100} autoComplete="address-level1" value={props.value.city} onChange={(event) => change("city", event.target.value)} /></label>
      <label>İlçe<input maxLength={100} autoComplete="address-level2" value={props.value.district} onChange={(event) => change("district", event.target.value)} /></label>
      <label>Posta kodu<input maxLength={32} autoComplete="postal-code" value={props.value.postalCode} onChange={(event) => change("postalCode", event.target.value)} /></label>
      <label>Ülke kodu<input required minLength={2} maxLength={2} autoComplete="country" value={props.value.country} onChange={(event) => change("country", event.target.value.toUpperCase())} /></label>
    </fieldset>
  );
}

export function OrderDraftEditor(props: Readonly<{ draftId?: string; canManage: boolean }>) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(props.draftId ? "loading" : "ready");
  const [record, setRecord] = useState<OrderDraftDetail>();
  const [customers, setCustomers] = useState<readonly CustomerListItem[]>([]);
  const [variants, setVariants] = useState<readonly CatalogVariantChoice[]>([]);
  const [choicesFailed, setChoicesFailed] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState<AddressDraft>(EMPTY_ADDRESS);
  const [billingAddress, setBillingAddress] = useState<AddressDraft>(EMPTY_ADDRESS);
  const [sameBilling, setSameBilling] = useState(true);
  const [shipping, setShipping] = useState("0.00");
  const [discount, setDiscount] = useState("0.00");
  const [note, setNote] = useState("");
  const [adjustInventory, setAdjustInventory] = useState(true);
  const [lines, setLines] = useState<readonly LineDraft[]>([]);
  const [busy, setBusy] = useState<Busy>("");
  const [confirmation, setConfirmation] = useState<Confirmation>("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const hydrate = useCallback((draft: OrderDraftDetail) => {
    setRecord(draft);
    setCustomerId(draft.customerId ?? "");
    setCustomerName(draft.customerName);
    setCustomerEmail(draft.customerEmail);
    setCustomerPhone(draft.customerPhone ?? "");
    setShippingAddress(addressDraft(draft.shippingAddress));
    setBillingAddress(addressDraft(draft.billingAddress));
    setSameBilling(JSON.stringify(draft.shippingAddress) === JSON.stringify(draft.billingAddress));
    setShipping(decimal(draft.shippingCents));
    setDiscount(decimal(draft.discountCents));
    setNote(draft.note ?? "");
    setAdjustInventory(draft.adjustInventory);
    setLines(lineDrafts(draft));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    void Promise.all([
      loadCatalogVariantChoices(undefined, controller.signal),
      customerApi.list({ pageSize: 100, status: "active" }),
    ]).then(([catalog, customerPage]) => {
      if (!current) return;
      setVariants(catalog.variants);
      setCustomers(customerPage.items);
    }).catch(() => { if (current && !controller.signal.aborted) setChoicesFailed(true); });
    return () => { current = false; controller.abort(); };
  }, []);

  useEffect(() => {
    if (!props.draftId) return;
    let current = true;
    setPhase("loading");
    setError("");
    void orderApi.getDraft(props.draftId).then((draft) => {
      if (!current) return;
      hydrate(draft);
      setPhase("ready");
    }).catch((failure) => {
      if (!current) return;
      setError(errorMessage(failure));
      setPhase("error");
    });
    return () => { current = false; };
  }, [hydrate, props.draftId]);

  const readOnly = !props.canManage || Boolean(record && record.status !== "draft");
  const disabled = readOnly || busy !== "";
  const selectedVariants = useMemo(() => new Map(variants.map((variant) => [variant.variantId, variant])), [variants]);
  const savedSubtotal = record?.subtotalCents ?? 0;
  const enteredShipping = useMemo(() => { try { return cents(shipping); } catch { return 0; } }, [shipping]);
  const enteredDiscount = useMemo(() => { try { return cents(discount); } catch { return 0; } }, [discount]);
  const displayedTotal = record ? Math.max(0, savedSubtotal + enteredShipping - enteredDiscount) : undefined;

  function selectCustomer(id: string) {
    setCustomerId(id);
    const customer = customers.find((candidate) => candidate.id === id);
    if (!customer) return;
    setCustomerName(customer.displayName);
    setCustomerEmail(customer.email ?? "");
    setCustomerPhone(customer.phone ?? "");
    setShippingAddress((current) => Object.freeze({ ...current, recipientName: customer.displayName }));
    if (sameBilling) setBillingAddress((current) => Object.freeze({ ...current, recipientName: customer.displayName }));
  }

  function addVariant(variantId: string) {
    const variant = selectedVariants.get(variantId);
    if (!variant || lines.some((line) => line.variantId === variantId) || lines.length >= 100) return;
    setLines((current) => Object.freeze([...current, Object.freeze({
      lineId: crypto.randomUUID(),
      productId: variant.productId,
      variantId: variant.variantId,
      productName: variant.productTitle,
      variantName: variant.variantTitle,
      sku: variant.sku ?? "",
      quantity: "1",
      discount: "0.00",
    })]));
  }

  function updateLine(lineId: string, update: Partial<LineDraft>) {
    setLines((current) => Object.freeze(current.map((line) => line.lineId === lineId ? Object.freeze({ ...line, ...update }) : line)));
  }

  function intent(): Readonly<OrderDraftSaveIntent> {
    const trimmedPhone = customerPhone.trim();
    const trimmedNote = note.trim();
    return Object.freeze({
      ...(customerId ? { customerId } : {}),
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase(),
      ...(trimmedPhone ? { customerPhone: trimmedPhone } : {}),
      currency: "TRY",
      shippingCents: cents(shipping),
      discountCents: cents(discount),
      shippingAddress: addressValue(shippingAddress),
      billingAddress: addressValue(sameBilling ? shippingAddress : billingAddress),
      ...(trimmedNote ? { note: trimmedNote } : {}),
      adjustInventory,
      lines: Object.freeze(lines.map((line) => Object.freeze({
        lineId: line.lineId,
        productId: line.productId,
        variantId: line.variantId,
        quantity: Number(line.quantity),
        discountCents: cents(line.discount),
      }))),
      ...(record ? { expectedVersion: record.version } : {}),
    });
  }

  async function save() {
    if (disabled) return;
    setBusy("saving");
    setNotice("Taslak güvenli biçimde kaydediliyor…");
    setError("");
    setConfirmation("");
    try {
      const next = record
        ? await orderApi.updateDraft(record.id, intent())
        : await orderApi.createDraft(intent());
      hydrate(next);
      setNotice("Taslak PostgreSQL üzerinde kalıcı olarak kaydedildi.");
      if (!record) router.replace(`/orders/drafts/${next.id}`);
    } catch (failure) {
      setNotice("");
      setError(errorMessage(failure));
    } finally {
      setBusy("");
    }
  }

  async function archive() {
    if (!record || disabled || confirmation !== "archive") return;
    setBusy("archiving");
    setError("");
    try {
      const next = await orderApi.archiveDraft(record.id, { expectedVersion: record.version });
      hydrate(next);
      setConfirmation("");
      setNotice("Taslak arşivlendi. Sipariş veya stok kaydı oluşturulmadı.");
    } catch (failure) {
      setConfirmation("");
      setError(errorMessage(failure));
    } finally {
      setBusy("");
    }
  }

  async function convert() {
    if (!record || disabled || confirmation !== "convert") return;
    setBusy("converting");
    setError("");
    try {
      const result = await orderApi.convertDraft(record.id, { expectedVersion: record.version });
      router.replace(`/orders/${result.orderId}`);
    } catch (failure) {
      setConfirmation("");
      setError(errorMessage(failure));
      setBusy("");
    }
  }

  if (!props.draftId && !props.canManage) return (
    <PanelPageShell><PanelPageHeader title="Yeni Taslak Sipariş" /><div className={styles.denied} role="status">Taslak sipariş oluşturma yetkiniz yok.</div></PanelPageShell>
  );

  const title = record?.draftNumber ?? (props.draftId ? "Taslak Sipariş" : "Yeni Taslak Sipariş");
  return (
    <PanelPageShell>
      <PanelPageHeader title={title} description="Müşteri, ürün, teslimat ve stok kararını tek çalışma alanında yönetin." actions={<Link className={styles.secondaryAction} href="/orders/drafts">Taslaklara dön</Link>} />
      {phase === "loading" ? <p className={styles.state} role="status">Taslak sipariş yükleniyor…</p> : null}
      {phase === "error" ? <div className={styles.error} role="alert"><div><h2>Taslak açılamadı</h2><p>{error}</p></div><button type="button" onClick={() => router.refresh()}>Sayfayı yenile</button></div> : null}
      {phase === "ready" ? (
        <div className={styles.editorWorkspace}>
          <form id="order-draft-form" className={styles.editorForm} onSubmit={(event) => { event.preventDefault(); void save(); }}>
            {error ? <p className={styles.formError} role="alert">{error}</p> : null}
            {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
            {readOnly ? <p className={styles.readOnlyNotice} role="status">{record?.status === "converted" ? "Bu taslak siparişe dönüştürüldüğü için salt okunur." : record?.status === "archived" ? "Bu taslak arşivlendiği için salt okunur." : "Bu kaydı değiştirme yetkiniz yok."}</p> : null}
            <section className={styles.formSection}>
              <div className={styles.sectionHeading}><div><span>1</span><h2>Müşteri</h2></div><p>Kayıtlı müşteriyi seçin veya bilgileri elle girin.</p></div>
              <fieldset className={styles.fieldGrid} disabled={disabled}>
                <label className={styles.fullField}>Kayıtlı müşteri<select value={customerId} onChange={(event) => selectCustomer(event.target.value)}><option value="">Yeni / misafir müşteri</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}{customer.email ? ` — ${customer.email}` : ""}</option>)}</select></label>
                <label>Ad soyad<input required maxLength={200} autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
                <label>E-posta<input required type="email" maxLength={320} autoComplete="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} /></label>
                <label className={styles.fullField}>Telefon <span>(isteğe bağlı)</span><input type="tel" maxLength={32} autoComplete="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></label>
              </fieldset>
              {choicesFailed ? <p className={styles.choiceWarning} role="alert">Müşteri veya ürün seçenekleri yüklenemedi. Mevcut taslak bilgileri korunuyor; yeni seçim için sayfayı yenileyin.</p> : null}
            </section>

            <section className={styles.formSection}>
              <div className={styles.sectionHeading}><div><span>2</span><h2>Ürünler</h2></div><p>Fiyatlar kaydetme anında katalogdan doğrulanır.</p></div>
              <fieldset disabled={disabled}>
                <label className={styles.fullField}>Ürün / varyant ekle<select defaultValue="" onChange={(event) => { addVariant(event.target.value); event.target.value = ""; }}><option value="" disabled>Ürün veya varyant seçin</option>{variants.map((variant) => <option key={variant.variantId} value={variant.variantId}>{variant.productTitle} — {variant.variantTitle}{variant.sku ? ` (${variant.sku})` : ""}</option>)}</select></label>
                <div className={styles.lineRows}>{lines.map((line) => <article className={styles.lineRow} key={line.lineId}>
                  <div className={styles.lineIdentity}><strong>{line.productName}</strong><span>{line.variantName}{line.sku ? ` · ${line.sku}` : ""}</span></div>
                  <label>Adet<input type="number" required min="1" max="9999" step="1" value={line.quantity} onChange={(event) => updateLine(line.lineId, { quantity: event.target.value })} /></label>
                  <label>Satır indirimi (TL)<input inputMode="decimal" required value={line.discount} onChange={(event) => updateLine(line.lineId, { discount: event.target.value })} /></label>
                  <button type="button" onClick={() => setLines((current) => Object.freeze(current.filter((candidate) => candidate.lineId !== line.lineId)))}>Kaldır</button>
                </article>)}</div>
                {lines.length === 0 ? <p className={styles.inlineEmpty}>Taslağı kaydetmek için en az bir ürün ekleyin.</p> : null}
              </fieldset>
            </section>

            <section className={styles.formSection}>
              <div className={styles.sectionHeading}><div><span>3</span><h2>Teslimat ve fatura</h2></div><p>Siparişe dönüşecek adresleri eksiksiz kaydedin.</p></div>
              <AddressFields legend="Teslimat adresi" value={shippingAddress} disabled={disabled} onChange={setShippingAddress} />
              <label className={styles.checkRow}><input type="checkbox" checked={sameBilling} disabled={disabled} onChange={(event) => setSameBilling(event.target.checked)} /><span>Fatura adresi teslimat adresiyle aynı</span></label>
              {!sameBilling ? <AddressFields legend="Fatura adresi" value={billingAddress} disabled={disabled} onChange={setBillingAddress} /> : null}
            </section>

            <section className={styles.formSection}>
              <div className={styles.sectionHeading}><div><span>4</span><h2>Sipariş ayarları</h2></div><p>Ek ücret, indirim, not ve stok davranışını belirleyin.</p></div>
              <fieldset className={styles.fieldGrid} disabled={disabled}>
                <label>Kargo ücreti (TL)<input required inputMode="decimal" value={shipping} onChange={(event) => setShipping(event.target.value)} /></label>
                <label>Sipariş indirimi (TL)<input required inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label>
                <label className={styles.fullField}>Sipariş notu <span>(isteğe bağlı)</span><textarea maxLength={2000} rows={4} value={note} onChange={(event) => setNote(event.target.value)} /></label>
                <label className={`${styles.checkRow} ${styles.fullField}`}><input type="checkbox" checked={adjustInventory} onChange={(event) => setAdjustInventory(event.target.checked)} /><span>Siparişe dönüştürürken stokları düş</span></label>
              </fieldset>
            </section>
          </form>

          <aside className={styles.summaryCard} aria-label="Taslak sipariş özeti">
            <div className={styles.summaryHeading}><div><span>Taslak özeti</span><strong>{record?.draftNumber ?? "Yeni kayıt"}</strong></div>{record ? <PanelStatusBadge tone={record.status === "draft" ? "warning" : record.status === "converted" ? "success" : "neutral"}>{record.status === "draft" ? "Taslak" : record.status === "converted" ? "Dönüştürüldü" : "Arşivlendi"}</PanelStatusBadge> : null}</div>
            <dl className={styles.summaryFacts}>
              <div><dt>Ürün satırı</dt><dd>{lines.length.toLocaleString("tr-TR")}</dd></div>
              <div><dt>Kayıtlı ara toplam</dt><dd>{record ? money(record.subtotalCents) : "Kayıttan sonra hesaplanır"}</dd></div>
              <div><dt>Kargo</dt><dd>{money(enteredShipping)}</dd></div>
              <div><dt>İndirim</dt><dd>− {money(enteredDiscount)}</dd></div>
              <div className={styles.summaryTotal}><dt>Görünen toplam</dt><dd>{displayedTotal === undefined ? "Kayıttan sonra hesaplanır" : money(displayedTotal)}</dd></div>
            </dl>
            <p className={styles.summaryHint}>Ürün fiyatı ve stok uygunluğu her kaydetme ve dönüştürme işleminde sunucuda yeniden doğrulanır.</p>
            {props.canManage && !readOnly ? <button className={styles.primaryButton} form="order-draft-form" type="submit" disabled={busy !== "" || lines.length === 0}>{busy === "saving" ? "Kaydediliyor…" : record ? "Değişiklikleri kaydet" : "Taslağı kaydet"}</button> : null}
            {record?.status === "draft" && props.canManage ? <div className={styles.secondaryButtons}><button type="button" disabled={busy !== ""} onClick={() => setConfirmation("convert")}>Siparişe dönüştür</button><button className={styles.dangerButton} type="button" disabled={busy !== ""} onClick={() => setConfirmation("archive")}>Taslağı arşivle</button></div> : null}
            {record?.status === "converted" && record.convertedOrderId ? <Link className={styles.primaryLink} href={`/orders/${record.convertedOrderId}`}>Oluşan siparişi aç</Link> : null}
            {confirmation ? <div className={styles.confirmation} role="alertdialog" aria-label={confirmation === "convert" ? "Siparişe dönüştürme onayı" : "Taslak arşivleme onayı"}>
              <strong>{confirmation === "convert" ? "Sipariş oluşturulsun mu?" : "Taslak arşivlensin mi?"}</strong>
              <p>{confirmation === "convert" ? (adjustInventory ? "Katalog ve stok yeniden doğrulanacak; stoklar siparişle birlikte düşülecek." : "Katalog yeniden doğrulanacak; stok miktarı değiştirilmeyecek.") : "Bu işlem sipariş veya stok hareketi oluşturmaz."}</p>
              <div><button type="button" disabled={busy !== ""} onClick={() => setConfirmation("")}>Vazgeç</button><button className={confirmation === "archive" ? styles.dangerButton : styles.primaryButton} type="button" disabled={busy !== ""} onClick={() => void (confirmation === "archive" ? archive() : convert())}>{busy ? "İşleniyor…" : confirmation === "archive" ? "Evet, arşivle" : "Evet, sipariş oluştur"}</button></div>
            </div> : null}
          </aside>
        </div>
      ) : null}
    </PanelPageShell>
  );
}
