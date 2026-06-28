"use client";

import { type ElementType, useEffect, useMemo, useState } from "react";
import { AlertCircle, Info, Shield, UserCheck, Users } from "lucide-react";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin/AdminPageShell";
import { fetchAdminJson } from "@/lib/admin-client-fetch";
import { cn } from "@/lib/utils";
import { getRoleLabel, type UserRole } from "@/lib/permissions";

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  task_definition: string;
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAdmins = async () => {
      try {
        const data = await fetchAdminJson<{
          success: boolean;
          admins: AdminUser[];
          error?: string;
        }>("/api/admin/users", { timeoutMs: 12000 });

        if (!data.success) {
          throw new Error(data.error || "Yöneticiler yüklenemedi.");
        }

        setAdmins(data.admins);
      } catch (loadError) {
        console.error("Load admins error:", loadError);
        setError(loadError instanceof Error ? loadError.message : "Yöneticiler yüklenemedi.");
      } finally {
        setLoading(false);
      }
    };

    void loadAdmins();
  }, []);

  const roleStats = useMemo(() => {
    const superAdmins = admins.filter((admin) => admin.role === "super_admin").length;
    const operations = admins.filter((admin) => admin.role === "order_manager" || admin.role === "product_manager").length;
    const content = admins.filter((admin) => admin.role === "content_creator").length;
    return { superAdmins, operations, content };
  }, [admins]);

  return (
    <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageShell>
          <AdminPageHeader
            sectionLabel="Sistem"
            title="Yöneticiler"
            description="Bu mağazaya atanmış yönetici hesaplarını ve rollerini görüntüleyin."
            metrics={
              <>
                <MetricCell label="Toplam" value={admins.length} detail="yönetici" icon={Users} />
                <MetricCell label="Süper" value={roleStats.superAdmins} detail="yetki" icon={Shield} />
                <MetricCell label="Operasyon" value={roleStats.operations} detail="rol" icon={UserCheck} />
                <MetricCell label="İçerik" value={roleStats.content} detail="rol" icon={Info} />
              </>
            }
          />

          <section className="border-y border-[#FFD1B5] bg-[#FFF8F3] px-4 py-3 text-sm font-medium text-[#9A4B00] xl:px-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6A00]" />
              <p>Yönetici hesapları owner panel üzerinden atanır ve güncellenir. Bu sayfa read-only çalışır.</p>
            </div>
          </section>

          <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 xl:px-5">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">
                  Atanmış yöneticiler
                </h2>
                <p className="mt-1 text-xs font-medium text-[#6B7280]">Rol, e-posta ve görev tanımı tek listede.</p>
              </div>
              <span className="rounded-[8px] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280]">
                {admins.length} kayıt
              </span>
            </div>

            {loading ? (
              <AdminLoadingState label="Yöneticiler hazırlanıyor" className="m-5 border-[#DCE3EC] bg-[#F9F9F9]" />
            ) : error ? (
              <div className="border-y border-rose-200 bg-rose-50 px-5 py-5 text-sm font-semibold text-rose-700">
                {error}
              </div>
            ) : admins.length === 0 ? (
              <div className="p-5">
                <AdminEmptyState
                  icon={<Shield className="h-7 w-7" />}
                  title="Atanmış yönetici yok"
                  description="Bu mağazaya henüz owner panel üzerinden yönetici atanmamış."
                  className="border-[#DCE3EC] bg-[#F9F9F9]"
                />
              </div>
            ) : (
              <div className="divide-y divide-[#E1E7EF]">
                {admins.map((admin) => (
                  <article
                    key={admin.id}
                    className="grid gap-4 px-4 py-4 transition hover:bg-[#FFF8F3] min-[900px]:grid-cols-[minmax(260px,1fr)_180px_minmax(220px,1fr)] min-[900px]:items-center xl:px-5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-[#F9F9F9] text-sm font-semibold text-[#FF6A00]">
                        {admin.full_name?.[0]?.toUpperCase() || admin.email[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold tracking-[-0.02em] text-[#111827]">
                          {admin.full_name || "İsimsiz yönetici"}
                        </h3>
                        <p className="mt-1 truncate text-sm font-medium text-[#6B7280]">{admin.email}</p>
                      </div>
                    </div>

                    <FieldValue label="Rol" value={getRoleLabel(admin.role)} tone={admin.role === "super_admin" ? "accent" : "neutral"} />

                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">Görev</p>
                      <p className={cn("mt-1 line-clamp-2 text-sm font-medium text-[#6B7280]", !admin.task_definition && "text-[#9CA3AF]")}>
                        {admin.task_definition || "Görev tanımı eklenmemiş"}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </AdminPageShell>
      </div>
    </main>
  );
}

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
  value: string;
  tone?: "neutral" | "accent";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">{label}</p>
      <p className={cn("mt-1 truncate text-sm font-semibold text-[#111827]", tone === "accent" && "text-[#E85D04]")}>
        {value}
      </p>
    </div>
  );
}
