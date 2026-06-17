import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  Check,
  ChevronRight,
  CreditCard,
  MapPin,
  PackageCheck,
  ShoppingBag,
  Wallet,
} from "lucide-react";

import OrderSuccessToast from "@/components/order-success-toast";
import { normalizeStoredCustomizations } from "@/lib/customization/normalize";
import { getOrderAccountingSnapshot } from "@/lib/db/accounting";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { createServerClient } from "@/lib/supabase";
import { formatPrice } from "@/lib/utils";
import { OrderItemCustomization } from "@/types/product-customization";

type ShippingAddress = {
  firstName?: string;
  lastName?: string;
  address?: string;
  city?: string;
  district?: string;
  country?: string;
  phone?: string;
  email?: string;
};

type PaymentGateway = {
  id: string;
  name: string;
  gateway: string;
};

interface OrderItem {
  id: string;
  product_name: string;
  variant_name: string;
  price: number;
  quantity: number;
  total: number;
  product?: {
    images: string[];
    category: string;
  };
  customizations?: OrderItemCustomization[];
}

interface Order {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  shipping_address: ShippingAddress;
  payment_method: string;
}

function getPaymentMeta(order: Order, paymentGateways: PaymentGateway[]) {
  const gatewayConfig = paymentGateways.find((gateway) => gateway.id === order.payment_method);
  const fallbackName =
    order.payment_method === "cod"
      ? "Kapıda Ödeme"
      : order.payment_method === "bank_transfer"
        ? "Havale / EFT"
        : "Kredi Kartı / Banka Kartı";

  const name = gatewayConfig?.name || fallbackName;
  const gateway = gatewayConfig?.gateway || order.payment_method;

  if (gateway === "cod") {
    return { name, description: "Tahsilat teslimatta alınacak.", icon: "truck" as const };
  }

  if (gateway === "bank_transfer") {
    return { name, description: "Ödeme onayı bekleniyor.", icon: "wallet" as const };
  }

  return { name, description: "Ödeme başarıyla alındı.", icon: "card" as const };
}

function PaymentMethodIcon({ kind }: { kind: "truck" | "wallet" | "card" }) {
  if (kind === "truck") return <span className="text-lg">🚚</span>;
  if (kind === "wallet") return <Wallet className="h-5 w-5 text-neutral-600" />;
  return <CreditCard className="h-5 w-5 text-neutral-600" />;
}

function getPaymentBanner(paymentState?: string) {
  if (paymentState === "failed") {
    return {
      className: "border-red-200 bg-red-50 text-red-700",
      title: "Ödeme başarısız",
      description:
        "Kart ödemesi tamamlanamadı. Siparişiniz kaydedildi; ödemeyi yeniden deneyebilir veya bizimle iletişime geçebilirsiniz.",
    };
  }

  if (paymentState === "pending") {
    return {
      className: "border-amber-200 bg-amber-50 text-amber-700",
      title: "Ödeme sonucu kontrol ediliyor",
      description: "Sağlayıcıdan dönüş alındı. Ödeme sonucu kısa süre içinde siparişinize yansır.",
    };
  }

  if (paymentState === "success") {
    return {
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      title: "Ödeme tamamlandı",
      description: "Ödemeniz başarıyla alındı ve siparişiniz onaya girdi.",
    };
  }

  return null;
}

export default async function OrderSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string; payment?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = createServerClient();

  const [orderResponse, settingsResponse] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).single(),
    supabase.from("settings").select("value").eq("key", "payment_gateways").single(),
  ]);

  const order: Order | null = orderResponse.data;
  const orderError = orderResponse.error;
  const paymentGateways = (settingsResponse.data?.value || []) as PaymentGateway[];

  if (orderError || !order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAFAFA] px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Sipariş bulunamadı</h1>
        <p className="mt-2 max-w-md text-sm text-gray-500">
          Aradığınız sipariş mevcut değil veya bu sipariş için erişim izniniz yok.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-[#0F766E] px-8 text-sm font-semibold text-white transition-colors hover:bg-[#115E59]"
        >
          Ana sayfaya dön
        </Link>
      </div>
    );
  }

  const { data: orderItems, error: itemsError } = await supabase
    .from("order_items")
    .select(`
      *,
      product:products(images, category),
      customizations:order_item_customizations(*)
    `)
    .eq("order_id", id);

  if (itemsError) {
    console.error("Error fetching items:", itemsError);
  }

  const items: OrderItem[] = (orderItems || []).map((item) => ({
    ...item,
    customizations: normalizeStoredCustomizations(item.customizations),
  }));

  let accountingSnapshot = null;
  try {
    accountingSnapshot = await getOrderAccountingSnapshot(id);
  } catch (accountingError) {
    console.error("Public order accounting snapshot error:", accountingError);
  }

  const paymentMeta = getPaymentMeta(order, paymentGateways);
  const paymentBanner = getPaymentBanner(resolvedSearchParams.payment);

  return (
    <div className="min-h-screen bg-[#F7FAF9] pb-20 pt-8">
      <OrderSuccessToast />
      <div className="mx-auto flex max-w-[1120px] flex-col gap-8 px-4 md:px-6">
        {paymentBanner && (
          <div className={`rounded-2xl border px-5 py-4 ${paymentBanner.className}`}>
            <p className="font-semibold">{paymentBanner.title}</p>
            <p className="mt-1 text-sm">{paymentBanner.description}</p>
          </div>
        )}

        <section className="overflow-hidden rounded-lg border border-[#DDE7E4] bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[1.25fr_0.95fr]">
            <div className="border-b border-[#DDE7E4] bg-[#F0FDFA] p-6 sm:p-8 lg:border-b-0 lg:border-r">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm">
                <Check className="h-7 w-7 stroke-[3]" />
              </div>

              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.34em] text-stone-500">
                Sipariş Onayı
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
                Siparişiniz alındı
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-stone-600 sm:text-base">
                Siparişiniz başarıyla oluşturuldu. Hazırlık ve kargo sürecindeki güncellemeleri bu sayfadan takip edebilirsiniz.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-[#DDE7E4] bg-white/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">Sipariş No</p>
                  <p className="mt-2 font-mono text-sm font-semibold text-stone-900">#{order.order_number}</p>
                </div>
                <div className="rounded-lg border border-[#DDE7E4] bg-white/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">Tarih</p>
                  <p className="mt-2 text-sm font-semibold text-stone-900">
                    {new Date(order.created_at).toLocaleDateString("tr-TR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="rounded-lg border border-[#DDE7E4] bg-white/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">Toplam</p>
                  <p className="mt-2 text-sm font-semibold text-stone-900">{formatPrice(order.total)}</p>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8">
              <div className="rounded-lg border border-[#DDE7E4] bg-[#F7FAF9] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-400">Ödeme Yöntemi</p>
                    <h2 className="mt-2 text-xl font-semibold text-stone-900">{paymentMeta.name}</h2>
                    <p className="mt-1 text-sm text-stone-600">{paymentMeta.description}</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-stone-200 bg-white shadow-sm">
                    <PaymentMethodIcon kind={paymentMeta.icon} />
                  </div>
                </div>

                <div className="mt-5 space-y-3 border-t border-stone-200 pt-5 text-sm text-stone-600">
                  <div className="flex items-center justify-between gap-3">
                    <span>Belge durumu</span>
                    <span className="font-medium text-stone-900">
                      {accountingSnapshot?.syncStatus === "synced" ? "Hazir" : "Hazirlaniyor"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Fatura no</span>
                    <span className="font-medium text-stone-900">{accountingSnapshot?.invoiceNo || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Odeme kaydi</span>
                    <span className="font-medium text-stone-900">{accountingSnapshot?.provider || "-"}</span>
                  </div>
                </div>

                {accountingSnapshot?.invoiceUrl && (
                  <a
                    href={accountingSnapshot.invoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex h-11 items-center justify-center rounded-full border border-stone-300 px-5 text-sm font-semibold text-stone-900 transition-colors hover:bg-white"
                  >
                    Faturayı görüntüle
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-8 xl:grid-cols-[1.25fr_0.85fr]">
          <div className="rounded-lg border border-[#DDE7E4] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100 text-stone-700">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-400">Sipariş Detayı</p>
                <h3 className="mt-1 text-2xl font-semibold text-stone-950">Sipariş içeriği</h3>
              </div>
            </div>

            <div className="mt-8 space-y-5">
              {items.map((item) => {
                const imageSource = resolveStorefrontAssetUrl(item.product?.images?.[0] || "");

                return (
                  <article
                    key={item.id}
                    className="rounded-lg border border-[#DDE7E4] bg-[#F7FAF9] p-4 sm:p-5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-white sm:h-28 sm:w-28">
                        {imageSource ? (
                          <Image
                            src={imageSource}
                            alt={item.product_name}
                            fill
                            sizes="112px"
                            className="object-cover"
                            unoptimized={imageSource.startsWith("/api/assets?")}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-stone-100 text-stone-400">
                            <PackageCheck className="h-8 w-8" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="line-clamp-2 text-base font-semibold leading-6 text-stone-950 sm:text-lg">
                              {item.product_name}
                            </h4>
                            <p className="mt-1 text-sm text-stone-500">{item.variant_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-base font-semibold text-stone-950">{formatPrice(item.total)}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-400">
                              {item.quantity} adet
                            </p>
                          </div>
                        </div>

                        {item.customizations?.[0] && (
                          <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-400">
                              Kişiselleştirme
                            </p>
                            <div className="mt-3 space-y-2 text-sm text-stone-700">
                              {item.customizations[0].selections?.map((selection, index) => (
                                <div
                                  key={`${selection.step_label}-${index}`}
                                  className="flex items-start justify-between gap-4"
                                >
                                  <span className="text-stone-500">{selection.step_label}</span>
                                  <span className="text-right font-medium text-stone-900">
                                    {selection.display_value}
                                  </span>
                                </div>
                              ))}
                              {(item.customizations[0].price_breakdown?.total_adjustment || 0) > 0 && (
                                <div className="flex items-start justify-between gap-4 border-t border-stone-200 pt-2">
                                  <span className="text-stone-500">Ekstra tutar</span>
                                  <span className="font-semibold text-emerald-700">
                                    +{formatPrice(item.customizations[0].price_breakdown.total_adjustment)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-lg border border-[#DDE7E4] bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100 text-stone-700">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-400">Teslimat</p>
                  <h3 className="mt-1 text-2xl font-semibold text-stone-950">Adres bilgisi</h3>
                </div>
              </div>

              <div className="mt-6 space-y-2 text-sm leading-7 text-stone-700">
                <p className="text-base font-semibold text-stone-950">
                  {order.shipping_address?.firstName} {order.shipping_address?.lastName}
                </p>
                <p>{order.shipping_address?.address}</p>
                <p>
                  {[order.shipping_address?.district, order.shipping_address?.city, order.shipping_address?.country]
                    .filter(Boolean)
                    .join(" / ")}
                </p>
                <p>{order.shipping_address?.phone}</p>
                {order.shipping_address?.email && <p>{order.shipping_address.email}</p>}
              </div>
            </div>

            <div className="rounded-lg border border-[#DDE7E4] bg-white p-6 shadow-sm sm:p-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-400">Sipariş Özeti</p>
              <div className="mt-5 space-y-3 text-sm text-stone-600">
                <div className="flex items-center justify-between gap-3">
                  <span>Ara toplam</span>
                  <span className="font-semibold text-stone-900">{formatPrice(order.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Kargo</span>
                  <span className="font-semibold text-stone-900">
                    {order.shipping_cost === 0 ? "Ücretsiz" : formatPrice(order.shipping_cost)}
                  </span>
                </div>
                {order.discount > 0 && (
                  <div className="flex items-center justify-between gap-3 text-emerald-700">
                    <span>İndirim</span>
                    <span className="font-semibold">-{formatPrice(order.discount)}</span>
                  </div>
                )}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-stone-200 pt-5">
                <span className="text-base font-semibold text-stone-950">Toplam tutar</span>
                <span className="text-2xl font-semibold text-primary">{formatPrice(order.total)}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-col items-center justify-center gap-4 pb-4 sm:flex-row">
          <Link
            href="/urunler"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0F766E] px-8 text-sm font-semibold text-white transition-colors hover:bg-[#115E59] sm:w-auto"
          >
            Alışverişe devam et
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link
            href="/hesap"
            className="inline-flex h-12 w-full items-center justify-center rounded-full border border-stone-300 px-8 text-sm font-semibold text-stone-900 transition-colors hover:bg-white sm:w-auto"
          >
            Hesabıma git
          </Link>
        </div>
      </div>
    </div>
  );
}
