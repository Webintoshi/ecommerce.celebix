
import { createServerClient } from "@/lib/supabase";
import { formatPrice } from "@/lib/utils";
import { Check, ChevronRight, ShoppingBag, MapPin, Calendar, CreditCard } from "lucide-react";
import Link from "next/link";
import OrderSuccessToast from "@/components/order-success-toast";
import { normalizeStoredCustomization } from "@/lib/customization/normalize";
import { OrderItemCustomization } from "@/types/product-customization";
import { getOrderAccountingSnapshot } from "@/lib/db/accounting";

type ShippingAddress = {
    firstName?: string;
    lastName?: string;
    address?: string;
    city?: string;
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

    // Parallel fetch: order and payment settings
    const [orderResponse, settingsResponse] = await Promise.all([
        supabase.from("orders").select("*").eq("id", id).single(),
        supabase.from("settings").select("value").eq("key", "payment_gateways").single(),
    ]);

    const order: Order | null = orderResponse.data;
    const orderError = orderResponse.error;
    const paymentGateways = settingsResponse.data?.value || [];

    if (orderError || !order) {
        console.error("Error fetching order:", orderError);
        return (
            <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-4 text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Sipariş Bulunamadı</h1>
                <p className="text-gray-500 mb-8">Aradığınız sipariş mevcut değil veya erişim izniniz yok.</p>
                <Link
                    href="/"
                    className="inline-flex items-center justify-center h-12 px-8 rounded-full bg-primary text-white font-medium hover:bg-red-800 transition-colors"
                >
                    Ana Sayfaya Dön
                </Link>
            </div>
        );
    }

    // Determine Payment Method Name & Icon
    let paymentMethodName = "Ödeme Yöntemi";
    const PaymentIcon = <CreditCard className="h-5 w-5 text-gray-400" />;
    let MethodIconDisplay = <span className="text-xl">💳</span>;

    // Find matching gateway config
    const gatewayConfig = (paymentGateways as PaymentGateway[]).find(
        (g) => g.id === order.payment_method
    );

    if (gatewayConfig) {
        paymentMethodName = gatewayConfig.name;
        if (gatewayConfig.gateway === 'cod') {
            MethodIconDisplay = <span className="text-xl">🚚</span>;
        } else if (gatewayConfig.gateway === 'bank_transfer') {
            MethodIconDisplay = <span className="text-xl">🏦</span>;
        }
    } else {
        // Fallback for direct type IDs (legacy support)
        if (order.payment_method === 'cod') {
            paymentMethodName = 'Kapıda Ödeme';
            MethodIconDisplay = <span className="text-xl">🚚</span>;
        } else if (order.payment_method === 'bank_transfer') {
            paymentMethodName = 'Havale / EFT';
            MethodIconDisplay = <span className="text-xl">🏦</span>;
        } else if (order.payment_method === 'credit_card') {
            paymentMethodName = 'Kredi Kartı';
        } else {
            // If absolutely unknown, try to format the ID or generic
            paymentMethodName = 'Kredi Kartı / Banka Kartı';
        }
    }

    // Fetch order items with product details
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
        customizations: (item.customizations || [])
            .map((customization: Partial<OrderItemCustomization>) =>
                normalizeStoredCustomization(customization)
            )
            .filter(Boolean),
    }));

    let accountingSnapshot = null;
    try {
        accountingSnapshot = await getOrderAccountingSnapshot(id);
    } catch (accountingError) {
        console.error("Public order accounting snapshot error:", accountingError);
    }

    const paymentState = resolvedSearchParams.payment;
    const paymentBanner = paymentState === "failed"
        ? {
            className: "border-red-200 bg-red-50 text-red-700",
            title: "Odeme basarisiz",
            description: "Kart odemesi tamamlanamadi. Siparisiniz kaydedildi; odemeyi yeniden deneyebilir veya bizimle iletisime gecebilirsiniz.",
        }
        : paymentState === "pending"
            ? {
                className: "border-amber-200 bg-amber-50 text-amber-700",
                title: "Odeme sonucu kontrol ediliyor",
                description: "Saglayicidan donus alindi. Odeme sonucu kisa sure icinde siparisinize yansir.",
            }
            : paymentState === "success"
                ? {
                    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
                    title: "Odeme tamamlandi",
                    description: "Odemeniz basariyla alindi ve siparisiniz onaya girdi.",
                }
                : null;

    return (
        <div className="min-h-screen bg-[#FAFAFA] pb-20 pt-8">
            <OrderSuccessToast />
            <div className="container mx-auto max-w-[800px] px-4">
                {paymentBanner && (
                    <div className={`mb-6 rounded-2xl border p-4 ${paymentBanner.className}`}>
                        <p className="font-semibold">{paymentBanner.title}</p>
                        <p className="mt-1 text-sm">{paymentBanner.description}</p>
                    </div>
                )}

                {/* Success Header */}
                <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-600 shadow-lg shadow-emerald-100">
                        <Check className="h-10 w-10 stroke-[3]" />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 mb-4 tracking-tight">
                        Siparişiniz Alındı!
                    </h1>
                    <p className="text-gray-500 text-lg max-w-md mx-auto">
                        Teşekkür ederiz! Siparişiniz başarıyla oluşturuldu ve hazırlanmaya başlandı.
                    </p>
                </div>

                {/* Order Info Card */}
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden mb-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">

                    {/* Header */}
                    <div className="bg-gray-50/50 p-6 md:p-8 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-1">Sipariş Numarası</p>
                            <p className="text-xl font-bold text-gray-900 font-mono">#{order.order_number}</p>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500 bg-white px-4 py-2 rounded-full border border-gray-100 shadow-sm">
                            <Calendar className="h-4 w-4" />
                            <span className="text-sm font-medium">
                                {new Date(order.created_at).toLocaleDateString("tr-TR", {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </span>
                        </div>
                    </div>

                    {/* Items */}
                    <div className="p-6 md:p-8">
                        <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <ShoppingBag className="h-5 w-5 text-primary" />
                            Sipariş İçeriği
                        </h3>
                        <div className="space-y-6">
                            {items.map((item) => (
                                <div key={item.id} className="flex gap-4 items-center">
                                    <div className="w-16 h-16 bg-gray-50 rounded-xl flex items-center justify-center text-2xl border border-gray-100 shrink-0">
                                        {/* Fallback emoji based on category logic */}
                                        {item.product?.category === "fistik-ezmesi" ? "🥜" :
                                            item.product?.category === "findik-ezmesi" ? "🌰" : "🥔"}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-gray-900 truncate">{item.product_name}</h4>
                                        <p className="text-sm text-gray-500">{item.variant_name}</p>
                                        {item.customizations?.[0] && (
                                            <div className="mt-2 text-xs text-gray-600 space-y-1">
                                                {item.customizations[0].selections?.map((selection, idx: number) => (
                                                    <p key={idx}>
                                                        <span className="font-semibold">{selection.step_label}:</span>{" "}
                                                        {selection.display_value}
                                                    </p>
                                                ))}
                                                {(item.customizations[0].price_breakdown?.total_adjustment || 0) > 0 && (
                                                    <p className="text-emerald-600 font-semibold">
                                                        Ekstra: +{formatPrice(item.customizations[0].price_breakdown.total_adjustment)}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-gray-900">{formatPrice(item.total)}</p>
                                        <p className="text-xs text-gray-500">{item.quantity} Adet</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="h-px bg-gray-100 my-8" />

                        {/* Totals */}
                        <div className="space-y-3">
                            <div className="flex justify-between text-gray-600">
                                <span>Ara Toplam</span>
                                <span className="font-bold">{formatPrice(order.subtotal)}</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                                <span>Kargo</span>
                                <span className="font-bold">{order.shipping_cost === 0 ? "Ücretsiz" : formatPrice(order.shipping_cost)}</span>
                            </div>
                            {order.discount > 0 && (
                                <div className="flex justify-between text-emerald-600">
                                    <span>İndirim</span>
                                    <span className="font-bold">-{formatPrice(order.discount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center text-gray-900 text-xl font-bold pt-4 border-t border-gray-100 mt-4">
                                <span>Toplam Tutar</span>
                                <span className="text-primary">{formatPrice(order.total)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Shipping & Payment Info Grid */}
                <div className="grid md:grid-cols-2 gap-6 mb-12 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">

                    {/* Shipping Address */}
                    <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-8">
                        <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-gray-400" />
                            Teslimat Adresi
                        </h3>
                        <div className="text-gray-600 space-y-2 text-sm leading-relaxed">
                            <p className="font-medium text-gray-900 text-base">
                                {order.shipping_address?.firstName} {order.shipping_address?.lastName}
                            </p>
                            <p>{order.shipping_address?.address}</p>
                            <p>
                                {order.shipping_address?.city} / {order.shipping_address?.country}
                            </p>
                            <p>{order.shipping_address?.phone}</p>
                        </div>
                    </div>

                    {/* Payment Method */}
                    <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-8">
                        <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                            {PaymentIcon}
                            Ödeme Yöntemi
                        </h3>
                        <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
                                {MethodIconDisplay}
                            </div>
                            <div>
                                <p className="font-bold text-gray-900 text-sm">
                                    {paymentMethodName}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {gatewayConfig?.gateway === 'bank_transfer' ? 'Ödeme bekleniyor' :
                                        gatewayConfig?.gateway === 'cod' ? 'Teslimatta ödenecek' :
                                            'Ödeme alındı'}
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-600 space-y-1">
                            <p>
                                <span className="font-semibold">Muhasebe Durumu:</span>{" "}
                                {accountingSnapshot?.syncStatus || "idle"}
                            </p>
                            <p>
                                <span className="font-semibold">Fatura No:</span>{" "}
                                {accountingSnapshot?.invoiceNo || "-"}
                            </p>
                            <p>
                                <span className="font-semibold">Sağlayıcı:</span>{" "}
                                {accountingSnapshot?.provider || "-"}
                            </p>
                            {accountingSnapshot?.invoiceUrl && (
                                <a
                                    href={accountingSnapshot.invoiceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-block text-blue-600 hover:underline"
                                >
                                    Faturayı Görüntüle
                                </a>
                            )}
                        </div>
                    </div>

                </div>

                {/* Actions */}
                <div className="text-center animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500">
                    <Link
                        href="/urunler"
                        className="inline-flex items-center gap-2 h-14 px-10 rounded-full bg-primary text-white font-bold text-lg hover:bg-red-800 transition-all hover:scale-105 shadow-xl shadow-primary/20"
                    >
                        Alışverişe Devam Et
                        <ChevronRight className="h-5 w-5" />
                    </Link>
                </div>

            </div>
        </div>
    );
}
