"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Copy,
  CreditCard,
  ExternalLink,
  Info,
  Link2,
  Loader2,
  Mail,
  MessageSquareText,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Tag,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { fetchAdminJson } from "@/lib/admin-client-fetch";
import { buildStorefrontUrl } from "@/lib/store-runtime";
import { cn } from "@/lib/utils";

type ProductVariantRecord = {
  id: string;
  name: string;
  price: number;
  sku?: string;
  images?: string[];
};

type ProductSearchRecord = {
  id: string;
  name: string;
  images?: string[];
  variants: ProductVariantRecord[];
};

type PaymentGatewayRecord = {
  id: string;
  name: string;
  description: string;
  gateway: string;
  status: string;
};

type CustomerAddressRecord = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  address?: string | null;
  address_line1?: string | null;
  addressLine?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  is_default?: boolean | null;
};

type CustomerSearchRecord = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  total_orders?: number | string | null;
  total_spent?: number | string | null;
  addresses?: CustomerAddressRecord[];
};

type QuickOrderAddress = {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  city: string;
  district: string;
  postalCode: string;
  country: string;
};

type QuickOrderLine = {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  image?: string | null;
  sku?: string | null;
};

type QuickOrderLinkRecord = {
  id: string;
  token: string;
  status: "active" | "opened" | "paid" | "cancelled" | "expired";
  customer_email: string;
  customer_name: string | null;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  expires_at: string;
  order_id: string | null;
  items: Array<{
    id: string;
    product_name: string;
    variant_name: string | null;
    quantity: number;
    line_total: number;
  }>;
};

const EMPTY_ADDRESS: QuickOrderAddress = {
  firstName: "",
  lastName: "",
  phone: "",
  address: "",
  city: "",
  district: "",
  postalCode: "",
  country: "Türkiye",
};

const STATUS_STYLES: Record<QuickOrderLinkRecord["status"], string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  opened: "border-sky-200 bg-sky-50 text-sky-700",
  paid: "border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]",
  cancelled: "border-rose-200 bg-rose-50 text-rose-700",
  expired: "border-amber-200 bg-amber-50 text-amber-700",
};

const STATUS_LABELS: Record<QuickOrderLinkRecord["status"], string> = {
  active: "Aktif",
  opened: "Açıldı",
  paid: "Ödendi",
  cancelled: "İptal",
  expired: "Süresi doldu",
};

const ADDRESS_FIELDS: Array<{ key: keyof QuickOrderAddress; label: string }> = [
  { key: "firstName", label: "Ad" },
  { key: "lastName", label: "Soyad" },
  { key: "phone", label: "Telefon" },
  { key: "city", label: "Şehir" },
  { key: "district", label: "İlçe" },
  { key: "postalCode", label: "Posta kodu" },
  { key: "country", label: "Ülke" },
];

const EXPIRY_OPTIONS = [
  { value: 4, label: "4 saat geçerli" },
  { value: 12, label: "12 saat geçerli" },
  { value: 24, label: "24 saat geçerli" },
  { value: 48, label: "48 saat geçerli" },
  { value: 72, label: "72 saat geçerli" },
];

function formatPrice(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function makeLineId(productId: string, variantId: string) {
  return `${productId}:${variantId}`;
}

function getCustomerName(customer: CustomerSearchRecord) {
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() || customer.email;
}

function normalizeCustomerAddress(customer: CustomerSearchRecord): QuickOrderAddress {
  const address = customer.addresses?.find((item) => item.is_default) ?? customer.addresses?.[0];

  return {
    firstName: address?.first_name || customer.first_name || "",
    lastName: address?.last_name || customer.last_name || "",
    phone: address?.phone || customer.phone || "",
    address: address?.address || address?.address_line1 || address?.addressLine || "",
    city: address?.city || "",
    district: address?.district || address?.state || "",
    postalCode: address?.postal_code || "",
    country: address?.country || "Türkiye",
  };
}

function buildSavedNote(note: string, internalTag: string) {
  const cleanNote = note.trim();
  const cleanTag = internalTag.trim();

  if (cleanNote && cleanTag) {
    return `${cleanNote}\nEtiket: ${cleanTag}`;
  }

  if (cleanTag) {
    return `Etiket: ${cleanTag}`;
  }

  return cleanNote;
}

function Panel({
  title,
  icon,
  children,
  actions,
  className,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-[7px] border border-[#E1E6EF] bg-white", className)}>
      <div className="flex min-h-[58px] items-center justify-between gap-4 border-b border-[#EEF1F5] px-5 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? <span className="text-[#7B8797]">{icon}</span> : null}
          <h2 className="truncate text-[1.05rem] font-semibold tracking-[-0.03em] text-[#111827]">{title}</h2>
          <Info className="h-4 w-4 shrink-0 text-[#7B8797]" />
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function TextField({
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  id,
  className,
}: {
  value: string | number;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "email" | "number";
  min?: number;
  id?: string;
  className?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      min={min}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={cn(
        "h-11 w-full rounded-[7px] border border-[#E1E6EF] bg-white px-3.5 text-[14px] font-medium text-[#111827] outline-none transition placeholder:text-[#7B8797] focus:border-[#FF6A00] focus:ring-2 focus:ring-[rgba(255,106,0,0.12)]",
        className,
      )}
    />
  );
}

export function QuickOrderLinksPanel() {
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerSearchRecord[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [shippingAddress, setShippingAddress] = useState<QuickOrderAddress>(EMPTY_ADDRESS);
  const [billingAddress, setBillingAddress] = useState<QuickOrderAddress>(EMPTY_ADDRESS);
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [shippingCost, setShippingCost] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [note, setNote] = useState("");
  const [internalTag, setInternalTag] = useState("");
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [lines, setLines] = useState<QuickOrderLine[]>([]);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGatewayRecord[]>([]);
  const [allowedGatewayIds, setAllowedGatewayIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchRecord[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linksLoading, setLinksLoading] = useState(true);
  const [links, setLinks] = useState<QuickOrderLinkRecord[]>([]);

  useEffect(() => {
    if (!billingSameAsShipping) {
      return;
    }

    setBillingAddress(shippingAddress);
  }, [billingSameAsShipping, shippingAddress]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      setLoadingProducts(true);

      try {
        const response = await fetchAdminJson<{
          success: boolean;
          products: ProductSearchRecord[];
        }>(`/api/products?all=true&limit=12&search=${encodeURIComponent(searchQuery.trim())}`, {
          timeoutMs: 12000,
        });

        setSearchResults(response.products || []);
      } catch (error) {
        console.error("Quick order product search failed:", error);
        toast.error("Ürün araması tamamlanamadı.");
      } finally {
        setLoadingProducts(false);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      if (selectedCustomerId) {
        setCustomerResults([]);
        setLoadingCustomers(false);
        return;
      }

      if (!customerSearch.trim()) {
        setCustomerResults([]);
        return;
      }

      setLoadingCustomers(true);

      try {
        const response = await fetchAdminJson<{
          success: boolean;
          customers: CustomerSearchRecord[];
        }>(`/api/customers?limit=8&search=${encodeURIComponent(customerSearch.trim())}`, {
          timeoutMs: 12000,
        });

        setCustomerResults(response.customers || []);
      } catch (error) {
        console.error("Quick order customer search failed:", error);
        toast.error("Müşteri araması tamamlanamadı.");
      } finally {
        setLoadingCustomers(false);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [customerSearch, selectedCustomerId]);

  useEffect(() => {
    const bootstrap = async () => {
      await Promise.all([loadLinks(), loadGateways()]);
    };

    void bootstrap();
  }, []);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [lines],
  );
  const total = useMemo(
    () => Math.max(0, subtotal + shippingCost - discount),
    [discount, shippingCost, subtotal],
  );

  async function loadLinks() {
    setLinksLoading(true);
    try {
      const response = await fetchAdminJson<{
        success: boolean;
        links: QuickOrderLinkRecord[];
      }>("/api/admin/quick-order-links", { timeoutMs: 15000 });
      setLinks(response.links || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Hızlı sipariş linkleri yüklenemedi.");
    } finally {
      setLinksLoading(false);
    }
  }

  async function loadGateways() {
    try {
      const response = await fetchAdminJson<{
        success: boolean;
        gateways: PaymentGatewayRecord[];
      }>("/api/admin/payments", { timeoutMs: 12000 });

      const eligible = (response.gateways || []).filter(
        (gateway) => gateway.status === "active" && !["bank_transfer", "cod"].includes(gateway.gateway),
      );

      setPaymentGateways(eligible);
      setAllowedGatewayIds(eligible.map((gateway) => gateway.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ödeme yöntemleri yüklenemedi.");
    }
  }

  function addVariant(product: ProductSearchRecord, variant: ProductVariantRecord) {
    const lineId = makeLineId(product.id, variant.id);
    setLines((current) => {
      const existing = current.find((line) => line.id === lineId);
      if (existing) {
        return current.map((line) =>
          line.id === lineId
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }

      return [
        {
          id: lineId,
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          variantName: variant.name,
          quantity: 1,
          unitPrice: Number(variant.price) || 0,
          image: variant.images?.[0] || product.images?.[0] || null,
          sku: variant.sku || null,
        },
        ...current,
      ];
    });
  }

  function selectCustomer(customer: CustomerSearchRecord) {
    const name = getCustomerName(customer);
    const nextAddress = normalizeCustomerAddress(customer);

    setSelectedCustomerId(customer.id);
    setCustomerName(name === customer.email ? "" : name);
    setCustomerEmail(customer.email);
    setCustomerPhone(customer.phone || nextAddress.phone);
    setCustomerSearch(name);
    setShippingAddress(nextAddress);
    setCustomerResults([]);
  }

  function updateLine(lineId: string, updates: Partial<QuickOrderLine>) {
    setLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...updates } : line)),
    );
  }

  function removeLine(lineId: string) {
    setLines((current) => current.filter((line) => line.id !== lineId));
  }

  function updateShippingAddress(key: keyof QuickOrderAddress, value: string) {
    setShippingAddress((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateBillingAddress(key: keyof QuickOrderAddress, value: string) {
    setBillingAddress((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetBuilder() {
    setCustomerEmail("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerSearch("");
    setCustomerResults([]);
    setSelectedCustomerId(null);
    setShippingAddress(EMPTY_ADDRESS);
    setBillingAddress(EMPTY_ADDRESS);
    setBillingSameAsShipping(true);
    setShippingCost(0);
    setDiscount(0);
    setNote("");
    setInternalTag("");
    setExpiresInHours(24);
    setLines([]);
    setSearchQuery("");
    setSearchResults([]);
    setAllowedGatewayIds(paymentGateways.map((gateway) => gateway.id));
  }

  async function handleCreateLink() {
    if (!customerEmail.trim()) {
      toast.error("Müşteri e-postası zorunludur.");
      return;
    }

    if (!lines.length) {
      toast.error("En az bir ürün seçmelisiniz.");
      return;
    }

    setSaving(true);

    try {
      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
      const savedNote = buildSavedNote(note, internalTag);
      const response = await fetchAdminJson<{
        success: boolean;
        link: QuickOrderLinkRecord;
      }>("/api/admin/quick-order-links", {
        timeoutMs: 20000,
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerEmail,
            customerName: customerName || null,
            customerPhone: customerPhone || null,
            shippingAddress,
            billingAddress: billingSameAsShipping ? shippingAddress : billingAddress,
            shippingCost,
            discount,
            note: savedNote || null,
            allowedPaymentMethodIds: allowedGatewayIds,
            expiresAt,
            items: lines.map((line) => ({
              productId: line.productId,
              variantId: line.variantId,
              productName: line.productName,
              variantName: line.variantName,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              image: line.image,
              sku: line.sku,
            })),
          }),
        },
      });

      setLinks((current) => [response.link, ...current]);
      toast.success("Hızlı sipariş linki oluşturuldu.");
      resetBuilder();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Hızlı sipariş linki oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelLink(id: string) {
    try {
      const response = await fetchAdminJson<{
        success: boolean;
        link: QuickOrderLinkRecord;
      }>(`/api/admin/quick-order-links/${id}/cancel`, {
        timeoutMs: 12000,
        init: {
          method: "POST",
        },
      });

      setLinks((current) =>
        current.map((link) => (link.id === id ? { ...link, ...response.link } : link)),
      );
      toast.success("Link iptal edildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Link iptal edilemedi.");
    }
  }

  async function handleDuplicateLink(id: string) {
    try {
      const response = await fetchAdminJson<{
        success: boolean;
        link: QuickOrderLinkRecord;
      }>(`/api/admin/quick-order-links/${id}/duplicate`, {
        timeoutMs: 12000,
        init: {
          method: "POST",
        },
      });

      setLinks((current) => [response.link, ...current]);
      toast.success("Link kopyalandı.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Link kopyalanamadı.");
    }
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(quickOrderUrl(token));
      toast.success("Link kopyalandı.");
    } catch {
      toast.error("Link kopyalanamadı.");
    }
  }

  function quickOrderUrl(token: string) {
    return buildStorefrontUrl(`/odeme/hizli/${token}`);
  }

  const selectedCustomerLabel = selectedCustomerId ? "Seçili müşteri" : "Yeni müşteri";

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Sipariş Detayı" icon={<Package className="h-5 w-5" />}>
            <div className="space-y-5 p-5 md:p-6">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.48fr)]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8797]" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Ürün ara..."
                    className="h-11 w-full rounded-[7px] border border-[#E1E6EF] bg-white py-2 pl-10 pr-4 text-[14px] font-medium text-[#111827] outline-none transition placeholder:text-[#7B8797] focus:border-[#FF6A00] focus:ring-2 focus:ring-[rgba(255,106,0,0.12)]"
                  />
                </div>
                <label className="relative block">
                  <select
                    value={expiresInHours}
                    onChange={(event) => setExpiresInHours(Number(event.target.value) || 24)}
                    className="h-11 w-full appearance-none rounded-[7px] border border-[#E1E6EF] bg-white px-3.5 pr-10 text-[14px] font-medium text-[#111827] outline-none transition focus:border-[#FF6A00] focus:ring-2 focus:ring-[rgba(255,106,0,0.12)]"
                  >
                    {EXPIRY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} - ₺ / TRY
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8797]" />
                </label>
              </div>

              {searchQuery.trim() ? (
                <div className="overflow-hidden rounded-[7px] border border-[#E1E6EF] bg-[#F9F9F9]">
                  {loadingProducts ? (
                    <div className="flex min-h-[88px] items-center justify-center gap-2 text-sm font-medium text-[#6B7280]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Ürünler aranıyor...
                    </div>
                  ) : searchResults.length ? (
                    <div className="divide-y divide-[#E1E6EF]">
                      {searchResults.map((product) => (
                        <div key={product.id} className="bg-white p-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[7px] border border-[#E1E6EF] bg-[#F9F9F9]">
                              {product.images?.[0] ? (
                                <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
                              ) : (
                                <ShoppingBag className="h-4 w-4 text-[#9CA3AF]" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-semibold text-[#111827]">{product.name}</p>
                              <p className="mt-0.5 text-xs font-medium text-[#7B8797]">{product.variants.length} varyant</p>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2">
                            {product.variants.map((variant) => (
                              <button
                                key={variant.id}
                                type="button"
                                onClick={() => addVariant(product, variant)}
                                className="flex items-center justify-between gap-3 rounded-[7px] border border-[#E1E6EF] bg-[#F9F9F9] px-3 py-2.5 text-left transition hover:border-[#FFB985] hover:bg-[#FFF7F0]"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-[13px] font-semibold text-[#111827]">{variant.name}</p>
                                  <p className="mt-0.5 truncate text-xs text-[#7B8797]">{variant.sku || "SKU yok"}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-3">
                                  <span className="text-[13px] font-semibold text-[#111827]">
                                    {formatPrice(Number(variant.price) || 0)}
                                  </span>
                                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] bg-[#FF6A00] text-white">
                                    <Plus className="h-4 w-4" />
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex min-h-[88px] items-center justify-center text-sm font-medium text-[#7B8797]">
                      Sonuç bulunamadı.
                    </div>
                  )}
                </div>
              ) : null}

              <div className="min-h-[300px] rounded-[7px] border border-dashed border-[#E1E6EF] bg-[#FCFCFC]">
                {lines.length ? (
                  <div className="divide-y divide-[#EEF1F5]">
                    {lines.map((line) => (
                      <div key={line.id} className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_9rem_9rem_2.5rem] md:items-center">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[7px] border border-[#E1E6EF] bg-[#F9F9F9]">
                            {line.image ? (
                              <img src={line.image} alt={line.productName} className="h-full w-full object-cover" />
                            ) : (
                              <Package className="h-5 w-5 text-[#9CA3AF]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold text-[#111827]">{line.productName}</p>
                            <p className="mt-1 truncate text-xs font-medium text-[#7B8797]">
                              {line.variantName} {line.sku ? `• ${line.sku}` : ""}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-[#FF6A00] md:hidden">
                              {formatPrice(line.quantity * line.unitPrice)}
                            </p>
                          </div>
                        </div>
                        <TextField
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(value) => updateLine(line.id, { quantity: Math.max(1, Number(value) || 1) })}
                          placeholder="Adet"
                        />
                        <TextField
                          type="number"
                          min={0}
                          value={line.unitPrice}
                          onChange={(value) => updateLine(line.id, { unitPrice: Math.max(0, Number(value) || 0) })}
                          placeholder="Birim fiyat"
                        />
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-[7px] border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50"
                          aria-label={`${line.productName} satırını kaldır`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
                    <div className="relative h-[92px] w-[152px]">
                      <div className="absolute left-8 top-8 h-12 w-28 rounded-[7px] border border-[#EEF1F5] bg-white shadow-[0_12px_28px_rgba(17,24,39,0.05)]" />
                      <div className="absolute left-0 top-0 flex h-14 w-36 items-center gap-2 rounded-[7px] border border-[#EEF1F5] bg-white px-3 shadow-[0_14px_34px_rgba(17,24,39,0.08)]">
                        <span className="h-9 w-9 rounded-[6px] bg-[#FFF1E8]" />
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="block h-2 rounded-full bg-[#E7ECF2]" />
                          <span className="block h-2 w-2/3 rounded-full bg-[#E7ECF2]" />
                        </span>
                      </div>
                    </div>
                    <p className="mt-5 text-[1rem] font-semibold tracking-[-0.02em] text-[#111827]">Siparişleriniz burada gösterilecek</p>
                    <p className="mt-2 max-w-[26rem] text-sm leading-6 text-[#6B7280]">
                      Ürün arayarak hızlı ödeme linkine eklenecek kalemleri gerçek katalogdan seçebilirsiniz.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Müşteri" icon={<User className="h-5 w-5" />}>
            <div className="space-y-5 p-5 md:p-6">
              <div className="relative max-w-2xl">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8797]" />
                <input
                  value={customerSearch}
                  onChange={(event) => {
                    setCustomerSearch(event.target.value);
                    setSelectedCustomerId(null);
                  }}
                  placeholder="Müşteri ara"
                  className="h-11 w-full rounded-[7px] border border-[#E1E6EF] bg-white py-2 pl-10 pr-4 text-[14px] font-medium text-[#111827] outline-none transition placeholder:text-[#7B8797] focus:border-[#FF6A00] focus:ring-2 focus:ring-[rgba(255,106,0,0.12)]"
                />
                {customerSearch.trim() && customerResults.length ? (
                  <div className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-[7px] border border-[#E1E6EF] bg-white shadow-[0_18px_40px_rgba(17,24,39,0.12)]">
                    {customerResults.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => selectCustomer(customer)}
                        className="flex w-full items-center justify-between gap-3 border-b border-[#EEF1F5] px-4 py-3 text-left last:border-b-0 hover:bg-[#FFF7F0]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-[#111827]">{getCustomerName(customer)}</span>
                          <span className="mt-0.5 block truncate text-xs text-[#7B8797]">{customer.email}</span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-[#FF6A00]">
                          {Number(customer.total_orders) || 0} sipariş
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <TextField type="email" value={customerEmail} onChange={setCustomerEmail} placeholder="E-posta" />
                <TextField value={customerName} onChange={setCustomerName} placeholder="Ad soyad" />
                <TextField value={customerPhone} onChange={setCustomerPhone} placeholder="Telefon" />
              </div>

              <div className="inline-flex items-center gap-2 rounded-[7px] border border-[#E1E6EF] bg-[#F9F9F9] px-3 py-2 text-xs font-semibold text-[#6B7280]">
                {selectedCustomerId ? <Check className="h-3.5 w-3.5 text-[#16A34A]" /> : <User className="h-3.5 w-3.5" />}
                {loadingCustomers ? "Müşteri aranıyor..." : selectedCustomerLabel}
              </div>
            </div>
          </Panel>

          <Panel title="Teslimat Bilgileri" icon={<Mail className="h-5 w-5" />}>
            <div className="space-y-5 p-5 md:p-6">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {ADDRESS_FIELDS.map((field) => (
                  <TextField
                    key={field.key}
                    value={shippingAddress[field.key]}
                    onChange={(value) => updateShippingAddress(field.key, value)}
                    placeholder={field.label}
                  />
                ))}
                <textarea
                  value={shippingAddress.address}
                  onChange={(event) => updateShippingAddress("address", event.target.value)}
                  placeholder="Adres"
                  rows={3}
                  className="min-h-[96px] rounded-[7px] border border-[#E1E6EF] bg-white px-3.5 py-3 text-[14px] font-medium text-[#111827] outline-none transition placeholder:text-[#7B8797] focus:border-[#FF6A00] focus:ring-2 focus:ring-[rgba(255,106,0,0.12)] md:col-span-2 xl:col-span-3"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-sm font-medium text-[#374151]">
                <input
                  type="checkbox"
                  checked={billingSameAsShipping}
                  onChange={(event) => setBillingSameAsShipping(event.target.checked)}
                  className="h-4 w-4 rounded border-[#CDD5E1] accent-[#FF6A00]"
                />
                Fatura adresi teslimat adresi ile aynı
              </label>

              {!billingSameAsShipping ? (
                <div className="grid gap-3 rounded-[7px] border border-[#E1E6EF] bg-[#F9F9F9] p-4 md:grid-cols-2 xl:grid-cols-3">
                  {ADDRESS_FIELDS.map((field) => (
                    <TextField
                      key={field.key}
                      value={billingAddress[field.key]}
                      onChange={(value) => updateBillingAddress(field.key, value)}
                      placeholder={`Fatura ${field.label.toLocaleLowerCase("tr")}`}
                    />
                  ))}
                  <textarea
                    value={billingAddress.address}
                    onChange={(event) => updateBillingAddress("address", event.target.value)}
                    placeholder="Fatura adresi"
                    rows={3}
                    className="min-h-[96px] rounded-[7px] border border-[#E1E6EF] bg-white px-3.5 py-3 text-[14px] font-medium text-[#111827] outline-none transition placeholder:text-[#7B8797] focus:border-[#FF6A00] focus:ring-2 focus:ring-[rgba(255,106,0,0.12)] md:col-span-2 xl:col-span-3"
                  />
                </div>
              ) : null}
            </div>
          </Panel>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <Panel title="Sipariş Özeti">
            <div className="space-y-4 p-5 md:p-6">
              <div className="flex items-center justify-between text-sm text-[#6B7280]">
                <span>Ara Toplam</span>
                <span className="font-semibold text-[#111827]">{formatPrice(subtotal)}</span>
              </div>

              <label className="grid gap-2 text-sm font-medium text-[#6B7280]">
                <span className="text-[#FF6A00]">Fiyat Arttır/Azalt</span>
                <TextField
                  type="number"
                  min={0}
                  value={discount}
                  onChange={(value) => setDiscount(Math.max(0, Number(value) || 0))}
                  placeholder="İndirim"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-[#6B7280]">
                <span className="text-[#FF6A00]">Kargo Ekle</span>
                <TextField
                  type="number"
                  min={0}
                  value={shippingCost}
                  onChange={(value) => setShippingCost(Math.max(0, Number(value) || 0))}
                  placeholder="Kargo"
                />
              </label>

              <div className="border-t border-[#EEF1F5] pt-4">
                <div className="flex items-center justify-between text-[15px] font-semibold text-[#111827]">
                  <span>Toplam</span>
                  <span>{formatPrice(total)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateLink}
                disabled={saving}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[7px] bg-[#FF6A00] px-4 text-sm font-semibold text-white transition hover:bg-[#E85D04] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {saving ? "Oluşturuluyor..." : "Ödeme linki oluştur"}
              </button>
              <button
                type="button"
                onClick={resetBuilder}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[7px] border border-[#E1E6EF] bg-white text-sm font-semibold text-[#374151] transition hover:border-[#FFB985] hover:text-[#E85D04]"
              >
                <RefreshCw className="h-4 w-4" />
                Temizle
              </button>
            </div>
          </Panel>

          <Panel title="Müşteri Notu" icon={<MessageSquareText className="h-5 w-5" />}>
            <div className="p-5 md:p-6">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={6}
                className="min-h-[150px] w-full resize-y rounded-[7px] border border-[#E1E6EF] bg-white px-3.5 py-3 text-[14px] font-medium text-[#111827] outline-none transition placeholder:text-[#7B8797] focus:border-[#FF6A00] focus:ring-2 focus:ring-[rgba(255,106,0,0.12)]"
              />
            </div>
          </Panel>

          <Panel title="Etiketler" icon={<Tag className="h-5 w-5" />}>
            <div className="space-y-2 p-5 md:p-6">
              <label className="text-sm font-medium text-[#6B7280]" htmlFor="quick-order-internal-tag">
                Etiket
              </label>
              <TextField
                id="quick-order-internal-tag"
                value={internalTag}
                onChange={setInternalTag}
                placeholder=""
                className="h-10"
              />
            </div>
          </Panel>

          <Panel title="Ödeme Yöntemi" icon={<CreditCard className="h-5 w-5" />}>
            <div className="space-y-2 p-5 md:p-6">
              {paymentGateways.length ? (
                paymentGateways.map((gateway) => (
                  <label key={gateway.id} className="flex cursor-pointer items-start gap-3 rounded-[7px] border border-[#E1E6EF] bg-white px-3 py-3 text-sm transition hover:border-[#FFB985]">
                    <input
                      type="checkbox"
                      checked={allowedGatewayIds.includes(gateway.id)}
                      onChange={(event) =>
                        setAllowedGatewayIds((current) =>
                          event.target.checked
                            ? [...current, gateway.id]
                            : current.filter((item) => item !== gateway.id),
                        )
                      }
                      className="mt-0.5 h-4 w-4 rounded border-[#CDD5E1] accent-[#FF6A00]"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-[#111827]">{gateway.name}</span>
                      <span className="mt-1 block text-xs leading-5 text-[#7B8797]">{gateway.description}</span>
                    </span>
                  </label>
                ))
              ) : (
                <div className="rounded-[7px] border border-dashed border-[#E1E6EF] bg-[#F9F9F9] px-3 py-4 text-sm text-[#7B8797]">
                  Aktif online ödeme yöntemi bulunamadı.
                </div>
              )}
            </div>
          </Panel>
        </aside>
      </div>

      <Panel
        title="Oluşturulan Linkler"
        actions={
          <button
            type="button"
            onClick={loadLinks}
            className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-[#E1E6EF] bg-white px-3 text-sm font-semibold text-[#374151] transition hover:border-[#FFB985] hover:text-[#E85D04]"
          >
            <RefreshCw className="h-4 w-4" />
            Yenile
          </button>
        }
      >
        <div className="p-4 md:p-5">
          {linksLoading ? (
            <div className="flex min-h-[110px] items-center justify-center gap-2 rounded-[7px] border border-dashed border-[#E1E6EF] bg-[#F9F9F9] text-sm font-medium text-[#6B7280]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Linkler yükleniyor...
            </div>
          ) : links.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[#E1E6EF] bg-[#F9F9F9] text-xs font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  <tr>
                    <th className="px-4 py-3">Müşteri</th>
                    <th className="px-4 py-3">Ürün</th>
                    <th className="px-4 py-3">Durum</th>
                    <th className="px-4 py-3">Geçerlilik</th>
                    <th className="px-4 py-3 text-right">Toplam</th>
                    <th className="px-4 py-3 text-right">Aksiyon</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF1F5]">
                  {links.map((link) => (
                    <tr key={link.id} className="bg-white align-middle">
                      <td className="max-w-[18rem] px-4 py-3">
                        <p className="truncate font-semibold text-[#111827]">{link.customer_name || link.customer_email}</p>
                        <p className="mt-0.5 truncate text-xs text-[#7B8797]">{link.customer_email}</p>
                      </td>
                      <td className="max-w-[18rem] px-4 py-3">
                        <p className="truncate text-[#374151]">
                          {link.items[0]?.product_name || "Ürün yok"}
                          {link.items.length > 1 ? ` + ${link.items.length - 1} ürün` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[link.status])}>
                          {STATUS_LABELS[link.status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#6B7280]">{formatDateTime(link.expires_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#111827]">{formatPrice(link.total)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => copyLink(link.token)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-[#6B7280] transition hover:border-[#FFB985] hover:text-[#E85D04]"
                            aria-label="Linki kopyala"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <Link
                            href={quickOrderUrl(link.token)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-[#6B7280] transition hover:border-[#FFB985] hover:text-[#E85D04]"
                            aria-label="Önizleme aç"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDuplicateLink(link.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-[#6B7280] transition hover:border-[#FFB985] hover:text-[#E85D04]"
                            aria-label="Kopyasını oluştur"
                          >
                            <Link2 className="h-4 w-4" />
                          </button>
                          {link.status !== "paid" && link.status !== "cancelled" ? (
                            <button
                              type="button"
                              onClick={() => handleCancelLink(link.id)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50"
                              aria-label="Linki iptal et"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-[130px] items-center justify-center rounded-[7px] border border-dashed border-[#E1E6EF] bg-[#F9F9F9] text-center text-sm font-medium text-[#7B8797]">
              Henüz hızlı sipariş linki oluşturulmadı.
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
