"use client";

import {
  Copy,
  ExternalLink,
  Link2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QuickOrderAddress, QuickOrderLinkListItem, QuickOrderLinkStatus } from "@celebix/saas-contracts";

import { PanelPageHeader, PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import {
  QuickLinkUiApiError,
  quickLinkUi,
  type CatalogSearchProduct,
  type CatalogSearchVariant,
} from "@/lib/quick-link-ui/client";
import styles from "./quick-order-links.module.css";

type ListState = "loading" | "loaded" | "error";
type SearchState = "idle" | "loading" | "loaded" | "error";
type ProviderState = "unknown" | "activating" | "ready" | "not-ready" | "error";

type AddressForm = {
  recipientName: string;
  phone: string;
  line1: string;
  line2: string;
  district: string;
  city: string;
  postalCode: string;
  country: string;
};

type SelectedLine = Readonly<{
  variantId: string;
  productName: string;
  variantName: string;
  sku?: string;
  unitPriceCents: number;
  availableQuantity?: number;
  quantity: number;
}>;

const EMPTY_ADDRESS: AddressForm = {
  recipientName: "",
  phone: "",
  line1: "",
  line2: "",
  district: "",
  city: "",
  postalCode: "",
  country: "TR",
};

const STATUS_LABELS: Readonly<Record<QuickOrderLinkStatus, string>> = Object.freeze({
  active: "Aktif",
  opened: "Açıldı",
  paid: "Ödendi",
  cancelled: "İptal",
  expired: "Süresi doldu",
});

const EXPIRY_OPTIONS = Object.freeze([
  Object.freeze({ value: 4 as const, label: "4 saat geçerli" }),
  Object.freeze({ value: 12 as const, label: "12 saat geçerli" }),
  Object.freeze({ value: 24 as const, label: "24 saat geçerli" }),
  Object.freeze({ value: 48 as const, label: "48 saat geçerli" }),
  Object.freeze({ value: 72 as const, label: "72 saat geçerli" }),
]);

function money(cents: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function cents(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{0,12}(?:\.\d{0,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized || "0");
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function toAddress(value: AddressForm): Readonly<QuickOrderAddress> {
  return Object.freeze({
    recipientName: value.recipientName.trim(),
    phone: value.phone.trim(),
    line1: value.line1.trim(),
    ...(value.line2.trim() === "" ? {} : { line2: value.line2.trim() }),
    ...(value.district.trim() === "" ? {} : { district: value.district.trim() }),
    city: value.city.trim(),
    ...(value.postalCode.trim() === "" ? {} : { postalCode: value.postalCode.trim() }),
    country: value.country.trim().toUpperCase(),
  });
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof QuickLinkUiApiError ? error.message : fallback;
}

function tone(status: QuickOrderLinkStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "paid") return "success";
  if (status === "cancelled") return "danger";
  if (status === "active" || status === "expired") return "warning";
  return "neutral";
}

function Panel({ title, children, actions, id }: { title: string; children: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <div className={styles.panelHeader}>
        <h2 id={id}>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function AddressFields({ prefix, value, onChange }: {
  prefix: string;
  value: AddressForm;
  onChange: (key: keyof AddressForm, value: string) => void;
}) {
  return (
    <div className={styles.addressGrid}>
      <label><span>Alıcı adı soyadı</span><input value={value.recipientName} onChange={(event) => onChange("recipientName", event.target.value)} autoComplete={`${prefix} name`} maxLength={200} required /></label>
      <label><span>Telefon</span><input value={value.phone} onChange={(event) => onChange("phone", event.target.value)} autoComplete={`${prefix} tel`} maxLength={32} required /></label>
      <label><span>Şehir</span><input value={value.city} onChange={(event) => onChange("city", event.target.value)} autoComplete={`${prefix} address-level2`} maxLength={200} required /></label>
      <label><span>İlçe</span><input value={value.district} onChange={(event) => onChange("district", event.target.value)} autoComplete={`${prefix} address-level3`} maxLength={200} /></label>
      <label><span>Posta kodu</span><input value={value.postalCode} onChange={(event) => onChange("postalCode", event.target.value)} autoComplete={`${prefix} postal-code`} maxLength={32} /></label>
      <label><span>Ülke kodu</span><input value={value.country} onChange={(event) => onChange("country", event.target.value.toUpperCase())} autoComplete={`${prefix} country`} maxLength={2} required /></label>
      <label className={styles.wide}><span>Adres</span><textarea value={value.line1} onChange={(event) => onChange("line1", event.target.value)} autoComplete={`${prefix} address-line1`} maxLength={300} rows={3} required /></label>
      <label className={styles.wide}><span>Adres devamı</span><input value={value.line2} onChange={(event) => onChange("line2", event.target.value)} autoComplete={`${prefix} address-line2`} maxLength={300} /></label>
    </div>
  );
}

function SearchResults({ products, onAdd, onKeyDown, buttonRefs }: {
  products: readonly CatalogSearchProduct[];
  onAdd: (product: CatalogSearchProduct, variant: CatalogSearchVariant) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
  buttonRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>;
}) {
  let buttonIndex = -1;
  return (
    <div className={styles.searchResults} id="quick-order-product-results" role="listbox" aria-label="Katalog arama sonuçları">
      {products.map((product) => (
        <section key={product.title} className={styles.searchProduct}>
          <div className={styles.searchProductTitle}><Package aria-hidden="true" /><strong>{product.title}</strong><span>{product.variants.length} varyant</span></div>
          <div className={styles.variantResults}>{product.variants.map((variant) => {
            buttonIndex += 1;
            const index = buttonIndex;
            return (
              <button
                key={variant.variantId}
                ref={(element) => { buttonRefs.current[index] = element; }}
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => onAdd(product, variant)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <span><strong>{variant.title}</strong><small>{variant.sku ?? "SKU yok"}</small></span>
                <span><b>{money(variant.priceCents)}</b><Plus aria-hidden="true" /></span>
              </button>
            );
          })}</div>
        </section>
      ))}
    </div>
  );
}

function LinkActions({ link, busy, onCopy, onOpen, onDuplicate, onCancel }: {
  link: QuickOrderLinkListItem;
  busy: boolean;
  onCopy: (link: QuickOrderLinkListItem) => void;
  onOpen: (link: QuickOrderLinkListItem) => void;
  onDuplicate: (link: QuickOrderLinkListItem) => void;
  onCancel: (link: QuickOrderLinkListItem) => void;
}) {
  const cancellable = link.status === "active" || link.status === "opened";
  return (
    <div className={styles.linkActions}>
      <button type="button" disabled={busy} onClick={() => onCopy(link)} aria-label="Linki kopyala"><Copy aria-hidden="true" /></button>
      <button type="button" disabled={busy} onClick={() => onOpen(link)} aria-label="Ödeme sayfasını aç"><ExternalLink aria-hidden="true" /></button>
      <button type="button" disabled={busy} onClick={() => onDuplicate(link)} aria-label="Kopyasını oluştur"><Link2 aria-hidden="true" /></button>
      {cancellable ? <button className={styles.dangerAction} type="button" disabled={busy} onClick={() => onCancel(link)} aria-label="Linki iptal et"><XCircle aria-hidden="true" /></button> : null}
    </div>
  );
}

export function QuickOrderLinksConsole() {
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchResults, setSearchResults] = useState<readonly CatalogSearchProduct[]>([]);
  const [searchError, setSearchError] = useState("");
  const [selectedLines, setSelectedLines] = useState<readonly SelectedLine[]>([]);
  const [expiryHours, setExpiryHours] = useState<4 | 12 | 24 | 48 | 72>(24);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState<AddressForm>(EMPTY_ADDRESS);
  const [billingAddress, setBillingAddress] = useState<AddressForm>(EMPTY_ADDRESS);
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [customerNote, setCustomerNote] = useState("");
  const [internalLabel, setInternalLabel] = useState("");
  const [shippingInput, setShippingInput] = useState("0");
  const [discountInput, setDiscountInput] = useState("0");
  const [providerState, setProviderState] = useState<ProviderState>("unknown");
  const [providerError, setProviderError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [formError, setFormError] = useState("");
  const [listState, setListState] = useState<ListState>("loading");
  const [links, setLinks] = useState<readonly QuickOrderLinkListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState("");
  const [busyLinkId, setBusyLinkId] = useState<string>();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const searchSequence = useRef(0);
  const listSequence = useRef(0);

  const shippingCents = cents(shippingInput) ?? 0;
  const discountCents = cents(discountInput) ?? 0;
  const subtotalCents = useMemo(
    () => selectedLines.reduce((total, line) => total + line.unitPriceCents * line.quantity, 0),
    [selectedLines],
  );
  const totalCents = Math.max(0, subtotalCents + shippingCents - discountCents);

  const loadLinks = useCallback(async (cursor?: string) => {
    const sequence = ++listSequence.current;
    if (cursor === undefined) setListState("loading");
    else setLoadingMore(true);
    setListError("");
    try {
      const result = await quickLinkUi.listLinks({ pageSize: 20, ...(cursor === undefined ? {} : { cursor }) });
      if (sequence !== listSequence.current) return;
      setLinks((current) => cursor === undefined ? result.items : Object.freeze([...current, ...result.items]));
      setNextCursor(result.nextCursor);
      setListState("loaded");
    } catch (error) {
      if (sequence !== listSequence.current) return;
      setListError(errorMessage(error, "Linkler yüklenemedi. Lütfen yeniden deneyin."));
      setListState("error");
    } finally {
      if (sequence === listSequence.current) setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadLinks();
    return () => { listSequence.current += 1; };
  }, [loadLinks]);

  useEffect(() => {
    const normalized = query.trim();
    const sequence = ++searchSequence.current;
    resultButtonRefs.current = [];
    if (normalized === "") {
      setSearchState("idle");
      setSearchResults([]);
      setSearchError("");
      return;
    }
    const timeout = window.setTimeout(async () => {
      setSearchState("loading");
      setSearchError("");
      try {
        const result = await quickLinkUi.searchProducts(normalized);
        if (sequence !== searchSequence.current) return;
        setSearchResults(result);
        setSearchState("loaded");
      } catch (error) {
        if (sequence !== searchSequence.current) return;
        setSearchResults([]);
        setSearchError(errorMessage(error, "Ürün araması tamamlanamadı."));
        setSearchState("error");
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  function updateAddress(setter: typeof setShippingAddress, key: keyof AddressForm, value: string) {
    setter((current) => ({ ...current, [key]: value }));
  }

  function addVariant(product: CatalogSearchProduct, variant: CatalogSearchVariant) {
    setSelectedLines((current) => {
      const existing = current.find((line) => line.variantId === variant.variantId);
      if (existing) {
        const maximum = existing.availableQuantity ?? 9_999;
        return Object.freeze(current.map((line) => line.variantId === variant.variantId
          ? Object.freeze({ ...line, quantity: Math.min(maximum, line.quantity + 1) })
          : line));
      }
      return Object.freeze([Object.freeze({
        variantId: variant.variantId,
        productName: product.title,
        variantName: variant.title,
        ...(variant.sku === undefined ? {} : { sku: variant.sku }),
        unitPriceCents: variant.priceCents,
        ...(variant.availableQuantity === undefined ? {} : { availableQuantity: variant.availableQuantity }),
        quantity: 1,
      }), ...current]);
    });
    setFeedback(`${product.title} siparişe eklendi.`);
  }

  function updateQuantity(variantId: string, rawValue: string) {
    const parsed = Number(rawValue);
    setSelectedLines((current) => Object.freeze(current.map((line) => {
      if (line.variantId !== variantId) return line;
      const maximum = line.availableQuantity ?? 9_999;
      return Object.freeze({ ...line, quantity: Math.max(1, Math.min(maximum, Number.isSafeInteger(parsed) ? parsed : 1)) });
    })));
  }

  function removeLine(variantId: string) {
    setSelectedLines((current) => Object.freeze(current.filter((line) => line.variantId !== variantId)));
    searchInputRef.current?.focus();
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("");
      setSearchResults([]);
      searchInputRef.current?.focus();
    } else if (event.key === "ArrowDown" && resultButtonRefs.current[0]) {
      event.preventDefault();
      resultButtonRefs.current[0].focus();
    }
  }

  function handleResultKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Escape") {
      event.preventDefault();
      searchInputRef.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      const target = resultButtonRefs.current[index + offset];
      (target ?? searchInputRef.current)?.focus();
    }
  }

  function resetBuilder() {
    setQuery("");
    setSelectedLines([]);
    setExpiryHours(24);
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setShippingAddress(EMPTY_ADDRESS);
    setBillingAddress(EMPTY_ADDRESS);
    setBillingSameAsShipping(true);
    setCustomerNote("");
    setInternalLabel("");
    setShippingInput("0");
    setDiscountInput("0");
    setFormError("");
    searchInputRef.current?.focus();
  }

  async function activateProvider() {
    setProviderState("activating");
    setProviderError("");
    try {
      await quickLinkUi.activateProvider();
      setProviderState("ready");
      setFeedback("PayTR hızlı ödeme linkleri için hazır.");
    } catch (error) {
      setProviderState("error");
      setProviderError(errorMessage(error, "PayTR hazırlığı doğrulanamadı."));
    }
  }

  async function createLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFeedback("");
    const parsedShipping = cents(shippingInput);
    const parsedDiscount = cents(discountInput);
    if (selectedLines.length === 0) {
      setFormError("En az bir katalog varyantı seçin.");
      searchInputRef.current?.focus();
      return;
    }
    if (parsedShipping === null || parsedDiscount === null) {
      setFormError("Kargo ve indirim tutarlarını en fazla iki ondalık basamakla girin.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await quickLinkUi.createLink({
        items: selectedLines.map((line) => Object.freeze({ variantId: line.variantId, quantity: line.quantity })),
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim(),
        shippingAddress: toAddress(shippingAddress),
        billingAddress: toAddress(billingSameAsShipping ? shippingAddress : billingAddress),
        ...(customerNote.trim() === "" ? {} : { customerNote: customerNote.trim() }),
        ...(internalLabel.trim() === "" ? {} : { internalLabel: internalLabel.trim() }),
        shippingCents: parsedShipping,
        discountCents: parsedDiscount,
        expiryHours,
      });
      setProviderState("ready");
      setFeedback(`Ödeme linki oluşturuldu. ${date(result.expiresAt)} tarihine kadar geçerli.`);
      await navigator.clipboard.writeText(result.url).catch(() => undefined);
      resetBuilder();
      await loadLinks();
    } catch (error) {
      if (error instanceof QuickLinkUiApiError && error.code === "provider_not_ready") setProviderState("not-ready");
      setFormError(errorMessage(error, "Hızlı sipariş linki oluşturulamadı."));
    } finally {
      setSubmitting(false);
    }
  }

  async function withLink(link: QuickOrderLinkListItem, operation: () => Promise<void>) {
    setBusyLinkId(link.id);
    setListError("");
    setFeedback("");
    try { await operation(); }
    catch (error) { setListError(errorMessage(error, "Link işlemi tamamlanamadı.")); }
    finally { setBusyLinkId(undefined); }
  }

  function copyLink(link: QuickOrderLinkListItem) {
    void withLink(link, async () => {
      const result = await quickLinkUi.revealUrl(link.id);
      await navigator.clipboard.writeText(result.url);
      setFeedback("Link panoya kopyalandı.");
    });
  }

  function openLink(link: QuickOrderLinkListItem) {
    const opened = window.open("about:blank", "_blank");
    if (opened === null) {
      setListError("Tarayıcı yeni sekmeyi engelledi. Açılır pencereye izin verip yeniden deneyin.");
      return;
    }
    opened.opener = null;
    void withLink(link, async () => {
      try {
        const result = await quickLinkUi.revealUrl(link.id);
        opened.location.replace(result.url);
        setFeedback("Ödeme sayfası yeni sekmede açıldı.");
      } catch (error) {
        opened.close();
        throw error;
      }
    });
  }

  function duplicateLink(link: QuickOrderLinkListItem) {
    void withLink(link, async () => {
      await quickLinkUi.duplicateLink(link.id);
      await loadLinks();
      setFeedback("Linkin kopyası oluşturuldu.");
    });
  }

  function cancelLink(link: QuickOrderLinkListItem) {
    void withLink(link, async () => {
      try {
        const result = await quickLinkUi.cancelLink(link.id, link.version);
        setLinks((current) => Object.freeze(current.map((item) => item.id === link.id
          ? Object.freeze({ ...item, status: result.status, version: result.version })
          : item)));
        setFeedback("Link iptal edildi.");
      } catch (error) {
        if (error instanceof QuickLinkUiApiError && error.code === "version_conflict") {
          await loadLinks();
          listHeadingRef.current?.focus();
        }
        throw error;
      }
    });
  }

  const searchContent = query.trim() === "" ? null : searchState === "loading" ? (
    <div className={styles.searchState} role="status" aria-live="polite">Ürünler aranıyor…</div>
  ) : searchState === "error" ? (
    <div className={styles.inlineError} role="alert">{searchError}</div>
  ) : searchState === "loaded" && searchResults.length === 0 ? (
    <div className={styles.searchState}>Sonuç bulunamadı.</div>
  ) : searchResults.length > 0 ? (
    <SearchResults products={searchResults} onAdd={addVariant} onKeyDown={handleResultKeyDown} buttonRefs={resultButtonRefs} />
  ) : null;

  return (
    <PanelPageShell>
      <PanelPageHeader title="Hızlı Sipariş Linkleri" description="Gerçek katalog ürünlerinden süreli bir PayTR ödeme bağlantısı hazırlayın." />
      <form className={styles.console} data-presentation="hemenaku-quick-order" onSubmit={createLink}>
        {feedback ? <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p> : null}
        {formError ? <p className={styles.formError} role="alert">{formError}</p> : null}

        <div className={styles.builderGrid}>
          <div className={styles.mainColumn}>
            <Panel title="Sipariş Detayı" id="quick-order-detail-title">
              <div className={styles.panelBody}>
                <div className={styles.searchRow}>
                  <label className={styles.searchField}>
                    <span className="sr-only">Ürün ara</span>
                    <Search aria-hidden="true" />
                    <input
                      ref={searchInputRef}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Ürün ara…"
                      maxLength={100}
                      autoComplete="off"
                      aria-controls="quick-order-product-results"
                      aria-expanded={searchResults.length > 0}
                    />
                  </label>
                  <label className={styles.field}><span>Link geçerliliği</span><select value={expiryHours} onChange={(event) => setExpiryHours(Number(event.target.value) as typeof expiryHours)}>{EXPIRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} · TRY</option>)}</select></label>
                </div>
                {searchContent}
                <section className={styles.selectedLines} aria-label="Seçilen sipariş kalemleri">
                  {selectedLines.length === 0 ? (
                    <div className={styles.linesEmpty}><Package aria-hidden="true" /><strong>Siparişleriniz burada gösterilecek</strong><p>Hızlı ödeme linkine eklenecek kalemleri gerçek katalogdan seçin.</p></div>
                  ) : selectedLines.map((line) => (
                    <article key={line.variantId} className={styles.selectedLine}>
                      <div className={styles.lineIdentity}><Package aria-hidden="true" /><span><strong>{line.productName}</strong><small>{line.variantName}{line.sku ? ` · ${line.sku}` : ""}</small></span></div>
                      <label><span>Adet</span><input type="number" min={1} max={line.availableQuantity ?? 9_999} value={line.quantity} onChange={(event) => updateQuantity(line.variantId, event.target.value)} /></label>
                      <div className={styles.linePrice}><span>Birim fiyat</span><strong>{money(line.unitPriceCents)}</strong><small>{money(line.unitPriceCents * line.quantity)}</small></div>
                      <button type="button" className={styles.removeLine} onClick={() => removeLine(line.variantId)} aria-label={`${line.productName} satırını kaldır`}><Trash2 aria-hidden="true" /></button>
                    </article>
                  ))}
                </section>
              </div>
            </Panel>

            <Panel title="Müşteri" id="quick-order-customer-title">
              <div className={styles.panelBody}>
                <p className={styles.helpText}>Alıcı bilgilerini elle girin.</p>
                <div className={styles.customerGrid}>
                  <label><span>Ad soyad</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} autoComplete="name" maxLength={200} required /></label>
                  <label><span>E-posta</span><input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} autoComplete="email" maxLength={320} required /></label>
                  <label><span>Telefon</span><input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} autoComplete="tel" maxLength={32} required /></label>
                </div>
              </div>
            </Panel>

            <Panel title="Teslimat Bilgileri" id="quick-order-shipping-title">
              <div className={styles.panelBody}>
                <AddressFields prefix="shipping" value={shippingAddress} onChange={(key, value) => updateAddress(setShippingAddress, key, value)} />
                <label className={styles.checkboxRow}><input type="checkbox" checked={billingSameAsShipping} onChange={(event) => setBillingSameAsShipping(event.target.checked)} /><span>Fatura adresi teslimat adresi ile aynı</span></label>
                {!billingSameAsShipping ? <div className={styles.billingBlock}><h3>Fatura adresi</h3><AddressFields prefix="billing" value={billingAddress} onChange={(key, value) => updateAddress(setBillingAddress, key, value)} /></div> : null}
              </div>
            </Panel>
          </div>

          <aside className={styles.summaryColumn}>
            <Panel title="Sipariş Özeti" id="quick-order-summary-title">
              <div className={styles.summaryBody}>
                <dl className={styles.totals}>
                  <div><dt>Ara Toplam</dt><dd>{money(subtotalCents)}</dd></div>
                  <div><dt>Kargo</dt><dd>{money(shippingCents)}</dd></div>
                  <div><dt>İndirim</dt><dd>− {money(discountCents)}</dd></div>
                  <div><dt>Toplam</dt><dd>{money(totalCents)}</dd></div>
                </dl>
                <label className={styles.field}><span>Kargo (TRY)</span><input inputMode="decimal" value={shippingInput} onChange={(event) => setShippingInput(event.target.value)} /></label>
                <label className={styles.field}><span>İndirim (TRY)</span><input inputMode="decimal" value={discountInput} onChange={(event) => setDiscountInput(event.target.value)} /></label>
                <button className={styles.primaryButton} type="submit" disabled={submitting}>{submitting ? "Oluşturuluyor…" : "Ödeme linki oluştur"}</button>
                <button className={styles.secondaryButton} type="button" onClick={resetBuilder}>Temizle</button>
              </div>
            </Panel>

            <Panel title="Müşteri Notu" id="quick-order-note-title">
              <div className={styles.panelBody}><label className={styles.field}><span>Müşterinin ödeme ekranında göreceği not</span><textarea value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} rows={5} maxLength={2_000} /></label></div>
            </Panel>

            <Panel title="Dahili Etiket" id="quick-order-label-title">
              <div className={styles.panelBody}><label className={styles.field}><span>Yalnızca mağaza ekibi görür</span><input value={internalLabel} onChange={(event) => setInternalLabel(event.target.value)} maxLength={200} /></label></div>
            </Panel>

            <Panel title="Ödeme Yöntemi" id="quick-order-provider-title">
              <div className={styles.providerBody}>
                <div className={styles.providerHeading}><span className={styles.providerMark}>P</span><div><strong>PayTR</strong><small>Sunucu, link oluşturulurken güncel hazırlığı doğrular.</small></div></div>
                <p className={styles[`provider-${providerState}`]} role={providerState === "error" ? "alert" : "status"}>
                  {providerState === "ready" ? "PayTR hazır" : providerState === "activating" ? "PayTR hazırlanıyor…" : providerState === "not-ready" ? "PayTR henüz hazır değil" : providerState === "error" ? providerError : "PayTR durumu henüz doğrulanmadı"}
                </p>
                {providerState !== "ready" ? <button className={styles.secondaryButton} type="button" disabled={providerState === "activating"} onClick={() => { void activateProvider(); }}>{providerState === "activating" ? "Hazırlanıyor…" : "PayTR’yi doğrula ve hazırla"}</button> : null}
              </div>
            </Panel>
          </aside>
        </div>
      </form>

      <Panel
        title="Oluşturulan Linkler"
        id="quick-order-links-title"
        actions={<button className={styles.refreshButton} type="button" onClick={() => { void loadLinks(); }}><RefreshCw aria-hidden="true" />Yenile</button>}
      >
        <div className={styles.linksBody}>
          <h3 ref={listHeadingRef} tabIndex={-1} className="sr-only">Hızlı sipariş linki sonuçları</h3>
          {listError && listState !== "error" ? <p className={styles.inlineError} role="alert">{listError}</p> : null}
          {listState === "loading" ? (
            <div className={styles.listState} role="status" aria-live="polite">Linkler yükleniyor…</div>
          ) : listState === "error" ? (
            <div className={styles.listError} role="alert"><div><strong>Linkler yüklenemedi</strong><p>{listError}</p></div><button type="button" onClick={() => { void loadLinks(); }}>Tekrar dene</button></div>
          ) : links.length === 0 ? (
            <div className={styles.listState}>Henüz hızlı sipariş linki oluşturulmadı.</div>
          ) : (
            <>
              <div className={styles.desktopTable}>
                <table aria-label="Oluşturulan hızlı sipariş linkleri">
                  <thead><tr><th>Müşteri</th><th>Ürün</th><th>Durum</th><th>Geçerlilik</th><th>Toplam</th><th>Aksiyon</th></tr></thead>
                  <tbody>{links.map((link) => <tr key={link.id}>
                    <td><strong>{link.customerName}</strong><small>{link.customerEmail}</small></td>
                    <td><strong>{link.firstProductName}</strong><small>{link.itemCount > 1 ? `+ ${link.itemCount - 1} ürün` : "1 ürün"}</small></td>
                    <td><PanelStatusBadge tone={tone(link.status)}>{STATUS_LABELS[link.status]}</PanelStatusBadge></td>
                    <td>{date(link.expiresAt)}</td>
                    <td><strong>{money(link.totalCents)}</strong></td>
                    <td><LinkActions link={link} busy={busyLinkId === link.id} onCopy={copyLink} onOpen={openLink} onDuplicate={duplicateLink} onCancel={cancelLink} /></td>
                  </tr>)}</tbody>
                </table>
              </div>
              <div className={styles.mobileCards}>{links.map((link) => <article className={styles.linkCard} key={link.id}>
                <div className={styles.cardHeading}><div><strong>{link.customerName}</strong><small>{link.customerEmail}</small></div><PanelStatusBadge tone={tone(link.status)}>{STATUS_LABELS[link.status]}</PanelStatusBadge></div>
                <dl><div><dt>Ürün</dt><dd>{link.firstProductName}{link.itemCount > 1 ? ` + ${link.itemCount - 1}` : ""}</dd></div><div><dt>Geçerlilik</dt><dd>{date(link.expiresAt)}</dd></div><div><dt>Toplam</dt><dd>{money(link.totalCents)}</dd></div></dl>
                <LinkActions link={link} busy={busyLinkId === link.id} onCopy={copyLink} onOpen={openLink} onDuplicate={duplicateLink} onCancel={cancelLink} />
              </article>)}</div>
              {nextCursor ? <button className={styles.loadMore} type="button" disabled={loadingMore} onClick={() => { void loadLinks(nextCursor); }}>{loadingMore ? "Yükleniyor…" : "Daha fazla yükle"}</button> : null}
            </>
          )}
        </div>
      </Panel>
    </PanelPageShell>
  );
}
