"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Ban, CheckCircle2, Copy, CreditCard, Loader2, Lock, MapPin, Package, ShieldCheck, Timer, User } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils";
import type { PaymentGatewayConfig } from "@/types/payment";

type QuickOrderAddress = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  country?: string;
};

type QuickOrderItem = {
  id: string;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  image: string | null;
};

type QuickOrderLink = {
  id: string;
  token: string;
  status: "active" | "opened" | "paid" | "cancelled" | "expired";
  customer_email: string;
  customer_name: string | null;
  customer_phone: string | null;
  shipping_address: QuickOrderAddress;
  billing_address: QuickOrderAddress;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  note: string | null;
  expires_at: string;
  order_id: string | null;
  items: QuickOrderItem[];
};

type QuickOrderResponse = {
  success: boolean;
  link: QuickOrderLink;
  gateways: PaymentGatewayConfig[];
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatAddress(address: QuickOrderAddress) {
  return [
    `${address.firstName || ""} ${address.lastName || ""}`.trim() || null,
    address.address || null,
    [address.district, address.city].filter(Boolean).join(" / ") || null,
    [address.postalCode, address.country].filter(Boolean).join(" ") || null,
    address.phone || null,
  ]
    .filter(Boolean)
    .join(", ");
}

export function QuickOrderCheckoutPage({ token }: { token: string }) {
  const searchParams = useSearchParams();
  const paymentState = searchParams.get("payment");
  const [link, setLink] = useState<QuickOrderLink | null>(null);
  const [gateways, setGateways] = useState<PaymentGatewayConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [selectedGatewayId, setSelectedGatewayId] = useState("");

  const loadLink = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const response = await fetch(`/api/quick-order-links/${token}`, { cache: "no-store" });
      const payload = (await response.json()) as QuickOrderResponse & { error?: string };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Hızlı sipariş linki yüklenemedi.");
      }

      setLink(payload.link);
      setGateways(payload.gateways || []);
      setSelectedGatewayId((current) => {
        if (current && payload.gateways.some((gateway) => gateway.id === current)) {
          return current;
        }

        return payload.gateways[0]?.id || "";
      });
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Hızlı sipariş linki yüklenemedi.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadLink();
  }, [token]);

  useEffect(() => {
    if (paymentState !== "pending") {
      return;
    }

    const interval = window.setInterval(() => {
      loadLink({ silent: true });
    }, 4000);

    return () => window.clearInterval(interval);
  }, [paymentState, token]);

  const summaryRows = useMemo(() => {
    if (!link) {
      return [];
    }

    return [
      { label: "Ara toplam", value: formatPrice(link.subtotal) },
      { label: "Kargo", value: formatPrice(link.shipping_cost) },
      { label: "İndirim", value: `-${formatPrice(link.discount)}` },
    ];
  }, [link]);

  const handleStartPayment = async () => {
    if (!selectedGatewayId) {
      toast.error("Lütfen bir ödeme yöntemi seçin.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`/api/quick-order-links/${token}/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentMethod: selectedGatewayId,
        }),
      });

      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string; payment?: { action?: string; redirectUrl?: string } } | null;

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Ödeme başlatılamadı.");
      }

      if (payload.payment?.action === "redirect" && payload.payment.redirectUrl) {
        window.location.assign(payload.payment.redirectUrl);
        return;
      }

      await loadLink({ silent: true });
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "Ödeme başlatılamadı.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] px-4 py-10">
        <div className="mx-auto flex max-w-3xl items-center justify-center rounded-[28px] bg-white p-12 shadow-sm">
          <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        </div>
      </div>
    );
  }

  if (!link || error) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] px-4 py-10">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-rose-200 bg-white p-8 shadow-sm">
          <div className="flex items-start gap-3 text-rose-700">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div>
              <h1 className="text-lg font-semibold">Hızlı sipariş linki açılamadı</h1>
              <p className="mt-2 text-sm">{error || "Bağlantı kurulurken bir hata oluştu."}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isPaid = link.status === "paid";
  const isBlocked = link.status === "cancelled" || link.status === "expired";

  return (
    <div className="min-h-screen bg-[#F3F4F6] px-4 py-8 md:px-6 md:py-10">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[30px] bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">
              <Lock className="h-3.5 w-3.5" />
              Hızlı Ödeme Linki
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Güvenli ödeme
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {paymentState === "pending" && !isPaid ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Ödeme sonucu kontrol ediliyor. Bu sayfa otomatik olarak yenileniyor.
              </div>
            ) : null}

            {paymentState === "failed" ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                Ödeme tamamlanamadı. Link süresi dolmadıysa aynı siparişi tekrar deneyebilirsiniz.
              </div>
            ) : null}

            {isPaid ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-700">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5" />
                  <div>
                    <p className="font-semibold">Ödeme başarıyla tamamlandı.</p>
                    <p className="mt-1 text-sm">Siparişiniz oluşturuldu. Sipariş detayına aşağıdan ulaşabilirsiniz.</p>
                    {link.order_id ? (
                      <Link
                        href={`/siparisler/${link.order_id}`}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
                      >
                        Sipariş detayını aç
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {link.status === "cancelled" ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-gray-700">
                <div className="flex items-start gap-3">
                  <Ban className="mt-0.5 h-5 w-5" />
                  <div>
                    <p className="font-semibold">Bu link iptal edildi.</p>
                    <p className="mt-1 text-sm">Yeni ödeme linki için mağaza yöneticinizle iletişime geçin.</p>
                  </div>
                </div>
              </div>
            ) : null}

            {link.status === "expired" ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-gray-700">
                <div className="flex items-start gap-3">
                  <Timer className="mt-0.5 h-5 w-5" />
                  <div>
                    <p className="font-semibold">Bu linkin süresi doldu.</p>
                    <p className="mt-1 text-sm">Yenilenmiş bir ödeme linki istemeniz gerekir.</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-8 rounded-[26px] border border-gray-100 bg-[#fafafa] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-500">Müşteri</p>
                <p className="mt-1 text-lg font-semibold text-gray-950">{link.customer_name || link.customer_email}</p>
                <p className="mt-1 text-sm text-gray-500">{link.customer_email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success("Ödeme linki kopyalandı.");
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:text-gray-950"
              >
                <Copy className="h-4 w-4" />
                Linki kopyala
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <MapPin className="h-4 w-4 text-gray-500" />
                  Teslimat adresi
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-600">{formatAddress(link.shipping_address)}</p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <User className="h-4 w-4 text-gray-500" />
                  Fatura bilgisi
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-600">{formatAddress(link.billing_address)}</p>
              </div>
            </div>

            {link.note ? (
              <div className="mt-4 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
                {link.note}
              </div>
            ) : null}
          </div>

          <div className="mt-8 rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <CreditCard className="h-4 w-4 text-gray-500" />
              Ödeme yöntemi seç
            </div>
            <p className="mt-2 text-sm text-gray-500">Bu linkte yalnızca yönetici tarafından izin verilen online ödeme yöntemleri kullanılabilir.</p>

            <div className="mt-5 space-y-3">
              {gateways.map((gateway) => (
                <label
                  key={gateway.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                    selectedGatewayId === gateway.id
                      ? "border-gray-900 bg-gray-950 text-white"
                      : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="quick-order-payment"
                    value={gateway.id}
                    checked={selectedGatewayId === gateway.id}
                    onChange={() => setSelectedGatewayId(gateway.id)}
                    className="h-4 w-4 border-gray-300"
                    disabled={isPaid || isBlocked}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{gateway.name}</p>
                    <p className={`mt-1 text-xs ${selectedGatewayId === gateway.id ? "text-white/70" : "text-gray-500"}`}>
                      {gateway.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {!gateways.length && !isPaid && !isBlocked ? (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Bu link için kullanılabilir online ödeme yöntemi bulunamadı.
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleStartPayment}
              disabled={submitting || !selectedGatewayId || isPaid || isBlocked}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {submitting ? "Ödeme başlatılıyor..." : `${formatPrice(link.total)} öde`}
            </button>
          </div>
        </section>

        <aside className="rounded-[30px] bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-500">Siparis ozeti</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-gray-950">{formatPrice(link.total)}</h2>
            </div>
            <div className="rounded-full bg-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">
              {link.status}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-gray-100 bg-[#fafafa] px-4 py-3 text-sm text-gray-600">
            Link gecerlilik tarihi: <span className="font-semibold text-gray-900">{formatDateTime(link.expires_at)}</span>
          </div>

          <div className="mt-6 space-y-4">
            {link.items.map((item) => (
              <div key={item.id} className="flex gap-3 rounded-2xl border border-gray-100 bg-white p-3">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
                  {item.image ? (
                    <img src={item.image} alt={item.product_name} className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-5 w-5 text-gray-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-950">{item.product_name}</p>
                  {item.variant_name ? (
                    <p className="mt-1 text-sm text-gray-500">{item.variant_name}</p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">{item.quantity} adet</span>
                    <span className="font-semibold text-gray-950">{formatPrice(item.line_total)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-3 rounded-2xl border border-gray-100 bg-[#fafafa] p-4">
            {summaryRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between text-sm text-gray-600">
                <span>{row.label}</span>
                <span className="font-medium text-gray-900">{row.value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-gray-200 pt-3 text-base font-semibold text-gray-950">
              <span>Toplam</span>
              <span>{formatPrice(link.total)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
