"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Link2, Loader2, Mail, MapPin, Package, Plus, RefreshCw, Search, ShieldCheck, ShoppingBag, Trash2, User, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { fetchAdminJson } from "@/lib/admin-client-fetch";
import { buildStorefrontUrl } from "@/lib/store-runtime";

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
  paid: "border-violet-200 bg-violet-50 text-violet-700",
  cancelled: "border-rose-200 bg-rose-50 text-rose-700",
  expired: "border-amber-200 bg-amber-50 text-amber-700",
};

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

export function QuickOrderLinksPanel() {
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState<QuickOrderAddress>(EMPTY_ADDRESS);
  const [billingAddress, setBillingAddress] = useState<QuickOrderAddress>(EMPTY_ADDRESS);
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [shippingCost, setShippingCost] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [note, setNote] = useState("");
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
      } finally {
        setLoadingProducts(false);
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    const bootstrap = async () => {
      await Promise.all([loadLinks(), loadGateways()]);
    };

    bootstrap();
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
      toast.error(error instanceof Error ? error.message : "Hizli siparis linkleri yuklenemedi.");
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
      toast.error(error instanceof Error ? error.message : "Ödeme yontemleri yuklenemedi.");
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

  function updateLine(lineId: string, updates: Partial<QuickOrderLine>) {
    setLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...updates } : line)),
    );
  }

  function removeLine(lineId: string) {
    setLines((current) => current.filter((line) => line.id !== lineId));
  }

  function resetBuilder() {
    setCustomerEmail("");
    setCustomerName("");
    setCustomerPhone("");
    setShippingAddress(EMPTY_ADDRESS);
    setBillingAddress(EMPTY_ADDRESS);
    setBillingSameAsShipping(true);
    setShippingCost(0);
    setDiscount(0);
    setNote("");
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
      toast.error("En az bir urun secmelisiniz.");
      return;
    }


    setSaving(true);

    try {
      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
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
            note: note || null,
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
      toast.success("Hizli siparis linki olusturuldu.");
      resetBuilder();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Hizli siparis linki olusturulamadi.");
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
      toast.success("Link kopyalandi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Link kopyalanamadi.");
    }
  }

  function quickOrderUrl(token: string) {
    return buildStorefrontUrl(`/odeme/hizli/${token}`);
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(254,97,0,0.08)]">
        <div className="border-b border-[#FE6100]/8 px-6 py-6 md:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/15 bg-[#fff4ec] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">
                <Link2 className="h-3.5 w-3.5" />
                Hızlı Sipariş
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.05em] text-gray-950">Müşteriye özel ödeme linki oluştur</h1>
              <p className="max-w-3xl text-sm leading-6 text-gray-500">
                Ürünleri seç, müşteri bilgilerini gir ve tek tıkla özel bir ödeme linki üret. Müşteri bu linkte kalemleri değiştiremeden ödeme ekranına gider.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Varsayılan geçerlilik: <span className="font-semibold">24 saat</span>
            </div>
          </div>
        </div>

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.2fr_0.8fr] md:px-8">
          <div className="space-y-6">
            <div className="rounded-[26px] border border-[#FE6100]/10 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <User className="h-4 w-4 text-[#FE6100]" />
                Müşteri bilgileri
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <input value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="Müşteri e-postası" className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#FE6100]" />
                <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Müşteri adı" className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#FE6100]" />
                <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Telefon" className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#FE6100]" />
                <input type="number" min={1} value={expiresInHours} onChange={(event) => setExpiresInHours(Math.max(1, Number(event.target.value) || 24))} placeholder="Geçerlilik (saat)" className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#FE6100]" />
              </div>
            </div>

            <div className="rounded-[26px] border border-[#FE6100]/10 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <MapPin className="h-4 w-4 text-[#FE6100]" />
                Teslimat ve fatura adresi
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {[
                  ["firstName", "Ad"],
                  ["lastName", "Soyad"],
                  ["phone", "Telefon"],
                  ["city", "Şehir"],
                  ["district", "İlçe"],
                  ["postalCode", "Posta kodu"],
                  ["country", "Ülke"],
                ].map(([key, label]) => (
                  <input
                    key={key}
                    value={shippingAddress[key as keyof QuickOrderAddress]}
                    onChange={(event) =>
                      setShippingAddress((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    placeholder={label}
                    className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#FE6100]"
                  />
                ))}
                <textarea
                  value={shippingAddress.address}
                  onChange={(event) => setShippingAddress((current) => ({ ...current, address: event.target.value }))}
                  placeholder="Adres"
                  rows={4}
                  className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#FE6100] md:col-span-2"
                />
              </div>

              <label className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={billingSameAsShipping}
                  onChange={(event) => setBillingSameAsShipping(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Fatura adresi teslimat adresi ile aynı
              </label>

              {!billingSameAsShipping ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {[
                    ["firstName", "Fatura adı"],
                    ["lastName", "Fatura soyadı"],
                    ["phone", "Fatura telefonu"],
                    ["city", "Fatura şehri"],
                    ["district", "Fatura ilçesi"],
                    ["postalCode", "Fatura posta kodu"],
                    ["country", "Fatura ülkesi"],
                  ].map(([key, label]) => (
                    <input
                      key={key}
                      value={billingAddress[key as keyof QuickOrderAddress]}
                      onChange={(event) =>
                        setBillingAddress((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                      placeholder={label}
                      className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#FE6100]"
                    />
                  ))}
                  <textarea
                    value={billingAddress.address}
                    onChange={(event) => setBillingAddress((current) => ({ ...current, address: event.target.value }))}
                    placeholder="Fatura adresi"
                    rows={4}
                    className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#FE6100] md:col-span-2"
                  />
                </div>
              ) : null}
            </div>

            <div className="rounded-[26px] border border-[#FE6100]/10 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Package className="h-4 w-4 text-[#FE6100]" />
                Ürün seç
              </div>

              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Ürün veya varyant ara"
                  className="w-full rounded-2xl border border-gray-200 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-[#FE6100]"
                />
              </div>

              <div className="mt-4 space-y-3">
                {loadingProducts ? (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-500">
                    Ürünler aranıyor...
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((product) => (
                    <div key={product.id} className="rounded-2xl border border-gray-200 bg-[#fafafa] p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white">
                          {product.images?.[0] ? (
                            <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
                          ) : (
                            <ShoppingBag className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-950">{product.name}</p>
                          <p className="text-xs text-gray-500">{product.variants.length} varyant</p>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2">
                        {product.variants.map((variant) => (
                          <button
                            key={variant.id}
                            type="button"
                            onClick={() => addVariant(product, variant)}
                            className="flex items-center justify-between rounded-xl border border-white bg-white px-3 py-3 text-left text-sm transition hover:border-[#FE6100]/20 hover:bg-[#fff9f4]"
                          >
                            <div>
                              <p className="font-medium text-gray-900">{variant.name}</p>
                              <p className="text-xs text-gray-500">{variant.sku || "SKU yok"}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-gray-900">{formatPrice(Number(variant.price) || 0)}</span>
                              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#FE6100] text-white">
                                <Plus className="h-4 w-4" />
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                ) : searchQuery.trim() ? (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-500">
                    Sonuç bulunamadı.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-500">
                    Arama yaparak ürün varyantlarını hızlı siparişe ekleyin.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[26px] border border-[#FE6100]/10 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <ShieldCheck className="h-4 w-4 text-[#FE6100]" />
                İzinli ödeme yöntemleri
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                Secim yapmazsan bu linkte tum aktif online odeme yontemleri gorunur.
              </p>
              <div className="mt-4 space-y-2">
                {paymentGateways.map((gateway) => (
                  <label key={gateway.id} className="flex items-start gap-3 rounded-xl border border-gray-200 px-3 py-3 text-sm">
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
                      className="mt-0.5 h-4 w-4 rounded border-gray-300"
                    />
                    <div>
                      <p className="font-medium text-gray-900">{gateway.name}</p>
                      <p className="mt-1 text-xs text-gray-500">{gateway.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] border border-[#FE6100]/10 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Mail className="h-4 w-4 text-[#FE6100]" />
                Tutar ve not
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <input type="number" min={0} value={shippingCost} onChange={(event) => setShippingCost(Number(event.target.value) || 0)} placeholder="Kargo ücreti" className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#FE6100]" />
                <input type="number" min={0} value={discount} onChange={(event) => setDiscount(Number(event.target.value) || 0)} placeholder="İndirim" className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#FE6100]" />
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Yönetici notu" className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#FE6100] md:col-span-2" />
              </div>
            </div>

            <div className="rounded-[26px] border border-[#FE6100]/10 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Sipariş özeti</p>
                  <p className="mt-1 text-sm text-gray-500">Seçilen kalemler ödeme linkinde kilitli gösterilir.</p>
                </div>
                <button
                  type="button"
                  onClick={resetBuilder}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
                >
                  <RefreshCw className="h-4 w-4" />
                  Temizle
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {lines.length ? (
                  lines.map((line) => (
                    <div key={line.id} className="rounded-2xl border border-gray-200 bg-[#fafafa] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-950">{line.productName}</p>
                          <p className="mt-1 text-xs text-gray-500">{line.variantName}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <input type="number" min={1} value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Math.max(1, Number(event.target.value) || 1) })} className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#FE6100]" />
                        <input type="number" min={0} value={line.unitPrice} onChange={(event) => updateLine(line.id, { unitPrice: Math.max(0, Number(event.target.value) || 0) })} className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#FE6100]" />
                      </div>

                      <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
                        <span>{line.sku || "SKU yok"}</span>
                        <span className="font-semibold text-gray-900">{formatPrice(line.quantity * line.unitPrice)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                    Henüz ürün eklenmedi.
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2 rounded-2xl bg-[#faf5f0] p-4 text-sm">
                <div className="flex items-center justify-between text-gray-600">
                  <span>Ara toplam</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-gray-600">
                  <span>Kargo</span>
                  <span>{formatPrice(shippingCost)}</span>
                </div>
                <div className="flex items-center justify-between text-gray-600">
                  <span>İndirim</span>
                  <span>-{formatPrice(discount)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-[#FE6100]/10 pt-3 text-base font-semibold text-gray-950">
                  <span>Toplam</span>
                  <span>{formatPrice(total)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateLink}
                disabled={saving}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FE6100] px-5 py-4 text-sm font-semibold text-white transition hover:bg-[#e85a00] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {saving ? "Link oluşturuluyor..." : "Hızlı sipariş linki oluştur"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.06)]">
        <div className="border-b border-[#FE6100]/8 px-6 py-5 md:px-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-gray-950">Oluşturulan linkler</h2>
              <p className="mt-1 text-sm text-gray-500">Aktif, açılmış, ödenmiş ve süresi dolmuş linkleri tek yerden yönet.</p>
            </div>
            <button
              type="button"
              onClick={loadLinks}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
            >
              <RefreshCw className="h-4 w-4" />
              Yenile
            </button>
          </div>
        </div>

        <div className="space-y-3 p-5 md:p-6">
          {linksLoading ? (
            <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 px-4 py-8 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Linkler yükleniyor...
            </div>
          ) : links.length ? (
            links.map((link) => (
              <motion.article
                key={link.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[24px] border border-gray-200 bg-[#fffdfa] p-5"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${STATUS_STYLES[link.status]}`}>
                        {link.status}
                      </span>
                      <span className="text-sm text-gray-500">{formatDateTime(link.expires_at)} tarihine kadar geçerli</span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-950">{link.customer_name || link.customer_email}</h3>
                    <p className="text-sm text-gray-500">{link.customer_email}</p>
                    <p className="text-sm text-gray-600">
                      {link.items[0]?.product_name}
                      {link.items.length > 1 ? ` + ${link.items.length - 1} ürün` : ""}
                    </p>
                  </div>

                  <div className="space-y-3 xl:text-right">
                    <p className="text-2xl font-semibold tracking-[-0.04em] text-gray-950">{formatPrice(link.total)}</p>
                    <p className="text-xs text-gray-500">Toplam {link.items.length} ürün kalemi</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(quickOrderUrl(link.token));
                      toast.success("Link kopyalandı.");
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:text-gray-950"
                  >
                    <Copy className="h-4 w-4" />
                    Kopyala
                  </button>
                  <Link
                    href={quickOrderUrl(link.token)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:text-gray-950"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Önizleme aç
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDuplicateLink(link.id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:text-gray-950"
                  >
                    <Copy className="h-4 w-4" />
                    Kopyasını oluştur
                  </button>
                  {link.status !== "paid" && link.status !== "cancelled" ? (
                    <button
                      type="button"
                      onClick={() => handleCancelLink(link.id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                    >
                      <XCircle className="h-4 w-4" />
                      İptal et
                    </button>
                  ) : null}
                </div>
              </motion.article>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
              Henüz hızlı sipariş linki oluşturulmadı.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}


