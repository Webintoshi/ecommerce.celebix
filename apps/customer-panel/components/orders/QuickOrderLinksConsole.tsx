"use client";

import {
  Check,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  Link2,
  Mail,
  MapPin,
  Minus,
  Package,
  Percent,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CustomerDetail,
  CustomerListItem,
  QuickOrderAddress,
  QuickOrderLinkListItem,
  QuickOrderLinkStatus,
} from "@celebix/saas-contracts";

import { PanelPageHeader, PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { CustomerApiError, customerApi } from "@/lib/customer-ui/client";
import {
  QuickLinkUiApiError,
  quickLinkUi,
  type CatalogSearchProduct,
  type CatalogSearchVariant,
  type QuickLinkPaymentMethod,
} from "@/lib/quick-link-ui/client";
import styles from "./quick-order-links.module.css";

type ListState = "loading" | "loaded" | "error";
type SearchState = "idle" | "loading" | "loaded" | "error";
type CustomerSearchState = "idle" | "loading" | "loaded" | "selecting" | "error";
type ProviderState = "unknown" | "activating" | "ready" | "not-ready" | "error";
type FormFieldErrors = Partial<Record<"items" | "paymentMethod" | "identity" | "shipping" | "discount", string>>;

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
  itemType?: "PHYSICAL" | "VIRTUAL";
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

function singleLine(value: string) {
  return value.trim().replace(/[\t\r\n]+/g, " ").replace(/ {2,}/g, " ");
}

function toAddress(value: AddressForm): Readonly<QuickOrderAddress> {
  return Object.freeze({
    recipientName: singleLine(value.recipientName),
    phone: singleLine(value.phone),
    line1: singleLine(value.line1),
    ...(singleLine(value.line2) === "" ? {} : { line2: singleLine(value.line2) }),
    ...(singleLine(value.district) === "" ? {} : { district: singleLine(value.district) }),
    city: singleLine(value.city),
    ...(singleLine(value.postalCode) === "" ? {} : { postalCode: singleLine(value.postalCode) }),
    country: value.country.trim().toUpperCase(),
  });
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof QuickLinkUiApiError ? error.message : fallback;
}

function customerErrorMessage(error: unknown) {
  return error instanceof CustomerApiError ? error.message : "Müşteri araması tamamlanamadı.";
}

function tone(status: QuickOrderLinkStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "paid") return "success";
  if (status === "cancelled") return "danger";
  if (status === "active" || status === "expired") return "warning";
  return "neutral";
}

function Panel({ title, description, icon, children, actions, id }: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeading}>
          {icon ? <span className={styles.panelIcon}>{icon}</span> : null}
          <div><h2 id={id}>{title}</h2>{description ? <p>{description}</p> : null}</div>
        </div>
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
  const variantCount = products.reduce((total, product) => total + product.variants.length, 0);
  return (
    <div className={styles.searchResults} id="quick-order-product-results">
      <div className={styles.resultSummary}><span>Katalog sonuçları</span><strong>{variantCount} seçenek</strong></div>
      <ul aria-label="Katalog arama sonuçları">
      {products.map((product) => (
        <li key={product.variants[0]?.variantId ?? product.title} className={styles.searchProduct}>
          <div className={styles.searchProductTitle}><Package aria-hidden="true" /><strong>{product.title}</strong><span>{product.variants.length} varyant</span></div>
          <div className={styles.variantResults}>{product.variants.map((variant) => {
            buttonIndex += 1;
            const index = buttonIndex;
            return (
              <button
                key={variant.variantId}
                ref={(element) => { buttonRefs.current[index] = element; }}
                type="button"
                onClick={() => onAdd(product, variant)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <span><strong>{variant.title}</strong><small>{variant.sku ?? "SKU yok"}</small></span>
                <span className={styles.variantMeta}>
                  {variant.availableQuantity === undefined ? null : <small>{variant.availableQuantity.toLocaleString("tr-TR")} stok</small>}
                  <b>{money(variant.priceCents)}</b>
                  <span className={styles.addVariantIcon}><Plus aria-hidden="true" /></span>
                </span>
              </button>
            );
          })}</div>
        </li>
      ))}
      </ul>
    </div>
  );
}

function customerAddress(customer: CustomerDetail): AddressForm | null {
  const address = customer.addresses.find((item) => item.isDefault) ?? customer.addresses[0];
  if (!address) return null;
  return {
    recipientName: address.recipientName || customer.displayName,
    phone: customer.phone ?? "",
    line1: address.line1,
    line2: address.line2 ?? "",
    district: address.district ?? "",
    city: address.city,
    postalCode: address.postalCode ?? "",
    country: address.country,
  };
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
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerSearchState, setCustomerSearchState] = useState<CustomerSearchState>("idle");
  const [customerResults, setCustomerResults] = useState<readonly CustomerListItem[]>([]);
  const [customerSearchError, setCustomerSearchError] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
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
  const [paymentMethods, setPaymentMethods] = useState<readonly QuickLinkPaymentMethod[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [identityNumber, setIdentityNumber] = useState("");
  const [paymentMethodsError, setPaymentMethodsError] = useState("");
  const [providerState, setProviderState] = useState<ProviderState>("unknown");
  const [providerError, setProviderError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});
  const [listState, setListState] = useState<ListState>("loading");
  const [links, setLinks] = useState<readonly QuickOrderLinkListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState("");
  const [paginationError, setPaginationError] = useState("");
  const [busyLinkId, setBusyLinkId] = useState<string>();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const customerSearchInputRef = useRef<HTMLInputElement>(null);
  const customerResultButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const searchSequence = useRef(0);
  const customerSearchSequence = useRef(0);
  const activeSearchAbort = useRef<AbortController | undefined>(undefined);
  const listSequence = useRef(0);
  const createRetry = useRef<Readonly<{ fingerprint: string; operationId: string }> | undefined>(undefined);
  const renderedSearchSequence = searchSequence.current;
  const renderedCustomerSearchSequence = customerSearchSequence.current;

  const shippingCents = cents(shippingInput) ?? 0;
  const discountCents = cents(discountInput) ?? 0;
  const subtotalCents = useMemo(
    () => selectedLines.reduce((total, line) => total + line.unitPriceCents * line.quantity, 0),
    [selectedLines],
  );
  const totalCents = subtotalCents + shippingCents - discountCents;
  const selectedPaymentMethod = paymentMethods.find((method) => method.id === selectedPaymentMethodId);
  const hostedPickerAvailable = typeof quickLinkUi.listPaymentMethods === "function";

  useEffect(() => {
    if (!hostedPickerAvailable) return;
    let active = true;
    void quickLinkUi.listPaymentMethods().then((methods) => {
      if (!active) return;
      setPaymentMethods(methods);
      setPaymentMethodsError("");
    }, (error) => {
      if (!active) return;
      setPaymentMethods([]);
      setPaymentMethodsError(errorMessage(error, "Ödeme yöntemleri yüklenemedi."));
    });
    return () => { active = false; };
  }, [hostedPickerAvailable]);

  const loadLinks = useCallback(async (cursor?: string) => {
    const sequence = ++listSequence.current;
    if (cursor === undefined) {
      setListState("loading");
      setListError("");
    } else {
      setLoadingMore(true);
      setPaginationError("");
    }
    try {
      const result = await quickLinkUi.listLinks({ pageSize: 20, ...(cursor === undefined ? {} : { cursor }) });
      if (sequence !== listSequence.current) return;
      setLinks((current) => cursor === undefined ? result.items : Object.freeze([...current, ...result.items]));
      setNextCursor(result.nextCursor);
      setListState("loaded");
      setPaginationError("");
    } catch (error) {
      if (sequence !== listSequence.current) return;
      const message = errorMessage(error, "Linkler yüklenemedi. Lütfen yeniden deneyin.");
      if (cursor === undefined) {
        setListError(message);
        setListState("error");
      } else {
        setPaginationError(message);
      }
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
    const sequence = renderedSearchSequence;
    resultButtonRefs.current = [];
    if (normalized === "") {
      setSearchState("idle");
      setSearchResults([]);
      setSearchError("");
      return;
    }
    const controller = new AbortController();
    activeSearchAbort.current = controller;
    setSearchResults([]);
    setSearchState("loading");
    setSearchError("");
    const timeout = window.setTimeout(async () => {
      try {
        const result = await quickLinkUi.searchProducts(normalized, { signal: controller.signal });
        if (sequence !== searchSequence.current) return;
        setSearchResults(result);
        setSearchState("loaded");
      } catch (error) {
        if (sequence !== searchSequence.current || controller.signal.aborted) return;
        setSearchResults([]);
        setSearchError(errorMessage(error, "Ürün araması tamamlanamadı."));
        setSearchState("error");
      }
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      if (activeSearchAbort.current === controller) activeSearchAbort.current = undefined;
    };
  }, [query, renderedSearchSequence]);

  useEffect(() => {
    const normalized = customerQuery.trim();
    const sequence = renderedCustomerSearchSequence;
    customerResultButtonRefs.current = [];
    if (normalized.length < 2) {
      setCustomerSearchState("idle");
      setCustomerResults([]);
      setCustomerSearchError("");
      return;
    }
    setCustomerSearchState("loading");
    setCustomerResults([]);
    setCustomerSearchError("");
    const timeout = window.setTimeout(async () => {
      try {
        const result = await customerApi.list({ pageSize: 8, search: normalized });
        if (sequence !== customerSearchSequence.current) return;
        setCustomerResults(result.items);
        setCustomerSearchState("loaded");
      } catch (error) {
        if (sequence !== customerSearchSequence.current) return;
        setCustomerResults([]);
        setCustomerSearchError(customerErrorMessage(error));
        setCustomerSearchState("error");
      }
    }, 300);
    return () => { window.clearTimeout(timeout); };
  }, [customerQuery, renderedCustomerSearchSequence]);

  function changeSearchQuery(value: string) {
    searchSequence.current += 1;
    activeSearchAbort.current?.abort();
    activeSearchAbort.current = undefined;
    resultButtonRefs.current = [];
    setSearchResults([]);
    setSearchError("");
    setSearchState(value.trim() === "" ? "idle" : "loading");
    setQuery(value);
  }

  function changeCustomerQuery(value: string) {
    customerSearchSequence.current += 1;
    customerResultButtonRefs.current = [];
    setCustomerResults([]);
    setCustomerSearchError("");
    setCustomerSearchState(value.trim().length < 2 ? "idle" : "loading");
    setCustomerQuery(value);
  }

  async function selectCustomer(customer: CustomerListItem) {
    const sequence = ++customerSearchSequence.current;
    setCustomerSearchState("selecting");
    setCustomerSearchError("");
    try {
      const detail = await customerApi.get(customer.id);
      if (sequence !== customerSearchSequence.current) return;
      const address = customerAddress(detail);
      setSelectedCustomer(detail);
      setCustomerName(detail.displayName);
      setCustomerEmail(detail.email ?? "");
      setCustomerPhone(detail.phone ?? "");
      setShippingAddress(address ?? {
        ...EMPTY_ADDRESS,
        recipientName: detail.displayName,
        phone: detail.phone ?? "",
      });
      setBillingAddress(EMPTY_ADDRESS);
      setBillingSameAsShipping(true);
      setCustomerQuery("");
      setCustomerResults([]);
      setCustomerSearchState("idle");
      setFeedback(`${detail.displayName} müşteri bilgileri forma aktarıldı.`);
    } catch (error) {
      if (sequence !== customerSearchSequence.current) return;
      setCustomerSearchError(customerErrorMessage(error));
      setCustomerSearchState("error");
    }
  }

  function clearSelectedCustomer() {
    customerSearchSequence.current += 1;
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerResults([]);
    setCustomerSearchState("idle");
    setCustomerSearchError("");
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setShippingAddress(EMPTY_ADDRESS);
    setBillingAddress(EMPTY_ADDRESS);
    setBillingSameAsShipping(true);
    customerSearchInputRef.current?.focus();
  }

  function updateAddress(setter: typeof setShippingAddress, key: keyof AddressForm, value: string) {
    setter((current) => ({ ...current, [key]: value }));
  }

  function addVariant(product: CatalogSearchProduct, variant: CatalogSearchVariant) {
    const existing = selectedLines.some((line) => line.variantId === variant.variantId);
    if (!existing && selectedLines.length >= 100) {
      setFieldErrors((current) => ({ ...current, items: "En fazla 100 farklı katalog varyantı ekleyebilirsiniz." }));
      setFeedback("");
      return;
    }
    setFieldErrors((current) => {
      const { items: _items, ...remaining } = current;
      return remaining;
    });
    setSelectedLines((current) => {
      const selected = current.find((line) => line.variantId === variant.variantId);
      if (selected) {
        const maximum = selected.availableQuantity ?? 9_999;
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

  function stepQuantity(variantId: string, delta: number) {
    setSelectedLines((current) => Object.freeze(current.map((line) => {
      if (line.variantId !== variantId) return line;
      const maximum = line.availableQuantity ?? 9_999;
      return Object.freeze({ ...line, quantity: Math.max(1, Math.min(maximum, line.quantity + delta)) });
    })));
  }

  function updateItemType(variantId: string, rawValue: string) {
    const itemType = rawValue === "PHYSICAL" || rawValue === "VIRTUAL" ? rawValue : undefined;
    setSelectedLines((current) => Object.freeze(current.map((line) => line.variantId === variantId
      ? Object.freeze({ ...line, itemType })
      : line)));
    setFieldErrors((current) => {
      const { items: _items, ...remaining } = current;
      return remaining;
    });
  }

  function removeLine(variantId: string) {
    setSelectedLines((current) => Object.freeze(current.filter((line) => line.variantId !== variantId)));
    searchInputRef.current?.focus();
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      changeSearchQuery("");
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

  function handleCustomerSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      changeCustomerQuery("");
      customerSearchInputRef.current?.focus();
    } else if (event.key === "ArrowDown" && customerResultButtonRefs.current[0]) {
      event.preventDefault();
      customerResultButtonRefs.current[0].focus();
    }
  }

  function handleCustomerResultKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Escape") {
      event.preventDefault();
      customerSearchInputRef.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      const target = customerResultButtonRefs.current[index + offset];
      (target ?? customerSearchInputRef.current)?.focus();
    }
  }

  function resetBuilder() {
    changeSearchQuery("");
    customerSearchSequence.current += 1;
    setCustomerQuery("");
    setCustomerSearchState("idle");
    setCustomerResults([]);
    setCustomerSearchError("");
    setSelectedCustomer(null);
    createRetry.current = undefined;
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
    setIdentityNumber("");
    setFormError("");
    setFieldErrors({});
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
    const nextFieldErrors: FormFieldErrors = {};
    if (selectedLines.length === 0) {
      nextFieldErrors.items = "En az bir katalog varyantı seçin.";
    }
    if (parsedShipping === null) nextFieldErrors.shipping = "Kargo tutarını en fazla iki ondalık basamakla girin.";
    if (parsedDiscount === null) nextFieldErrors.discount = "İndirim tutarını en fazla iki ondalık basamakla girin.";
    if (parsedShipping !== null && parsedDiscount !== null && parsedDiscount > subtotalCents + parsedShipping) {
      nextFieldErrors.discount = "İndirim, ara toplam ile kargo toplamını aşamaz.";
    }
    if (hostedPickerAvailable && selectedPaymentMethod === undefined) {
      nextFieldErrors.paymentMethod = "Aktif bir ödeme yöntemi seçin.";
    }
    if (selectedPaymentMethod?.requiresIdentity && !/^\d{5,50}$/.test(identityNumber)) {
      nextFieldErrors.identity = "Geçerli kimlik numarasını yalnız rakamlarla girin.";
    }
    if (selectedPaymentMethod?.requiresItemType && selectedLines.some((line) => line.itemType === undefined)) {
      nextFieldErrors.items = "Her sipariş kalemi için fiziksel veya dijital ürün tipini seçin.";
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      if (nextFieldErrors.items) searchInputRef.current?.focus();
      return;
    }
    if (parsedShipping === null || parsedDiscount === null) return;
    setSubmitting(true);
    try {
      const intent = {
        items: selectedLines.map((line) => Object.freeze({
          variantId: line.variantId,
          quantity: line.quantity,
          ...(selectedPaymentMethod?.requiresItemType ? { itemType: line.itemType! } : {}),
        })),
        ...(selectedPaymentMethod === undefined ? {} : { paymentMethodId: selectedPaymentMethod.id }),
        ...(selectedPaymentMethod?.requiresIdentity ? { identityNumber } : {}),
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim().toLowerCase(),
        customerPhone: customerPhone.trim(),
        shippingAddress: toAddress(shippingAddress),
        billingAddress: toAddress(billingSameAsShipping ? shippingAddress : billingAddress),
        ...(singleLine(customerNote) === "" ? {} : { customerNote: singleLine(customerNote) }),
        ...(internalLabel.trim() === "" ? {} : { internalLabel: internalLabel.trim() }),
        shippingCents: parsedShipping,
        discountCents: parsedDiscount,
        expiryHours,
      } as const;
      const fingerprint = JSON.stringify(intent);
      if (createRetry.current?.fingerprint !== fingerprint) {
        createRetry.current = Object.freeze({ fingerprint, operationId: quickLinkUi.newCreateOperationId() });
      }
      const result = await quickLinkUi.createLink(intent, createRetry.current.operationId);
      createRetry.current = undefined;
      setProviderState("ready");
      await loadLinks();
      resetBuilder();
      try {
        await navigator.clipboard.writeText(result.url);
        setFeedback(`Ödeme linki oluşturuldu ve panoya kopyalandı. ${date(result.expiresAt)} tarihine kadar geçerli.`);
      } catch {
        setFeedback(`Ödeme linki oluşturuldu ancak panoya kopyalanamadı. ${date(result.expiresAt)} tarihine kadar geçerli.`);
      }
    } catch (error) {
      if (error instanceof QuickLinkUiApiError && error.code === "provider_not_ready") setProviderState("not-ready");
      if (!(error instanceof QuickLinkUiApiError) || (error.code !== "unavailable" && error.code !== "commit_unknown")) {
        createRetry.current = undefined;
      }
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

  const customerSearchContent = customerQuery.trim().length < 2 ? null : customerSearchState === "loading" || customerSearchState === "selecting" ? (
    <div className={styles.customerSearchState} role="status" aria-live="polite">
      {customerSearchState === "selecting" ? "Müşteri bilgileri getiriliyor…" : "Müşteriler aranıyor…"}
    </div>
  ) : customerSearchState === "error" ? (
    <div className={styles.inlineError} role="alert">{customerSearchError}</div>
  ) : customerSearchState === "loaded" && customerResults.length === 0 ? (
    <div className={styles.customerSearchState}>Eşleşen müşteri bulunamadı.</div>
  ) : customerResults.length > 0 ? (
    <div className={styles.customerResults} id="quick-order-customer-results">
      <div className={styles.resultSummary}><span>Kayıtlı müşteriler</span><strong>{customerResults.length} sonuç</strong></div>
      <ul aria-label="Müşteri arama sonuçları">
        {customerResults.map((customer, index) => (
          <li key={customer.id}>
            <button
              ref={(element) => { customerResultButtonRefs.current[index] = element; }}
              type="button"
              onClick={() => { void selectCustomer(customer); }}
              onKeyDown={(event) => handleCustomerResultKeyDown(event, index)}
            >
              <span className={styles.customerResultIcon}><UserRound aria-hidden="true" /></span>
              <span className={styles.customerResultIdentity}>
                <strong>{customer.displayName}</strong>
                <small>{customer.email ?? customer.phone ?? "İletişim bilgisi yok"}</small>
              </span>
              <span className={styles.customerResultMeta}>{customer.orderCount.toLocaleString("tr-TR")} sipariş</span>
              <Plus aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  return (
    <PanelPageShell>
      <PanelPageHeader title="Hızlı Sipariş Linkleri" description="Katalogdan ürün ve müşteri seçerek güvenli, süreli bir ödeme bağlantısı hazırlayın." />
      <form className={styles.console} data-presentation="quick-order-workspace" onSubmit={createLink}>
        {feedback ? <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p> : null}
        {formError ? <p className={styles.formError} role="alert">{formError}</p> : null}

        <div className={styles.builderGrid}>
          <div className={styles.mainColumn}>
            <Panel
              title="Ürünler"
              description="Linke eklenecek gerçek katalog varyantlarını seçin."
              icon={<ShoppingBag aria-hidden="true" />}
              id="quick-order-detail-title"
            >
              <div className={styles.panelBody}>
                <div className={styles.productPicker}>
                  <label className={styles.searchField}>
                    <span className="sr-only">Ürün ara</span>
                    <Search aria-hidden="true" />
                    <input
                      ref={searchInputRef}
                      value={query}
                      onChange={(event) => changeSearchQuery(event.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Ürün adı, varyant veya SKU ile ara"
                      maxLength={100}
                      autoComplete="off"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={searchContent !== null}
                      aria-controls="quick-order-product-results"
                    />
                  </label>
                  {query ? <button type="button" className={styles.clearSearch} onClick={() => changeSearchQuery("")} aria-label="Ürün aramasını temizle"><X aria-hidden="true" /></button> : null}
                  {searchContent ? <div className={styles.pickerPopover}>{searchContent}</div> : null}
                </div>
                <section className={styles.selectedLines} aria-label="Seçilen sipariş kalemleri" aria-describedby={fieldErrors.items ? "quick-order-items-error" : undefined}>
                  <div className={styles.linesHeader}>
                    <div><strong>Seçilen ürünler</strong><span>Varyant, adet ve fiyat özeti</span></div>
                    <span className={styles.itemCount}>{selectedLines.length} kalem</span>
                  </div>
                  {selectedLines.length === 0 ? (
                    <div className={styles.linesEmpty}><span><Package aria-hidden="true" /></span><strong>Henüz ürün eklenmedi</strong><p>Yukarıdaki arama alanından ürün veya varyant seçin.</p></div>
                  ) : selectedLines.map((line) => (
                    <article key={line.variantId} className={styles.selectedLine}>
                      <div className={styles.lineIdentity}><span className={styles.lineIcon}><Package aria-hidden="true" /></span><span><strong>{line.productName}</strong><small>{line.variantName}{line.sku ? ` · ${line.sku}` : ""}</small>{line.availableQuantity === undefined ? null : <em>{line.availableQuantity.toLocaleString("tr-TR")} stok</em>}</span></div>
                      <div className={styles.quantityGroup}>
                        <span>Adet</span>
                        <div className={styles.quantityControl}>
                          <button type="button" onClick={() => stepQuantity(line.variantId, -1)} disabled={line.quantity <= 1} aria-label={`${line.productName} adedini azalt`}><Minus aria-hidden="true" /></button>
                          <input aria-label={`${line.productName} adedi`} type="number" min={1} max={line.availableQuantity ?? 9_999} value={line.quantity} onChange={(event) => updateQuantity(line.variantId, event.target.value)} />
                          <button type="button" onClick={() => stepQuantity(line.variantId, 1)} disabled={line.quantity >= (line.availableQuantity ?? 9_999)} aria-label={`${line.productName} adedini artır`}><Plus aria-hidden="true" /></button>
                        </div>
                      </div>
                      {selectedPaymentMethod?.requiresItemType ? <label><span>Ürün tipi</span><select aria-label={`${line.productName} ürün tipi`} value={line.itemType ?? ""} onChange={(event) => updateItemType(line.variantId, event.target.value)} required><option value="">Seçin</option><option value="PHYSICAL">Fiziksel</option><option value="VIRTUAL">Dijital</option></select></label> : null}
                      <div className={styles.linePrice}><span>{money(line.unitPriceCents)} / adet</span><strong>{money(line.unitPriceCents * line.quantity)}</strong></div>
                      <button type="button" className={styles.removeLine} onClick={() => removeLine(line.variantId)} aria-label={`${line.productName} satırını kaldır`}><Trash2 aria-hidden="true" /></button>
                    </article>
                  ))}
                </section>
                {fieldErrors.items ? <p id="quick-order-items-error" className={styles.inlineError} role="alert">{fieldErrors.items}</p> : null}
              </div>
            </Panel>

            <Panel
              title="Müşteri"
              description="Kayıtlı müşteriyi seçin veya bilgileri manuel girin."
              icon={<UserRound aria-hidden="true" />}
              id="quick-order-customer-title"
            >
              <div className={styles.panelBody}>
                <div className={styles.customerPicker}>
                  <label className={styles.searchField}>
                    <span className="sr-only">Kayıtlı müşteri ara</span>
                    <Search aria-hidden="true" />
                    <input
                      ref={customerSearchInputRef}
                      value={customerQuery}
                      onChange={(event) => changeCustomerQuery(event.target.value)}
                      onKeyDown={handleCustomerSearchKeyDown}
                      placeholder="Ad, e-posta veya telefon ile müşteri ara"
                      maxLength={120}
                      autoComplete="off"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={customerSearchContent !== null}
                      aria-controls="quick-order-customer-results"
                    />
                  </label>
                  {customerQuery ? <button type="button" className={styles.clearSearch} onClick={() => changeCustomerQuery("")} aria-label="Müşteri aramasını temizle"><X aria-hidden="true" /></button> : null}
                  {customerQuery.trim().length === 1 ? <p className={styles.searchHint}>Aramak için en az 2 karakter girin.</p> : null}
                  {customerSearchContent ? <div className={styles.pickerPopover}>{customerSearchContent}</div> : null}
                </div>

                {selectedCustomer ? (
                  <div className={styles.selectedCustomer}>
                    <span className={styles.selectedCustomerIcon}><Check aria-hidden="true" /></span>
                    <div>
                      <strong>{selectedCustomer.displayName}</strong>
                      <span>
                        {selectedCustomer.email ? <small><Mail aria-hidden="true" />{selectedCustomer.email}</small> : null}
                        {selectedCustomer.phone ? <small><Phone aria-hidden="true" />{selectedCustomer.phone}</small> : null}
                      </span>
                    </div>
                    <button type="button" onClick={clearSelectedCustomer} aria-label="Seçili müşteriyi kaldır"><X aria-hidden="true" /></button>
                  </div>
                ) : null}

                <div className={styles.formDivider}><span>İletişim bilgileri</span></div>
                <div className={styles.customerGrid}>
                  <label><span>Ad soyad</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} autoComplete="name" maxLength={200} required /></label>
                  <label><span>E-posta</span><input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} autoComplete="email" maxLength={320} required /></label>
                  <label><span>Telefon</span><input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} autoComplete="tel" maxLength={32} required /></label>
                </div>
              </div>
            </Panel>

            <Panel
              title="Teslimat"
              description="Gönderim ve fatura adresini düzenleyin."
              icon={<MapPin aria-hidden="true" />}
              id="quick-order-shipping-title"
            >
              <div className={styles.panelBody}>
                <AddressFields prefix="shipping" value={shippingAddress} onChange={(key, value) => updateAddress(setShippingAddress, key, value)} />
                <label className={styles.checkboxRow}><input type="checkbox" checked={billingSameAsShipping} onChange={(event) => setBillingSameAsShipping(event.target.checked)} /><span>Fatura adresi teslimat adresi ile aynı</span></label>
                {!billingSameAsShipping ? <div className={styles.billingBlock}><h3>Fatura adresi</h3><AddressFields prefix="billing" value={billingAddress} onChange={(key, value) => updateAddress(setBillingAddress, key, value)} /></div> : null}
              </div>
            </Panel>
          </div>

          <aside className={styles.summaryColumn}>
            <section className={styles.summaryWorkspace} aria-labelledby="quick-order-summary-title">
              <div className={styles.summaryHeader}>
                <span><ShoppingBag aria-hidden="true" /></span>
                <div><h2 id="quick-order-summary-title">Sipariş Özeti</h2><p>{selectedLines.length} kalem · {selectedLines.reduce((total, line) => total + line.quantity, 0)} ürün</p></div>
              </div>

              <div className={styles.summarySection}>
                <label className={styles.expiryField}>
                  <span><Clock3 aria-hidden="true" />Link geçerliliği</span>
                  <select value={expiryHours} onChange={(event) => setExpiryHours(Number(event.target.value) as typeof expiryHours)}>{EXPIRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                </label>
              </div>

              <div className={styles.summarySection}>
                <dl className={styles.totals}>
                  <div><dt>Ara toplam</dt><dd>{money(subtotalCents)}</dd></div>
                  <div><dt>Kargo</dt><dd>{money(shippingCents)}</dd></div>
                  <div><dt>İndirim</dt><dd>− {money(discountCents)}</dd></div>
                  <div className={styles.grandTotal}><dt>Toplam</dt><dd>{money(totalCents)}</dd></div>
                </dl>
                <div className={styles.amountGrid}>
                  <label className={styles.field}><span><Truck aria-hidden="true" />Kargo (TRY)</span><input inputMode="decimal" value={shippingInput} onChange={(event) => { setShippingInput(event.target.value); setFieldErrors((current) => { const { shipping: _shipping, ...remaining } = current; return remaining; }); }} aria-invalid={fieldErrors.shipping ? true : undefined} aria-describedby={fieldErrors.shipping ? "quick-order-shipping-error" : undefined} />{fieldErrors.shipping ? <small id="quick-order-shipping-error" className={styles.fieldError} role="alert">{fieldErrors.shipping}</small> : null}</label>
                  <label className={styles.field}><span><Percent aria-hidden="true" />İndirim (TRY)</span><input inputMode="decimal" value={discountInput} onChange={(event) => { setDiscountInput(event.target.value); setFieldErrors((current) => { const { discount: _discount, ...remaining } = current; return remaining; }); }} aria-invalid={fieldErrors.discount ? true : undefined} aria-describedby={fieldErrors.discount ? "quick-order-discount-error" : undefined} />{fieldErrors.discount ? <small id="quick-order-discount-error" className={styles.fieldError} role="alert">{fieldErrors.discount}</small> : null}</label>
                </div>
              </div>

              <div className={styles.summarySection}>
                <div className={styles.summarySectionTitle}><CreditCard aria-hidden="true" /><div><h3>Ödeme</h3><p>Bağlantıda kullanılacak yöntemi seçin.</p></div></div>
                <div className={styles.providerBody}>
                {hostedPickerAvailable ? <>
                  <label className={styles.field}><span>Aktif ödeme yöntemi</span><select aria-label="Ödeme yöntemi" value={selectedPaymentMethodId} onChange={(event) => { setSelectedPaymentMethodId(event.target.value); setIdentityNumber(""); setSelectedLines((current) => Object.freeze(current.map((line) => Object.freeze({ ...line, itemType: undefined })))); setFieldErrors((current) => { const { paymentMethod: _method, identity: _identity, ...remaining } = current; return remaining; }); }} required><option value="">Ödeme yöntemi seçin</option>{paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.label}</option>)}</select>{fieldErrors.paymentMethod ? <small className={styles.fieldError} role="alert">{fieldErrors.paymentMethod}</small> : null}</label>
                  {paymentMethodsError ? <p className={styles.inlineError} role="alert">{paymentMethodsError}</p> : null}
                  {selectedPaymentMethod?.requiresIdentity ? <label className={styles.field}><span>Alıcı kimlik numarası</span><input aria-label="Alıcı kimlik numarası" inputMode="numeric" autoComplete="off" value={identityNumber} onChange={(event) => { setIdentityNumber(event.target.value.trim()); setFieldErrors((current) => { const { identity: _identity, ...remaining } = current; return remaining; }); }} minLength={5} maxLength={50} pattern="[0-9]+" required />{fieldErrors.identity ? <small className={styles.fieldError} role="alert">{fieldErrors.identity}</small> : null}</label> : null}
                  <p className={styles.helpText}>Yalnız etkin ve bu mağazaya bağlı yöntemler listelenir; sağlayıcı yetkisi sunucuda doğrulanır.</p>
                </> : <>
                  <div className={styles.providerHeading}><span className={styles.providerMark}>P</span><div><strong>PayTR</strong><small>Sunucu, link oluşturulurken güncel hazırlığı doğrular.</small></div></div>
                  <p className={styles[`provider-${providerState}`]} role={providerState === "error" ? "alert" : "status"}>
                    {providerState === "ready" ? "PayTR hazır" : providerState === "activating" ? "PayTR hazırlanıyor…" : providerState === "not-ready" ? "PayTR henüz hazır değil" : providerState === "error" ? providerError : "PayTR durumu henüz doğrulanmadı"}
                  </p>
                  {providerState !== "ready" ? <button className={styles.secondaryButton} type="button" disabled={providerState === "activating"} onClick={() => { void activateProvider(); }}>{providerState === "activating" ? "Hazırlanıyor…" : "PayTR’yi doğrula ve hazırla"}</button> : null}
                </>}
                </div>
              </div>

              <div className={styles.summarySection}>
                <label className={styles.field}><span><Mail aria-hidden="true" />Müşteri notu</span><textarea value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} rows={3} maxLength={2_000} placeholder="Ödeme ekranında gösterilecek not" /></label>
                <label className={styles.field}><span><Tag aria-hidden="true" />Dahili etiket</span><input value={internalLabel} onChange={(event) => setInternalLabel(event.target.value)} maxLength={200} placeholder="Yalnız mağaza ekibi görür" /></label>
              </div>

              <div className={styles.summaryActions}>
                <button className={styles.primaryButton} type="submit" disabled={submitting}><Link2 aria-hidden="true" />{submitting ? "Oluşturuluyor…" : "Ödeme linki oluştur"}</button>
                <button className={styles.secondaryButton} type="button" onClick={resetBuilder}><Trash2 aria-hidden="true" />Formu temizle</button>
              </div>
            </section>
          </aside>
        </div>
      </form>

      <Panel
        title="Oluşturulan Linkler"
        description="Aktif ve geçmiş ödeme bağlantılarını tek yerden yönetin."
        icon={<Link2 aria-hidden="true" />}
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
              {paginationError && nextCursor ? <div className={styles.paginationError} role="alert"><span>{paginationError}</span><button type="button" onClick={() => { void loadLinks(nextCursor); }}>Sayfayı tekrar dene</button></div> : null}
              {nextCursor && !paginationError ? <button className={styles.loadMore} type="button" disabled={loadingMore} onClick={() => { void loadLinks(nextCursor); }}>{loadingMore ? "Yükleniyor…" : "Daha fazla yükle"}</button> : null}
            </>
          )}
        </div>
      </Panel>
    </PanelPageShell>
  );
}
