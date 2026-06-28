"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Info, Shield } from "lucide-react";
import {
  AdminCallout,
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "@/components/admin/AdminPageShell";
import { getRoleLabel, type UserRole } from "@/lib/permissions";
import { fetchAdminJson } from "@/lib/admin-client-fetch";

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

    loadAdmins();
  }, []);

  return (
    <AdminPageShell className="mx-auto max-w-5xl pb-20">
      <AdminPageHeader
        sectionLabel="Sistem"
        title="Yöneticiler"
        description="Bu mağazaya atanmış yönetici hesaplarını ve rollerini read-only olarak görüntüleyin."
        statusSlot={<AdminStatusBadge tone="warning">Owner panel üzerinden yönetilir</AdminStatusBadge>}
      />

      <AdminCallout tone="warning" icon={<AlertCircle className="h-5 w-5" />}>
        <div className="space-y-1">
          <p className="font-semibold">Yönetici hesapları burada oluşturulmaz.</p>
          <p>
            İşletme adminleri, super adminler ve affiliate yetkilendirmeleri sadece
            <strong> Celebix owner paneli</strong> üzerinden atanır ve güncellenir.
          </p>
        </div>
      </AdminCallout>

      <div className="overflow-hidden rounded-[20px] border border-[var(--admin-border)] bg-white shadow-[var(--shadow-sm)] md:rounded-[12px]">
        <div className="border-b border-[var(--admin-border)] bg-[var(--admin-muted-surface)] px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-900">
            <Shield className="h-5 w-5 text-primary" />
            Atanmış Yöneticiler ({admins.length})
          </h2>
        </div>

        {loading ? (
          <AdminLoadingState label="Yöneticiler hazırlanıyor" className="m-5" />
        ) : error ? (
          <AdminCallout tone="danger" className="m-5">{error}</AdminCallout>
        ) : admins.length === 0 ? (
          <AdminEmptyState
            className="m-5"
            icon={<Shield className="h-6 w-6" />}
            title="Atanmış yönetici yok"
            description="Bu mağazaya henüz owner panel üzerinden yönetici atanmamış."
          />
        ) : (
          <div className="divide-y divide-[var(--admin-border)]">
            {admins.map((admin) => (
              <div key={admin.id} className="flex items-start justify-between gap-4 p-5 transition-colors hover:bg-[var(--admin-muted-surface)]">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-lg font-bold text-[var(--admin-accent-hover)]">
                    {admin.full_name?.[0]?.toUpperCase() || admin.email[0].toUpperCase()}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{admin.full_name}</h3>
                      <AdminStatusBadge tone="info" size="sm">{getRoleLabel(admin.role)}</AdminStatusBadge>
                    </div>

                    <p className="text-sm font-medium text-gray-500">{admin.email}</p>

                    {admin.task_definition ? (
                      <div className="mt-2 flex max-w-md items-start gap-1.5 rounded-[14px] border border-[var(--admin-border)] bg-[var(--admin-muted-surface)] p-2 text-xs text-gray-500">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                        {admin.task_definition}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminPageShell>
  );
}
