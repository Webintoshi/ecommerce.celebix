"use client";

import type {
  CustomerListItem,
  OrderAddress,
  OrderDraftDetail,
  OrderDraftConversionResult,
  OrderDraftSaveIntent,
} from "@celebix/saas-contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { OrderApiError, scopedOrderApi } from "@/lib/order-ui/client";
import { usePanelChromeModel } from "@/components/panel/PanelLayoutClient";
import styles from "./order-drafts.module.css";

type Phase = "loading" | "ready" | "error";
type Busy = "" | "saving" | "archiving";
type Confirmation = "" | "archive";
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
  return "Sipariş işlemi tamamlanamadı. Lütfen yeniden deneyin.";
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
  const { storeSlug } = usePanelChromeModel();
  const orderApi = useMemo(() => scopedOrderApi(storeSlug), [storeSlug]);
  const confirmationRef = useRef<HTMLDialogElement>(null);
  const backLinkRef = useRef<HTMLAnchorElement>(null);
  const focusBackAfterClose = useRef(false);
  const [retry, setRetry] = useState(0);
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
  const [completed, setCompleted] = useState<Readonly<OrderDraftConversionResult>>();
  const [uncertain, setUncertain] = useState(() => orderApi.draftApplyLocked());

  useEffect(() => {
    if (typeof window === "undefined" || (!busy && !uncertain)) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [busy, uncertain]);

  useEffect(() => {
    const dialog = confirmationRef.current;
    if (!dialog) return;
    if (confirmation && !dialog.open) dialog.showModal();
    if (!confirmation && dialog.open) {
      dialog.close();
      if (focusBackAfterClose.current) {
        focusBackAfterClose.current = false;
        backLinkRef.current?.focus();
      }
    }
  }, [confirmation]);

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

  const loadChoices = useCallback(async (signal?: AbortSignal) => {
    setChoicesFailed(false);
    try {
      const [catalog, customerPage] = await Promise.all([
        loadCatalogVariantChoices(undefined, signal),
        customerApi.list({ pageSize: 100, status: "active" }),
      ]);
      if (signal?.aborted) return;
      setVariants(catalog.variants);
      setCustomers(customerPage.items);
    } catch {
      if (!signal?.aborted) setChoicesFailed(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadChoices(controller.signal);
    return () => controller.abort();
  }, [loadChoices]);

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
  }, [hydrate, props.draftId, retry]);

  const readOnly = !props.canManage || Boolean(completed) || Boolean(record && record.status !== "draft");
  const needsRecoveryInput = uncertain && orderApi.draftApplyNeedsInput();
  const disabled = readOnly || busy !== "" || (uncertain && !needsRecoveryInput);
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
    if (readOnly || busy) return;
    setBusy("saving");
    setNotice("Kaydediliyor…");
    setError("");
    setConfirmation("");
    try {
      const result = uncertain && !needsRecoveryInput ? await orderApi.retryDraftApply() : await orderApi.applyDraft(intent(), record?.id);
      setCompleted(result);
      setUncertain(false);
      setNotice(`Sipariş ${result.orderNumber} oluşturuldu.`);
      router.replace(`/orders/${result.orderId}`);
    } catch (failure) {
      setNotice("");
      setUncertain(orderApi.draftApplyLocked());
      setError(orderApi.draftApplyLocked() ? "Kayıt sonucu doğrulanamadı. Kaydı doğrula ile aynı işlemin sonucunu kontrol edin; girilen bilgiler korunuyor." : errorMessage(failure));
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
      focusBackAfterClose.current = true;
      hydrate(next);
      setConfirmation("");
      setNotice("Tamamlanmamış kayıt arşivlendi.");
    } catch (failure) {
      setConfirmation("");
      setError(errorMessage(failure));
    } finally {
      setBusy("");
    }
  }

  if (!props.draftId && !props.canManage) return (
    <PanelPageShell><PanelPageHeader title="Yeni manuel sipariş" /><h1 className="sr-only">Yeni manuel sipariş</h1><div className={styles.denied} role="status">Sipariş oluşturma yetkiniz yok.</div></PanelPageShell>
  );

  const title = record?.draftNumber ?? (props.draftId ? "Manuel sipariş" : "Yeni manuel sipariş");
  return (
    <PanelPageShell>
      <PanelPageHeader title={title} />
      <h1 className="sr-only">{title}</h1>
      <div className={styles.editorToolbar}><Link ref={backLinkRef} className={styles.secondaryAction} href="/orders/drafts">Manuel siparişlere dön</Link>{record ? <span>{record.draftNumber}</span> : null}</div>
      {phase === "loading" ? <div className={styles.editorLoading} role="status"><strong>Manuel sipariş yükleniyor</strong><i aria-hidden="true" /></div> : null}
      {phase === "error" ? <div className={styles.error} role="alert"><div><h2>Kayıt açılamadı</h2><p>{error}</p></div><button type="button" onClick={() => setRetry((current) => current + 1)}>Tekrar dene</button></div> : null}
      {phase === "ready" ? (
        <div className={styles.editorWorkspace}>
          <form id="order-draft-form" className={styles.editorForm} onSubmit={(event) => { event.preventDefault(); void save(); }}>
            {error ? <p className={styles.formError} role="alert">{error}</p> : null}
            {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
            {needsRecoveryInput ? <p className={styles.formError} role="alert">Önceki kayıt sonucu belirsiz. Aynı bilgileri girip Kaydı doğrula ile kontrol edin.</p> : null}
            {readOnly ? <p className={styles.readOnlyNotice} role="status">{completed || record?.status === "converted" ? "Sipariş oluşturuldu. Bu kayıt yalnız görüntülenebilir." : record?.status === "archived" ? "Bu kayıt arşivlendiği için yalnız görüntülenebilir." : "Bu kaydı değiştirme yetkiniz yok."}</p> : null}
            <section className={styles.formSection}>
              <div className={styles.sectionHeading}><div><h2>Müşteri</h2></div></div>
              <fieldset className={styles.fieldGrid} disabled={disabled}>
                <label className={styles.fullField}>Kayıtlı müşteri<select aria-label="Kayıtlı müşteri" value={customerId} onChange={(event) => selectCustomer(event.target.value)}><option value="">Yeni / misafir müşteri</option>{customerId && !customers.some((customer) => customer.id === customerId) ? <option value={customerId}>{customerName || "Kayıtlı müşteri"}</option> : null}{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}{customer.email ? ` — ${customer.email}` : ""}</option>)}</select></label>
                <label>Ad soyad<input required maxLength={200} autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
                <label>E-posta<input required type="email" maxLength={320} autoComplete="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} /></label>
                <label className={styles.fullField}>Telefon <span>(isteğe bağlı)</span><input type="tel" maxLength={32} autoComplete="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></label>
              </fieldset>
              {choicesFailed ? <p className={styles.choiceWarning} role="alert">Müşteri veya ürün seçenekleri yüklenemedi. Girilen bilgiler korunuyor. <button className={styles.choiceRetry} type="button" onClick={() => void loadChoices()}>Tekrar dene</button></p> : null}
            </section>

            <section className={styles.formSection}>
              <div className={styles.sectionHeading}><div><h2>Ürünler</h2></div></div>
              <fieldset disabled={disabled}>
                <label className={styles.fullField}>Ürün / varyant ekle<select aria-label="Ürün / varyant ekle" defaultValue="" onChange={(event) => { addVariant(event.target.value); event.target.value = ""; }}><option value="" disabled>Ürün veya varyant seçin</option>{variants.map((variant) => <option key={variant.variantId} value={variant.variantId}>{variant.productTitle} — {variant.variantTitle}{variant.sku ? ` (${variant.sku})` : ""}</option>)}</select></label>
                <div className={styles.lineRows}>{lines.map((line) => <article className={styles.lineRow} key={line.lineId}>
                  <div className={styles.lineIdentity}><strong>{line.productName}</strong><span>{line.variantName}{line.sku ? ` · ${line.sku}` : ""}</span></div>
                  <label>Adet<input type="number" required min="1" max="9999" step="1" value={line.quantity} onChange={(event) => updateLine(line.lineId, { quantity: event.target.value })} /></label>
                  <label>Satır indirimi (TL)<input inputMode="decimal" required value={line.discount} onChange={(event) => updateLine(line.lineId, { discount: event.target.value })} /></label>
                  <button type="button" onClick={() => setLines((current) => Object.freeze(current.filter((candidate) => candidate.lineId !== line.lineId)))}>Kaldır</button>
                </article>)}</div>
                {lines.length === 0 ? <p className={styles.inlineEmpty}>Siparişi kaydetmek için en az bir ürün ekleyin.</p> : null}
              </fieldset>
            </section>

            <section className={styles.formSection}>
              <div className={styles.sectionHeading}><div><h2>Teslimat ve fatura</h2></div></div>
              <AddressFields legend="Teslimat adresi" value={shippingAddress} disabled={disabled} onChange={setShippingAddress} />
              <label className={styles.checkRow}><input type="checkbox" checked={sameBilling} disabled={disabled} onChange={(event) => setSameBilling(event.target.checked)} /><span>Fatura adresi teslimat adresiyle aynı</span></label>
              {!sameBilling ? <AddressFields legend="Fatura adresi" value={billingAddress} disabled={disabled} onChange={setBillingAddress} /> : null}
            </section>

            <section className={styles.formSection}>
              <div className={styles.sectionHeading}><div><h2>Sipariş ayarları</h2></div></div>
              <fieldset className={styles.fieldGrid} disabled={disabled}>
                <label>Kargo ücreti (TL)<input required inputMode="decimal" value={shipping} onChange={(event) => setShipping(event.target.value)} /></label>
                <label>Sipariş indirimi (TL)<input required inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label>
                <label className={styles.fullField}>Sipariş notu <span>(isteğe bağlı)</span><textarea maxLength={2000} rows={4} value={note} onChange={(event) => setNote(event.target.value)} /></label>
                <label className={`${styles.checkRow} ${styles.fullField}`}><input type="checkbox" checked={adjustInventory} onChange={(event) => setAdjustInventory(event.target.checked)} /><span>Kaydederken stokları düş</span></label>
              </fieldset>
            </section>
          </form>

          <aside className={styles.summaryCard} aria-label="Sipariş özeti">
            <div className={styles.summaryHeading}><div><span>Sipariş özeti</span><strong>{completed?.orderNumber ?? record?.draftNumber ?? "Yeni kayıt"}</strong></div>{completed ? <PanelStatusBadge tone="success">Kaydedildi</PanelStatusBadge> : record ? <PanelStatusBadge tone={record.status === "converted" ? "success" : "neutral"}>{record.status === "draft" ? "Tamamlanmamış" : record.status === "converted" ? "Dönüştürüldü" : "Arşivlendi"}</PanelStatusBadge> : null}</div>
            <dl className={styles.summaryFacts}>
              <div><dt>Ürün satırı</dt><dd>{lines.length.toLocaleString("tr-TR")}</dd></div>
              <div><dt>Kayıtlı ara toplam</dt><dd>{record ? money(record.subtotalCents) : "Kayıttan sonra hesaplanır"}</dd></div>
              <div><dt>Kargo</dt><dd>{money(enteredShipping)}</dd></div>
              <div><dt>İndirim</dt><dd>− {money(enteredDiscount)}</dd></div>
              <div className={styles.summaryTotal}><dt>Görünen toplam</dt><dd>{displayedTotal === undefined ? "Kayıttan sonra hesaplanır" : money(displayedTotal)}</dd></div>
            </dl>
            <p className={styles.summaryHint}>Fiyatlar ve stok kaydederken doğrulanır.</p>
            {props.canManage && !readOnly && !confirmation ? <button className={styles.primaryButton} form={uncertain && !needsRecoveryInput ? undefined : "order-draft-form"} type={uncertain && !needsRecoveryInput ? "button" : "submit"} onClick={uncertain && !needsRecoveryInput ? () => void save() : undefined} disabled={busy !== "" || ((!uncertain || needsRecoveryInput) && lines.length === 0)}>{busy === "saving" ? "Kaydediliyor…" : uncertain ? "Kaydı doğrula" : "Kaydet"}</button> : null}
            {record?.status === "draft" && props.canManage && !completed ? <div className={styles.secondaryButtons}><button className={styles.dangerButton} type="button" disabled={disabled} onClick={() => setConfirmation("archive")}>Kaydı arşivle</button></div> : null}
            {completed ? <Link className={styles.primaryLink} href={`/orders/${completed.orderId}`}>Oluşan siparişi aç</Link> : null}
            {record?.status === "converted" && record.convertedOrderId ? <Link className={styles.primaryLink} href={`/orders/${record.convertedOrderId}`}>Oluşan siparişi aç</Link> : null}
            <dialog ref={confirmationRef} className={styles.confirmation} aria-labelledby="draft-confirm-title" aria-describedby="draft-confirm-description" onCancel={(event) => { if (busy) event.preventDefault(); else setConfirmation(""); }}>
              <h2 id="draft-confirm-title">Tamamlanmamış kayıt arşivlensin mi?</h2>
              <p id="draft-confirm-description">Kayıt yalnız görüntülenebilir olacak.</p>
              <div><button type="button" disabled={busy !== ""} autoFocus onClick={() => setConfirmation("")}>Vazgeç</button><button className={styles.dangerButton} type="button" disabled={busy !== ""} onClick={() => void archive()}>{busy ? "İşleniyor…" : "Evet, arşivle"}</button></div>
            </dialog>
          </aside>
        </div>
      ) : null}
    </PanelPageShell>
  );
}
