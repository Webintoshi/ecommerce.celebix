"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, LogOut } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { CustomerAuthMigrationNotice } from "@/components/auth/CustomerAuthMigrationNotice";
import { isLogtoCustomerAuthEnabled } from "@/lib/customer-auth-provider";
import { isStorefrontCustomerAuthMigrationRequired } from "@/lib/supabase-disconnect-readiness";

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
      return "Onaylandı";
    case "preparing":
      return "Hazırlanıyor";
    case "shipped":
      return "Kargolandı";
    case "delivered":
      return "Teslim edildi";
    case "cancelled":
      return "İptal";
    case "refunded":
      return "İade edildi";
    default:
      return status;
  }
}

function getStatusClasses(status: string) {
  switch (status) {
    case "delivered":
      return "border-[#C4A062]/40 bg-[#FBF8F4] text-[#755a2d]";
    case "shipped":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "preparing":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "cancelled":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-[#E8DFD3] bg-[#FAF7F2] text-neutral-600";
  }
}

function AccountCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[1.25rem] border border-[#E8DFD3] bg-white px-5 py-6 sm:px-6 sm:py-7",
        className,
      )}
    >
      <h2 className="font-serif text-xl text-[#12100D]">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-[#E8DFD3] py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </span>
      <span className="text-sm font-medium text-[#12100D] sm:text-right">{value}</span>
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const authMigrationRequired = isStorefrontCustomerAuthMigrationRequired();
  const logtoCustomerAuthEnabled = isLogtoCustomerAuthEnabled();
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authMigrationRequired) {
      setLoading(false);
      return;
    }

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

          setError(payload.error || "Hesap bilgileri yüklenemedi.");
          setAccount(null);
          return;
        }

        setAccount({
          customer: payload.customer,
          orders: payload.orders || payload.customer?.orders || [],
          authSource: payload.authSource || "logto",
        });
      } catch {
        if (!cancelled) {
          setError("Hesap bilgileri yüklenemedi.");
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
  }, [authLoading, authMigrationRequired, router, user]);

  const customer = account?.customer ?? null;
  const addresses = customer?.addresses ?? [];
  const orders = account?.orders ?? customer?.orders ?? [];
  const displayName = useMemo(() => {
    if (!customer) {
      return user?.email?.split("@")[0] || "Müşteri";
    }

    const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
    return fullName || customer.email || user?.email || "Müşteri";
  }, [customer, user]);

  const totalOrders = customer?.total_orders ?? orders.length;
  const totalSpent = Number(customer?.total_spent) || 0;

  const logoutHref = useMemo(
    () => `/api/auth/sign-out?next=${encodeURIComponent("/giris?next=/hesap&logged_out=1")}`,
    [],
  );

  if (authMigrationRequired) {
    return (
      <CustomerAuthMigrationNotice
        title="Müşteri hesabım sayfası geçici olarak pasif"
        description="DeryCraft light_postgres provasında müşteri auth ve hesap geçmişi bu yüzey kontrollü olarak kapatıldı."
        primaryHref="/"
        primaryLabel="Mağazaya dön"
      />
    );
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#FAF7F2]">
        <div className="flex items-center gap-3 text-neutral-600">
          <Loader2 className="h-6 w-6 animate-spin text-[#8A6B37]" />
          <span className="text-sm font-medium">Hesabınız yükleniyor…</span>
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

  const logoutButtonClass =
    "inline-flex items-center justify-center gap-2 border border-[#E8DFD3] bg-white px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#12100D] transition-colors hover:border-[#C4A062] hover:text-[#8A6B37]";

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <div className="border-b border-[#E8DFD3] bg-white">
        <div className="container-premium py-8 sm:py-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#8B6914]">
                Hesabım
              </p>
              <h1 className="mt-2 font-serif text-3xl text-[#12100D] sm:text-[2.15rem]">
                Hoş geldiniz, {displayName}
              </h1>
            </div>

            {logtoCustomerAuthEnabled ? (
              <a href={logoutHref} className={logoutButtonClass}>
                <LogOut className="h-4 w-4" />
                Çıkış yap
              </a>
            ) : (
              <button type="button" onClick={handleLogout} className={logoutButtonClass}>
                <LogOut className="h-4 w-4" />
                Çıkış yap
              </button>
            )}
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:max-w-md sm:gap-4">
            <div className="rounded-xl border border-[#E8DFD3] bg-[#FBF8F4] px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Sipariş
              </p>
              <p className="mt-1 font-serif text-2xl text-[#12100D]">{totalOrders}</p>
            </div>
            <div className="rounded-xl border border-[#E8DFD3] bg-[#FBF8F4] px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Toplam harcama
              </p>
              <p className="mt-1 font-serif text-2xl text-[#12100D]">{formatPrice(totalSpent)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container-premium py-8 sm:py-10">
        {error ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mx-auto max-w-3xl space-y-6">
          <AccountCard title="Profil">
            <ProfileRow label="Ad soyad" value={displayName} />
            <ProfileRow label="E-posta" value={customer?.email || user.email || "—"} />
            <ProfileRow label="Telefon" value={customer?.phone?.trim() || "—"} />
          </AccountCard>

          <AccountCard title="Siparişlerim">
            {orders.length === 0 ? (
              <div className="space-y-4">
                <p className="text-sm leading-7 text-neutral-600">
                  Henüz siparişiniz bulunmuyor.
                </p>
                <Link
                  href="/urunler"
                  className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A6B37] transition-colors hover:text-[#755a2d]"
                >
                  Alışverişe başla
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[#E8DFD3]">
                {orders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/siparisler/${order.id}`}
                    className="flex flex-col gap-3 py-4 transition-colors first:pt-0 last:pb-0 hover:opacity-80 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#12100D]">{order.order_number}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {new Date(order.created_at).toLocaleDateString("tr-TR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
                          getStatusClasses(order.status),
                        )}
                      >
                        {getStatusLabel(order.status)}
                      </span>
                      <span className="text-sm font-semibold text-[#12100D]">
                        {formatPrice(Number(order.total) || 0)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </AccountCard>

          {addresses.length > 0 ? (
            <AccountCard title="Kayıtlı adresler">
              <div className="space-y-4">
                {addresses.map((address) => (
                  <div
                    key={address.id}
                    className="rounded-xl border border-[#E8DFD3] bg-[#FBF8F4] px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#12100D]">
                        {address.title || "Teslimat adresi"}
                      </p>
                      {address.is_default ? (
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8A6B37]">
                          Varsayılan
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-neutral-700">
                      {[address.first_name, address.last_name].filter(Boolean).join(" ")}
                    </p>
                    <p className="mt-1 text-sm text-neutral-600">{address.address}</p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {[address.district, address.city, address.postal_code]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            </AccountCard>
          ) : null}
        </div>

        <div className="mx-auto mt-10 max-w-3xl text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:text-[#8A6B37]"
          >
            <ArrowRight className="h-3.5 w-3.5 rotate-180" />
            Mağazaya dön
          </Link>
        </div>
      </div>
    </div>
  );
}
