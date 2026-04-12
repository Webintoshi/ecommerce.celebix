"use client";

import { useEffect, useState, type ElementType } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle,
  Clock,
  Copy,
  CreditCard,
  Edit,
  ExternalLink,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  ShoppingBag,
  Star,
  Trash2,
  TrendingUp,
  Truck,
  XCircle,
} from "lucide-react";

interface CustomerDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

interface Customer {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  status: string;
  total_orders: number;
  total_spent: number;
  last_order_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  addresses: Address[];
}

interface Address {
  id: string;
  type: string;
  first_name: string;
  last_name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string | null;
  is_default: boolean;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  total: number;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  payment_method: string;
  payment_status: string;
  created_at: string;
  items: OrderItem[];
}

interface OrderItem {
  id: string;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  price: number;
  total: number;
}

interface PreferredProduct {
  id: string;
  product_id: string;
  product_name: string;
  variant_name: string | null;
  category: string | null;
  purchase_count: number;
  total_quantity: number;
  total_spent: number;
  last_purchased_at: string;
}

const panelClass =
  "overflow-hidden rounded-[28px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_18px_55px_rgba(0,0,0,0.08)]";

export default function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const router = useRouter();
  const [id, setId] = useState<string>("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [preferredProducts, setPreferredProducts] = useState<PreferredProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "orders" | "addresses" | "preferences">("overview");

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    void loadCustomer();
  }, [id]);

  const loadCustomer = async () => {
    setLoading(true);
    try {
      const customerRes = await fetch(`/api/customers?id=${id}`);
      const customerData = await customerRes.json();

      if (customerData.success && customerData.customer) {
        setCustomer(customerData.customer);

        const ordersRes = await fetch(`/api/admin/customers/${id}/orders`);
        const ordersData = await ordersRes.json();

        if (ordersData.success && ordersData.orders) {
          setOrders(ordersData.orders);
        }

        const prefRes = await fetch(`/api/admin/customers/${id}/preferences`);
        const prefData = await prefRes.json();

        if (prefData.success && prefData.products) {
          setPreferredProducts(prefData.products);
        }
      }
    } catch (error) {
      console.error("Failed to load customer:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!customer) return;

    const fullName = `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || customer.email;

    if (confirm(`"${fullName}" müşterisini silmek istediğinizden emin misiniz?`)) {
      try {
        await fetch(`/api/customers?id=${id}`, { method: "DELETE" });
        router.push("/admin/musteriler");
      } catch (error) {
        console.error("Failed to delete customer:", error);
        alert("Müşteri silinirken bir hata oluştu.");
      }
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const response = await fetch("/api/customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });

      if (response.ok) {
        setCustomer((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 2,
    }).format(price);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getOrderStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; color: string; icon: ElementType }> = {
      pending: { label: "Beklemede", color: "border-amber-200 bg-amber-50 text-amber-700", icon: Clock },
      confirmed: { label: "Onaylandı", color: "border-sky-200 bg-sky-50 text-sky-700", icon: CheckCircle },
      preparing: { label: "Hazırlanıyor", color: "border-orange-200 bg-orange-50 text-orange-700", icon: Package },
      shipped: { label: "Kargolandı", color: "border-indigo-200 bg-indigo-50 text-indigo-700", icon: Truck },
      delivered: { label: "Teslim Edildi", color: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle },
      cancelled: { label: "İptal", color: "border-rose-200 bg-rose-50 text-rose-700", icon: XCircle },
      refunded: { label: "İade", color: "border-orange-200 bg-orange-50 text-orange-700", icon: ArrowLeft },
    };

    const config = configs[status] || configs.pending;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${config.color}`}>
        <Icon className="h-3.5 w-3.5" />
        {config.label}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; color: string }> = {
      active: { label: "Aktif", color: "border-emerald-200 bg-emerald-100/90 text-emerald-700" },
      inactive: { label: "Pasif", color: "border-stone-200 bg-stone-100 text-stone-700" },
      blocked: { label: "Engelli", color: "border-rose-200 bg-rose-100/90 text-rose-700" },
    };

    const config = configs[status] || configs.active;

    return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${config.color}`}>{config.label}</span>;
  };

  const getPaymentMethodName = (method: string) => {
    const methods: Record<string, string> = {
      cod: "Kapıda Ödeme",
      bank_transfer: "Havale/EFT",
      credit_card: "Kredi Kartı",
      paytr: "PAYTR",
      iyzico: "İyzico",
      stripe: "Stripe",
    };
    return methods[method] || method;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5f0eb] to-[#efe5dc]">
        <div className="mx-auto flex min-h-[420px] max-w-[1600px] items-center justify-center px-4 py-10 md:px-6 lg:px-8">
          <div className="inline-flex items-center gap-3 rounded-full border border-[#FE6100]/15 bg-white/90 px-5 py-3 text-sm font-medium text-[#8a4b22] shadow-sm">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#FE6100]/30 border-t-[#FE6100]" />
            Müşteri görünümü hazırlanıyor
          </div>
        </div>
      </main>
    );
  }

  if (!customer) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5f0eb] to-[#efe5dc]">
        <div className="mx-auto max-w-[1600px] px-4 py-10 md:px-6 lg:px-8">
          <div className={`${panelClass} px-6 py-14 text-center`}>
            <h1 className="text-xl font-semibold text-gray-950">Müşteri Bulunamadı</h1>
            <p className="mt-2 text-sm text-gray-500">Aradığınız müşteri mevcut değil.</p>
            <Link
              href="/admin/musteriler"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#FE6100]/15 bg-white px-4 py-3 text-sm font-medium text-[#8a4b22] shadow-sm transition-all hover:border-[#FE6100]/30 hover:bg-[#fff7f1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
            >
              Müşterilere Dön
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const fullName = `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "İsimsiz";
  const defaultAddress = customer.addresses?.find((addr) => addr.is_default) || customer.addresses?.[0];
  const averageOrderValue = customer.total_orders > 0 ? customer.total_spent / customer.total_orders : 0;
  const tabs = [
    { key: "overview", label: "Genel Bakış" },
    { key: "orders", label: `Siparişler (${orders.length})` },
    { key: "addresses", label: `Adresler (${customer.addresses?.length || 0})` },
    { key: "preferences", label: `Tercihler (${preferredProducts.length})` },
  ] as const;

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5f0eb] to-[#efe5dc]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-28 right-[-6rem] h-[24rem] w-[24rem] rounded-full bg-gradient-to-br from-[#FE6100]/12 via-[#FFB067]/8 to-transparent blur-3xl" />
        <div className="absolute left-[-5rem] top-1/3 h-72 w-72 rounded-full bg-gradient-to-tr from-amber-200/20 via-orange-100/10 to-transparent blur-3xl" />
        <div className="absolute bottom-[-8rem] right-1/4 h-80 w-80 rounded-full bg-gradient-to-tl from-rose-100/20 via-[#FE6100]/8 to-transparent blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(254,97,0,0.12)]">
            <div className="flex flex-col gap-5 border-b border-[#FE6100]/8 px-5 py-5 md:px-8 md:py-6 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  href="/admin/musteriler"
                  aria-label="Müşteri listesine dön"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-white text-[#8a4b22] shadow-sm transition-all hover:border-[#FE6100]/25 hover:bg-[#fff7f1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Link>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/20 bg-gradient-to-r from-[#FE6100]/10 to-[#FF8B3D]/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FE6100]">
                    {fullName}
                  </div>
                  {getStatusBadge(customer.status)}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <select
                  value={customer.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  aria-label="Müşteri durumunu değiştir"
                  className="min-h-11 cursor-pointer rounded-2xl border border-[#FE6100]/12 bg-white px-4 py-3 text-sm font-medium text-[#8a4b22] shadow-sm transition-all focus:border-[#FE6100] focus:outline-none focus:ring-4 focus:ring-[#FE6100]/15"
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Pasif</option>
                  <option value="blocked">Engelli</option>
                </select>
                <Link
                  href={`/admin/musteriler/${customer.id}/duzenle`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#FE6100]/15 bg-white px-4 py-3 text-sm font-medium text-[#8a4b22] shadow-sm transition-all hover:border-[#FE6100]/30 hover:bg-[#fff7f1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                >
                  <Edit className="h-4 w-4" />
                  Düzenle
                </Link>
                <button
                  onClick={handleDelete}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm transition-all hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
                >
                  <Trash2 className="h-4 w-4" />
                  Sil
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-px bg-gradient-to-r from-[#FE6100]/10 via-[#FF8B3D]/5 to-[#FE6100]/10 md:grid-cols-2 xl:grid-cols-4">
              <HeroMetric icon={ShoppingBag} label="Toplam Sipariş" value={String(customer.total_orders)} detail="Tamamlanan ve açık sipariş toplamı" />
              <HeroMetric icon={TrendingUp} label="Toplam Harcama" value={formatPrice(customer.total_spent)} detail="Müşteri bazlı toplam gelir" />
              <HeroMetric icon={CreditCard} label="Ortalama Sipariş" value={formatPrice(averageOrderValue)} detail="Sipariş başına ortalama tutar" />
              <HeroMetric icon={Calendar} label="Son Sipariş" value={customer.last_order_at ? formatDate(customer.last_order_at) : "-"} detail="En son işlem tarihi" />
            </div>
          </section>

          <section className={panelClass}>
            <div className="border-b border-[#FE6100]/8 px-4 py-4 md:px-6">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.key;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-4 ${
                        isActive
                          ? "bg-gradient-to-r from-[#FE6100] to-[#E45700] text-white shadow-[0_14px_30px_rgba(254,97,0,0.18)] focus-visible:ring-[#FE6100]/20"
                          : "border border-[#ecdccd] bg-white text-gray-600 hover:border-[#FE6100]/20 hover:text-[#8a4b22] focus-visible:ring-[#FE6100]/15"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {activeTab === "overview" ? (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
              <div className="space-y-6">
                <section className={panelClass}>
                  <div className="flex items-center justify-between gap-4 border-b border-[#FE6100]/8 px-5 py-5 md:px-6">
                    <h2 className="text-lg font-semibold tracking-[-0.02em] text-gray-950">Son Siparişler</h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab("orders")}
                      className="inline-flex items-center gap-1 text-sm font-medium text-[#FE6100] transition-colors hover:text-[#d84f00]"
                    >
                      Tümünü Gör
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  </div>

                  {orders.length === 0 ? (
                    <EmptyState icon={Package} title="Henüz sipariş yok." detail="İlk siparişten sonra sipariş akışı burada görünür." />
                  ) : (
                    <div className="divide-y divide-[#f1e6dc]">
                      {orders.slice(0, 5).map((order) => (
                        <article key={order.id} className="p-5 transition-colors hover:bg-[#fffaf6] md:p-6">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3">
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-gradient-to-br from-[#fff1e7] to-white text-sm font-semibold text-[#FE6100] shadow-sm">
                                #{order.order_number.split("-").pop()}
                              </div>
                              <div>
                                <Link
                                  href={`/admin/siparisler/${order.id}`}
                                  className="font-semibold text-gray-950 transition-colors hover:text-[#FE6100]"
                                >
                                  {order.order_number}
                                </Link>
                                <p className="mt-1 text-sm text-gray-500">{formatDateTime(order.created_at)}</p>
                                <p className="mt-2 text-sm text-gray-600">
                                  {order.items?.length || 0} urun • {getPaymentMethodName(order.payment_method)}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-col items-start gap-2 sm:items-end">
                              <p className="text-lg font-semibold text-gray-950">{formatPrice(order.total)}</p>
                              {getOrderStatusBadge(order.status)}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                {customer.notes ? (
                  <section className="rounded-[28px] border border-amber-200/80 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm md:p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200 bg-white text-amber-700 shadow-sm">
                        <MessageSquare className="h-5 w-5" />
                      </div>
                      <h2 className="text-lg font-semibold tracking-[-0.02em] text-amber-950">Ic Notlar</h2>
                    </div>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-amber-900">{customer.notes}</p>
                  </section>
                ) : null}
              </div>

              <div className="space-y-6">
                <section className={panelClass}>
                  <div className="border-b border-[#FE6100]/8 px-5 py-5 md:px-6">
                    <h2 className="text-lg font-semibold tracking-[-0.02em] text-gray-950">Müşteri Bilgileri</h2>
                  </div>

                  <div className="space-y-4 p-5 md:p-6">
                    <InfoRow
                      icon={Mail}
                      label="E-posta"
                      value={customer.email}
                      onCopy={() => copyToClipboard(customer.email)}
                      actionHref={`mailto:${customer.email}`}
                      actionLabel="E-posta gönder"
                    />
                    {customer.phone ? (
                      <InfoRow
                        icon={Phone}
                        label="Telefon"
                        value={customer.phone}
                        onCopy={() => copyToClipboard(customer.phone || "")}
                        actionHref={`tel:${customer.phone}`}
                        actionLabel="Telefon et"
                      />
                    ) : null}
                    <InfoRow icon={Calendar} label="Kayıt Tarihi" value={formatDateTime(customer.created_at)} />
                    <InfoRow icon={Calendar} label="Son Güncelleme" value={formatDateTime(customer.updated_at)} />
                  </div>
                </section>

                {defaultAddress ? (
                  <section className={panelClass}>
                    <div className="flex items-center justify-between gap-4 border-b border-[#FE6100]/8 px-5 py-5 md:px-6">
                      <h2 className="text-lg font-semibold tracking-[-0.02em] text-gray-950">Varsayılan Adres</h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab("addresses")}
                        className="text-sm font-medium text-[#FE6100] transition-colors hover:text-[#d84f00]"
                      >
                        Tüm Adresler
                      </button>
                    </div>

                    <div className="space-y-3 p-5 text-sm text-gray-700 md:p-6">
                      <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/12 bg-[#fff8f3] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#FE6100]">
                        {defaultAddress.type === "shipping" ? "Teslimat" : "Fatura"}
                      </div>
                      <p className="font-semibold text-gray-950">
                        {defaultAddress.first_name} {defaultAddress.last_name}
                      </p>
                      <p>{defaultAddress.address_line1}</p>
                      {defaultAddress.address_line2 ? <p>{defaultAddress.address_line2}</p> : null}
                      <p className="font-medium text-gray-900">
                        {defaultAddress.city} / {defaultAddress.state}
                      </p>
                      <p>
                        {defaultAddress.postal_code} {defaultAddress.country}
                      </p>
                      {defaultAddress.phone ? (
                        <p className="flex items-center gap-2 pt-1">
                          <Phone className="h-4 w-4 text-[#FE6100]" />
                          {defaultAddress.phone}
                        </p>
                      ) : null}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeTab === "orders" ? (
            <section className={panelClass}>
              <div className="border-b border-[#FE6100]/8 px-5 py-5 md:px-6">
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-gray-950">Tüm Siparişler</h2>
              </div>

              {orders.length === 0 ? (
                <EmptyState icon={Package} title="Henüz sipariş yok." detail="Sipariş oluştuğunda bu liste otomatik olarak dolacak." />
              ) : (
                <div className="divide-y divide-[#f1e6dc]">
                  {orders.map((order) => (
                    <article key={order.id} className="p-5 transition-colors hover:bg-[#fffaf6] md:p-6">
                      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-gradient-to-br from-[#fff1e7] to-white font-semibold text-[#FE6100] shadow-sm">
                            #{order.order_number.split("-").pop()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                              <Link
                                href={`/admin/siparisler/${order.id}`}
                                className="truncate font-semibold text-gray-950 transition-colors hover:text-[#FE6100]"
                              >
                                {order.order_number}
                              </Link>
                              {getOrderStatusBadge(order.status)}
                            </div>
                            <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-2 xl:grid-cols-4">
                              <DetailMini label="Tarih" value={formatDateTime(order.created_at)} />
                              <DetailMini label="Ödeme" value={getPaymentMethodName(order.payment_method)} />
                              <DetailMini label="Ürün" value={`${order.items?.length || 0} adet`} />
                              <DetailMini label="Toplam" value={formatPrice(order.total)} />
                            </div>
                          </div>
                        </div>

                        <Link
                          href={`/admin/siparisler/${order.id}`}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#FE6100]/15 bg-white px-4 py-3 text-sm font-medium text-[#8a4b22] shadow-sm transition-all hover:border-[#FE6100]/30 hover:bg-[#fff7f1]"
                        >
                          Siparişi Aç
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </div>

                      {order.items?.length ? (
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-[#f1e6dc] pt-4">
                          {order.items.slice(0, 4).map((item) => (
                            <span
                              key={item.id}
                              className="inline-flex items-center gap-1 rounded-full border border-[#ecdccd] bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
                            >
                              {item.product_name}
                              {item.variant_name ? ` - ${item.variant_name}` : ""}
                              <span className="text-gray-400">x{item.quantity}</span>
                            </span>
                          ))}
                          {order.items.length > 4 ? (
                            <span className="inline-flex items-center rounded-full border border-[#ecdccd] bg-white px-3 py-1.5 text-xs font-medium text-gray-500">
                              +{order.items.length - 4} daha
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {activeTab === "addresses" ? (
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {customer.addresses?.length ? (
                customer.addresses.map((address) => (
                  <article
                    key={address.id}
                    className={`${panelClass} ${address.is_default ? "ring-1 ring-[#FE6100]/15" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-4 border-b border-[#FE6100]/8 px-5 py-5 md:px-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-gradient-to-br from-[#fff1e7] to-white text-[#FE6100] shadow-sm">
                          <MapPin className="h-5 w-5" />
                        </div>
                        <div>
                          <h2 className="text-base font-semibold text-gray-950">
                            {address.type === "shipping" ? "Teslimat Adresi" : "Fatura Adresi"}
                          </h2>
                        </div>
                      </div>
                      {address.is_default ? (
                        <span className="rounded-full border border-[#FE6100]/15 bg-[#fff8f3] px-3 py-1 text-xs font-semibold text-[#FE6100]">
                          Varsayılan
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-3 p-5 text-sm text-gray-700 md:p-6">
                      <p className="font-semibold text-gray-950">
                        {address.first_name} {address.last_name}
                      </p>
                      <p>{address.address_line1}</p>
                      {address.address_line2 ? <p>{address.address_line2}</p> : null}
                      <p className="font-medium text-gray-900">
                        {address.city} / {address.state}
                      </p>
                      <p>
                        {address.postal_code} {address.country}
                      </p>
                      {address.phone ? (
                        <p className="flex items-center gap-2 pt-1">
                          <Phone className="h-4 w-4 text-[#FE6100]" />
                          {address.phone}
                        </p>
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <div className="col-span-full">
                  <EmptyState icon={MapPin} title="Kayıtlı adres yok." detail="Yeni adres eklendiğinde burada görünür." />
                </div>
              )}
            </section>
          ) : null}

          {activeTab === "preferences" ? (
            <section className={panelClass}>
              <div className="border-b border-[#FE6100]/8 px-5 py-5 md:px-6">
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-gray-950">Tercih Edilen Ürünler</h2>
              </div>

              {preferredProducts.length === 0 ? (
                <EmptyState
                  icon={Star}
                  title="Henüz tercih edilen ürün yok."
                  detail="Müşterinin ilk siparişlerinden sonra ürün tercihleri burada özetlenir."
                />
              ) : (
                <div className="divide-y divide-[#f1e6dc]">
                  {preferredProducts.map((pref) => (
                    <article key={pref.id} className="p-5 transition-colors hover:bg-[#fffaf6] md:p-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-gradient-to-br from-[#fff1e7] to-white text-2xl shadow-sm">
                            {pref.category === "fistik-ezmesi"
                              ? "🥜"
                              : pref.category === "findik-ezmesi"
                                ? "🌰"
                                : pref.category === "kuruyemis"
                                  ? "🥔"
                                  : "📦"}
                          </div>

                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-gray-950">{pref.product_name}</h3>
                              {pref.variant_name ? <span className="text-sm text-gray-500">- {pref.variant_name}</span> : null}
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-2 xl:grid-cols-3">
                              <DetailMini label="Sipariş" value={`${pref.purchase_count} kez`} />
                              <DetailMini label="Adet" value={`${pref.total_quantity} toplam`} />
                              <DetailMini label="Harcama" value={formatPrice(pref.total_spent)} />
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[22px] border border-[#ecdccd] bg-white px-4 py-3 text-sm text-gray-600">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Son Sipariş</div>
                          <div className="mt-1 font-medium text-gray-900">{formatDate(pref.last_purchased_at)}</div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function HeroMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ElementType;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border border-white/70 bg-white/70 px-5 py-5 backdrop-blur-sm md:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-gray-950 md:text-[30px]">{value}</p>
          <p className="mt-1 text-sm text-gray-600">{detail}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-gradient-to-br from-[#fff1e7] to-white text-[#FE6100] shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: ElementType;
  title: string;
  detail: string;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#fff3e9] to-white text-[#FE6100] shadow-sm">
        <Icon className="h-9 w-9" />
      </div>
      <p className="mt-5 text-lg font-semibold text-gray-950">{title}</p>
      <p className="mt-2 text-sm text-gray-500">{detail}</p>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  onCopy,
  actionHref,
  actionLabel,
}: {
  icon: ElementType;
  label: string;
  value: string;
  onCopy?: () => void;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-[22px] border border-[#ecdccd] bg-white/85 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-[#fff8f3] text-[#FE6100]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</p>
          <p className="mt-1 break-all text-sm font-medium text-gray-900">{value}</p>
        </div>
        <div className="flex items-center gap-2">
          {onCopy ? (
            <button
              type="button"
              onClick={onCopy}
              aria-label={`${label} bilgisini kopyala`}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#ecdccd] bg-white text-gray-500 transition-all hover:border-[#FE6100]/20 hover:text-[#FE6100]"
            >
              <Copy className="h-4 w-4" />
            </button>
          ) : null}
          {actionHref && actionLabel ? (
            <a
              href={actionHref}
              aria-label={actionLabel}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#ecdccd] bg-white text-gray-500 transition-all hover:border-[#FE6100]/20 hover:text-[#FE6100]"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetailMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[#ecdccd] bg-white/85 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}
