"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CreditCard,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Package,
  Phone,
  Shield,
  UserRound,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

type AccountAddress = {
  id: string;
  title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  postal_code?: string | null;
  is_default?: boolean;
};

type AccountOrder = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
};

type AccountCustomer = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  total_orders?: number;
  total_spent?: number;
  addresses?: AccountAddress[];
  orders?: AccountOrder[];
};

type AccountPayload = {
  customer: AccountCustomer;
  orders: AccountOrder[];
  authSource: string;
};

function getStatusLabel(status: string) {
  switch (status) {
    case "pending":
      return "Beklemede";
    case "confirmed":
      return "Onaylandi";
    case "preparing":
      return "Hazirlaniyor";
    case "shipped":
      return "Kargolandi";
    case "delivered":
      return "Teslim Edildi";
    case "cancelled":
      return "Iptal";
    case "refunded":
      return "Iade Edildi";
    default:
      return status;
  }
}

function getStatusClasses(status: string) {
  switch (status) {
    case "delivered":
      return "bg-emerald-100 text-emerald-700";
    case "shipped":
      return "bg-blue-100 text-blue-700";
    case "preparing":
      return "bg-amber-100 text-amber-700";
    case "pending":
      return "bg-gray-100 text-gray-700";
    case "cancelled":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function AccountPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      router.push("/giris?next=/hesap");
      return;
    }

    let cancelled = false;

    const loadAccount = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/account", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const payload = await response.json().catch(() => ({}));

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          if (response.status === 401) {
            router.push("/giris?next=/hesap");
            return;
          }

          setError(payload.error || "Hesap bilgileri yuklenemedi.");
          setAccount(null);
          return;
        }

        setAccount({
          customer: payload.customer,
          orders: payload.orders || payload.customer?.orders || [],
          authSource: payload.authSource || "logto",
        });
      } catch (loadError) {
        if (!cancelled) {
          setError("Hesap bilgileri yuklenemedi.");
          setAccount(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadAccount();

    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  const customer = account?.customer ?? null;
  const addresses = customer?.addresses ?? [];
  const orders = account?.orders ?? customer?.orders ?? [];
  const displayName = useMemo(() => {
    if (!customer) {
      return user?.email?.split("@")[0] || "Musteri";
    }

    const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
    return fullName || customer.email || user?.email || "Musteri";
  }, [customer, user]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="font-medium">Hesabiniz yukleniyor...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <div className="bg-primary py-10 text-white">
        <div className="container mx-auto px-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                  <Shield className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                  Guvenli Musteri Oturumu
                </span>
              </div>
              <h1 className="text-3xl font-bold">Hesabim</h1>
              <p className="mt-2 text-white/80">Hos geldiniz, {displayName}</p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold transition-colors hover:bg-white/15"
            >
              <LogOut className="h-4 w-4" />
              Oturumu Kapat
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                  <UserRound className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Profil Bilgileri</h2>
                  <p className="text-sm text-gray-500">Logto oturumu ile bagli musteri profili</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500">
                    <Mail className="h-4 w-4" />
                    E-posta
                  </div>
                  <p className="font-semibold text-gray-900">{customer?.email || user.email}</p>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500">
                    <Phone className="h-4 w-4" />
                    Telefon
                  </div>
                  <p className="font-semibold text-gray-900">{customer?.phone || "Henüz eklenmedi"}</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-500">Ad Soyad</p>
                <p className="mt-2 font-semibold text-gray-900">{displayName}</p>
              </div>
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Siparislerim</h2>
                  <p className="text-sm text-gray-500">Bu hesaba bagli siparisleriniz</p>
                </div>
              </div>

              {orders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500">
                  Bu hesaba bagli bir siparis bulunmuyor. Misafir siparisleriniz ayni e-posta ile giris
                  yaptiginizda otomatik olarak baglanir.
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/siparisler/${order.id}`}
                      className="block rounded-2xl border border-gray-100 bg-gray-50 p-4 transition-colors hover:border-primary/30 hover:bg-white"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{order.order_number}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(order.created_at).toLocaleDateString("tr-TR")}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(order.status)}`}
                          >
                            {getStatusLabel(order.status)}
                          </span>
                          <span className="font-semibold text-gray-900">{formatPrice(Number(order.total) || 0)}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Hesap Ozeti</h2>
                  <p className="text-sm text-gray-500">Toplam siparis ve harcama bilgisi</p>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-sm font-medium text-gray-500">Toplam Siparis</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{customer?.total_orders || orders.length}</p>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-sm font-medium text-gray-500">Toplam Harcama</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {formatPrice(Number(customer?.total_spent) || 0)}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Kayitli Adresler</h2>
                  <p className="text-sm text-gray-500">Checkout sirasinda kullanilan teslimat adresleri</p>
                </div>
              </div>

              {addresses.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500">
                  Henüz kayitli adres bulunmuyor. Ilk siparisinizden sonra teslimat adresiniz burada
                  gorunur.
                </div>
              ) : (
                <div className="space-y-3">
                  {addresses.map((address) => (
                    <div key={address.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="font-semibold text-gray-900">
                          {address.title || "Teslimat Adresi"}
                        </p>
                        {address.is_default ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                            Varsayilan
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-gray-700">
                        {[address.first_name, address.last_name].filter(Boolean).join(" ")}
                      </p>
                      <p className="mt-1 text-sm text-gray-700">{address.address}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {[address.district, address.city, address.postal_code].filter(Boolean).join(" / ")}
                      </p>
                      {address.phone ? <p className="mt-1 text-sm text-gray-500">{address.phone}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-primary">
            <ArrowRight className="h-4 w-4 rotate-180" />
            Alisverise devam et
          </Link>
        </div>
      </div>
    </div>
  );
}
