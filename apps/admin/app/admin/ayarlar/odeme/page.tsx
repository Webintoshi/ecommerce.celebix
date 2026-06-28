"use client";

import { type ElementType, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  CreditCard,
  Edit,
  Filter,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  TestTube,
  Trash2,
  Zap,
} from "lucide-react";
import { AdminEmptyState, AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import { PaymentProviderLogo } from "@/components/admin/payment-provider-logo";
import { getPaymentGatewayRuntimeStatus, getPaymentProviderDefinition } from "@/lib/payment-providers";
import {
  deletePaymentGateway,
  duplicatePaymentGateway,
  getPaymentGateways,
  getPaymentGatewayStats,
  testPaymentGatewayConnection,
  togglePaymentGatewayStatus,
} from "@/lib/payments";
import { cn } from "@/lib/utils";
import type { PaymentGatewayConfig, PaymentMethodStatus } from "@/types/payment";

export default function PaymentSettingsPage() {
  const [paymentGateways, setPaymentGateways] = useState<PaymentGatewayConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentMethodStatus | "all">("all");
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean>>({});

  const loadPaymentGateways = async () => {
    setLoading(true);
    const gateways = await getPaymentGateways();
    setPaymentGateways(gateways);
    setLoading(false);
  };

  useEffect(() => {
    async function initialize() {
      const gateways = await getPaymentGateways();
      setPaymentGateways(gateways);
      setLoading(false);
    }

    void initialize();
  }, []);

  const handleToggleStatus = async (id: string, currentStatus: PaymentMethodStatus) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    await togglePaymentGatewayStatus(id, newStatus);
    void loadPaymentGateways();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Bu ödeme yöntemini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
      await deletePaymentGateway(id);
      void loadPaymentGateways();
    }
  };

  const handleDuplicate = async (id: string) => {
    await duplicatePaymentGateway(id);
    void loadPaymentGateways();
  };

  const handleTestConnection = async (id: string) => {
    setTestingConnection(id);
    const success = await testPaymentGatewayConnection(id);
    setTestResults((prev) => ({ ...prev, [id]: success }));
    setTestingConnection(null);
  };

  const filteredGateways = paymentGateways.filter((gateway) => {
    const matchesSearch =
      gateway.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      gateway.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || gateway.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const stats = getPaymentGatewayStats();
  const runtimeReadyCount = paymentGateways.filter((gateway) => getPaymentGatewayRuntimeStatus(gateway).isReady).length;

  return (
    <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageShell>
          <AdminPageHeader
            sectionLabel="Ayarlar"
            title="Ödeme"
            description="Ödeme sağlayıcılarını ve checkout hazırlığını yönetin."
            actions={
              <>
                <button
                  type="button"
                  onClick={loadPaymentGateways}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                  title="Yenile"
                >
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                </button>
                <Link
                  href="/admin/ayarlar/odeme/yeni"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.16)] transition hover:bg-[#E85D04]"
                >
                  <Plus className="h-4 w-4" />
                  Yeni yöntem
                </Link>
              </>
            }
            metrics={
              <>
                <MetricCell label="Toplam" value={stats.total} detail="yöntem" icon={CreditCard} />
                <MetricCell label="Aktif" value={stats.active} detail="sağlayıcı" icon={CheckCircle2} />
                <MetricCell label="Test" value={stats.testMode} detail="mod" icon={TestTube} />
                <MetricCell label="Hazır" value={runtimeReadyCount} detail="checkout" icon={ShieldCheck} />
              </>
            }
          />

          <section className="border-y border-[#FFD1B5] bg-[#FFF8F3] px-4 py-3 text-sm font-medium text-[#9A4B00] xl:px-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6A00]" />
              <p>
                Kartlı sağlayıcılar canlı checkout&apos;ta görünmeden önce runtime kayıtları, provider init akışı ve
                callback/webhook doğrulaması tamamlanmış olmalıdır.
              </p>
            </div>
          </section>

          <section className="grid gap-3 border-b border-[#E1E7EF] bg-[#F9F9F9] pb-4 min-[920px]:grid-cols-[minmax(0,1fr)_220px_auto] min-[920px]:items-center">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B95A5]" />
              <input
                type="text"
                placeholder="Ödeme yöntemi ara"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-10 w-full rounded-[8px] border border-[#DCE3EC] bg-white py-2 pl-11 pr-3 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
              />
            </label>

            <label className="flex h-10 items-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563]">
              <Filter className="h-4 w-4 text-[#8B95A5]" />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as PaymentMethodStatus | "all")}
                className="w-full bg-transparent text-sm font-semibold text-[#4B5563] outline-none"
              >
                <option value="all">Tüm durumlar</option>
                <option value="active">Aktif</option>
                <option value="inactive">Pasif</option>
                <option value="test">Test modu</option>
              </select>
            </label>

            <div className="flex h-10 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#6B7280]">
              {filteredGateways.length} kayıt gösteriliyor
            </div>
          </section>

          <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 xl:px-5">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">
                  Ödeme sağlayıcıları
                </h2>
                <p className="mt-1 text-xs font-medium text-[#6B7280]">
                  Sağlayıcı durumu, ortam ve checkout hazırlığı tek listede.
                </p>
              </div>
              <span className="rounded-[8px] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280]">
                {paymentGateways.length} yöntem
              </span>
            </div>

            {loading ? (
              <div className="flex min-h-[240px] items-center justify-center text-sm font-semibold text-[#6B7280]">
                <RefreshCw className="mr-3 h-5 w-5 animate-spin text-[#FF6A00]" />
                Ödeme yöntemleri yükleniyor
              </div>
            ) : filteredGateways.length === 0 ? (
              <div className="p-5">
                <AdminEmptyState
                  icon={<CreditCard className="h-7 w-7" />}
                  title="Ödeme yöntemi bulunamadı"
                  description="İlk ödeme yönteminizi ekleyerek checkout hazırlığını başlatın."
                  action={
                    <Link
                      href="/admin/ayarlar/odeme/yeni"
                      className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white transition hover:bg-[#E85D04]"
                    >
                      <Plus className="h-4 w-4" />
                      Yeni yöntem
                    </Link>
                  }
                  className="border-[#DCE3EC] bg-[#F9F9F9]"
                />
              </div>
            ) : (
              <div className="divide-y divide-[#E1E7EF]">
                {filteredGateways.map((gateway) => {
                  const runtimeStatus = getPaymentGatewayRuntimeStatus(gateway);
                  const providerDefinition = getPaymentProviderDefinition(gateway.gateway);
                  const canTestConnection = providerDefinition.supportsConnectionTest;
                  const testResult = testResults[gateway.id];

                  return (
                    <article
                      key={gateway.id}
                      className="grid gap-4 px-4 py-4 transition hover:bg-[#FFF8F3] min-[1120px]:grid-cols-[minmax(320px,1.2fr)_110px_110px_170px_auto] min-[1120px]:items-center xl:px-5"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <PaymentProviderLogo
                          gateway={gateway.gateway}
                          name={gateway.name}
                          accentClassName={providerDefinition.accentClassName}
                          size={44}
                          iconClassName="h-5 w-5"
                          containerClassName="h-11 w-11 shrink-0 border border-[#DCE3EC]"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-semibold tracking-[-0.02em] text-[#111827]">
                              {gateway.name}
                            </h3>
                            {testResult !== undefined ? (
                              <span className={cn("text-xs font-semibold", testResult ? "text-emerald-700" : "text-rose-600")}>
                                {testResult ? "Test başarılı" : "Test başarısız"}
                              </span>
                            ) : null}
                          </div>
                          {gateway.description ? (
                            <p className="mt-1 line-clamp-1 text-sm font-medium text-[#6B7280]">{gateway.description}</p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {gateway.supportedMethods?.map((method) => (
                              <span key={method} className="text-xs font-semibold text-[#8B95A5]">
                                {method}
                              </span>
                            ))}
                          </div>
                          {!runtimeStatus.isReady ? (
                            <p className="mt-2 line-clamp-1 text-xs font-semibold text-[#E85D04]">{runtimeStatus.message}</p>
                          ) : null}
                        </div>
                      </div>

                      <FieldValue label="Durum" value={getStatusLabel(gateway.status)} tone={getStatusTone(gateway.status)} />
                      <FieldValue label="Ortam" value={gateway.environment === "production" ? "Canlı" : "Test"} tone={gateway.environment === "production" ? "danger" : "neutral"} />
                      <FieldValue label="Checkout" value={runtimeStatus.label} tone={runtimeStatus.isReady ? "success" : "warning"} />

                      <div className="flex flex-wrap items-center gap-2 min-[1120px]:justify-end">
                        <button
                          type="button"
                          onClick={() => void handleToggleStatus(gateway.id, gateway.status)}
                          className={cn(
                            "relative inline-flex h-7 w-12 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]",
                            gateway.status === "active" ? "bg-[#FF6A00]" : "bg-[#DCE3EC]",
                          )}
                          aria-label={`${gateway.name} durumunu değiştir`}
                        >
                          <span
                            className={cn(
                              "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition",
                              gateway.status === "active" ? "translate-x-6" : "translate-x-1",
                            )}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleTestConnection(gateway.id)}
                          disabled={testingConnection === gateway.id || !canTestConnection}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {testingConnection === gateway.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Zap className="h-4 w-4" />
                          )}
                          {canTestConnection ? "Test" : "Hazırlanıyor"}
                        </button>
                        <Link
                          href={`/admin/ayarlar/odeme/${gateway.id}/duzenle`}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-3 text-sm font-semibold text-white transition hover:bg-[#E85D04]"
                        >
                          <Edit className="h-4 w-4" />
                          Düzenle
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDuplicate(gateway.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white text-[#6B7280] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                          title="Kopyala"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(gateway.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50"
                          title="Sil"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </AdminPageShell>
      </div>
    </main>
  );
}

function getStatusLabel(status: PaymentMethodStatus) {
  switch (status) {
    case "active":
      return "Aktif";
    case "inactive":
      return "Pasif";
    case "test":
      return "Test";
    default:
      return status;
  }
}

function getStatusTone(status: PaymentMethodStatus): FieldTone {
  switch (status) {
    case "active":
      return "success";
    case "inactive":
      return "danger";
    case "test":
      return "warning";
    default:
      return "neutral";
  }
}

type FieldTone = "neutral" | "success" | "warning" | "danger";

function MetricCell({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ElementType;
}) {
  return (
    <div className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">{label}</p>
        <Icon className="h-4 w-4 text-[#9CA3AF]" />
      </div>
      <div className="mt-3 flex items-end gap-2">
        <p className="truncate text-3xl font-semibold tracking-[-0.04em] text-[#111827]">{value}</p>
        <span className="pb-1 text-sm font-medium text-[#6B7280]">{detail}</span>
      </div>
    </div>
  );
}

function FieldValue({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: FieldTone;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-sm font-semibold text-[#111827]",
          tone === "success" && "text-emerald-700",
          tone === "warning" && "text-[#E85D04]",
          tone === "danger" && "text-rose-600",
        )}
      >
        {value}
      </p>
    </div>
  );
}
