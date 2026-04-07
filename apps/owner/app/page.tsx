import Link from "next/link";
import { LaunchStorefrontButton } from "@/components/LaunchStorefrontButton";
import { formatCurrency, formatDateTime, formatPercent } from "@/lib/formatters";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
import { getOwnerDashboard } from "@/lib/control-plane";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";

export default async function OwnerDashboardPage() {
  const auth = await requireOwnerAuth("/");
  const superAdmin = isSuperAdmin(auth);
  
  let dashboardError: string | null = null;
  let dashboard: Awaited<ReturnType<typeof getOwnerDashboard>> | null = null;

  try {
    dashboard = await getOwnerDashboard(auth);
  } catch (error) {
    dashboardError = error instanceof Error ? error.message : "Owner dashboard verisi yüklenemedi.";
  }

  const totals = dashboard?.totals ?? {
    setupRevenue: 0,
    revenue: 0,
    orders: 0,
    customers: 0,
    activeStores: 0,
    draftStores: 0,
    pendingOrders: 0,
    liveStorefronts: 0,
    affiliateExposure: 0
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#2B2B2B] tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm font-medium text-[#64748B]">
            Tüm projeleri, teknik sağlığı ve ticari akışı tek merkezden yönet.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/stores">
            <Button variant="secondary">Tüm Projeler</Button>
          </Link>
          {superAdmin && (
            <Link href="/stores/new">
              <Button leftIcon={<PlusIcon />}>Yeni Proje</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <StatCard
            variant="primary"
            title="Toplam Proje Geliri"
            value={formatCurrency(totals.setupRevenue)}
            subtitle={`${totals.activeStores} aktif, ${totals.draftStores} taslak proje`}
            icon={<RevenueIcon />}
          />
        </div>
        <div className="lg:col-span-2">
          <StatCard
            title="Toplam Ekosistem GMV"
            value={formatCurrency(totals.revenue)}
            subtitle={`Affiliate etkisi: ${formatCurrency(totals.affiliateExposure)}`}
            icon={<ChartIcon />}
          />
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Toplam Sipariş" value={totals.orders.toLocaleString("tr-TR")} />
        <StatCard title="Toplam Müşteri" value={totals.customers.toLocaleString("tr-TR")} />
        <StatCard title="Aktif Proje" value={totals.activeStores} />
        <StatCard title="Taslak Proje" value={totals.draftStores} />
        <StatCard title="Canlı Storefront" value={totals.liveStorefronts} />
        <StatCard title="Bekleyen Sipariş" value={totals.pendingOrders} />
      </div>

      {dashboardError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 text-red-700">
              <AlertIcon />
              <p className="text-sm font-semibold">{dashboardError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attention Stores */}
      {dashboard && dashboard.attentionStores.length > 0 && (
        <Card>
          <CardHeader
            title="Dikkat Gerektiren Projeler"
            description="Kurulum, admin kapsama alanı veya operasyon açısından takip gerektiren mağazalar."
          />
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dashboard.attentionStores.map((store) => (
                <Link
                  key={store.id}
                  href={`/stores/${store.slug}`}
                  className="group p-4 bg-white border border-[#E2E8F0] rounded-xl hover:border-[#CBD5E1] hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-bold text-[#2B2B2B] group-hover:text-[#EB651E] transition-colors">
                      {store.name}
                    </h4>
                    <Badge variant={store.health.label === "hazir" ? "success" : "accent"}>
                      {store.health.label}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium text-[#64748B] line-clamp-2">
                    {store.management.nextAction || "Sonraki aksiyon bekleniyor..."}
                  </p>
                  <div className="flex items-center gap-4 mt-3 text-xs font-semibold text-[#94A3B8]">
                    <span>Admin: {store.storeAdminCount}</span>
                    <span>R2: {store.health.r2Ready ? "Hazır" : "Eksik"}</span>
                    <span>Bekleyen: {store.pendingOrderCount}</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Split Grid: Spotlight & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Spotlight Stores */}
        <Card className="lg:col-span-3">
          <CardHeader
            title="En Çok Gelir Üreten Projeler"
            description="En yüksek hacimli mağazalar"
            action={
              <Link href="/finance">
                <Button variant="secondary" size="sm">Finans Paneli</Button>
              </Link>
            }
          />
          <CardContent>
            {!dashboard || dashboard.spotlightStores.length === 0 ? (
              <EmptyState
                title="Henüz Veri Yok"
                description="İlk senkronizasyondan sonra projeler burada listelenecek."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E2E8F0]">
                      <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Proje</th>
                      <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Durum</th>
                      <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Ciro</th>
                      <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Sipariş</th>
                      <th className="text-right py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.spotlightStores.map((store) => (
                      <tr key={store.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                        <td className="py-4 px-4">
                          <div className="font-semibold text-[#2B2B2B]">{store.name}</div>
                          <div className="text-sm font-medium text-[#94A3B8]">{store.storefrontDomain}</div>
                        </td>
                        <td className="py-4 px-4">
                          <Badge variant="accent">{store.health.label}</Badge>
                        </td>
                        <td className="py-4 px-4 font-bold text-[#2B2B2B]">{formatCurrency(store.totalRevenue)}</td>
                        <td className="py-4 px-4 font-medium text-[#64748B]">{store.orderCount}</td>
                        <td className="py-4 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Link href={`/stores/${store.slug}`}>
                              <Button variant="secondary" size="sm">Detay</Button>
                            </Link>
                            {superAdmin && (
                              <LaunchStorefrontButton slug={store.slug} currentStatus={store.storefrontStatus} />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Son Aktiviteler"
            description="Atama, profil güncelleme ve proje hareketleri"
          />
          <CardContent>
            {!dashboard || dashboard.recentActivity.length === 0 ? (
              <EmptyState
                title="Henüz Aktivite Yok"
                description="Yeni aktiviteler burada görünecek."
              />
            ) : (
              <div className="space-y-4">
                {dashboard.recentActivity.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 p-3 bg-[#F8FAFC] rounded-lg">
                    <div className="w-8 h-8 bg-[#EB651E]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <ActivityIcon />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[#2B2B2B] truncate">{item.targetLabel}</p>
                      <p className="text-xs font-medium text-[#64748B]">{item.action.replace(/_/g, " ")}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-[#2B2B2B]">{item.actorName}</p>
                      <p className="text-xs font-medium text-[#94A3B8]">{formatDateTime(item.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Icons
function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function RevenueIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg className="w-4 h-4 text-[#EB651E]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}
