"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Info, Loader2, Shield } from "lucide-react";
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
        const res = await fetch("/api/admin/users", { cache: "no-store" });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Yoneticiler yuklenemedi.");
        }

        setAdmins(data.admins);
      } catch (loadError) {
        console.error("Load admins error:", loadError);
        setError(loadError instanceof Error ? loadError.message : "Yoneticiler yuklenemedi.");
      } finally {
        setLoading(false);
      }
    };

    loadAdmins();
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Yoneticiler</h1>
        <p className="text-gray-500">
          Bu magazaya atanmis yonetici hesaplarini gorebilirsiniz.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-2">
            <p className="font-semibold">Yonetici hesaplari burada olusturulmaz.</p>
            <p>
              Isletme adminleri, super adminler ve affiliate yetkilendirmeleri sadece
              <strong> Celebix owner paneli</strong> uzerinden atanir ve guncellenir.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50/70 px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-900">
            <Shield className="h-5 w-5 text-primary" />
            Atanmis Yoneticiler ({admins.length})
          </h2>
        </div>

        {loading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : admins.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            Bu magazaya henuz owner panel uzerinden yonetici atanmamis.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {admins.map((admin) => (
              <div key={admin.id} className="flex items-start justify-between gap-4 p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                    {admin.full_name?.[0]?.toUpperCase() || admin.email[0].toUpperCase()}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{admin.full_name}</h3>
                      <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-700">
                        {getRoleLabel(admin.role)}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-gray-500">{admin.email}</p>

                    {admin.task_definition ? (
                      <div className="mt-2 flex max-w-md items-start gap-1.5 rounded-lg bg-gray-50 p-2 text-xs text-gray-500">
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
    </div>
  );
}
