"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, ShieldCheck, Mail } from "lucide-react";
import { toast } from "sonner";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { Label } from "@/components/ui/label";

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => getBrowserSupabaseClient(), []);
  const [nextPath, setNextPath] = useState("/admin");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const redirectIfAuthenticated = async () => {
      const next =
        typeof window !== "undefined"
          ? sanitizeInternalRedirectPath(new URLSearchParams(window.location.search).get("next"), "/admin")
          : "/admin";
      if (mounted) {
        setNextPath(next);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (mounted && user) {
        router.replace(next);
      }
    };

    redirectIfAuthenticated();

    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const credentials = new FormData(event.currentTarget);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(credentials.get("email") ?? "").trim(),
          password: String(credentials.get("password") ?? ""),
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(`Giriş başarısız: ${payload.error || "Giriş yapılamadı."}`);
        return;
      }

      const session = payload.session;
      if (!session?.access_token || !session?.refresh_token) {
        toast.error("Giriş oturumu oluşturulamadı.");
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      if (sessionError) {
        toast.error(sessionError.message);
        return;
      }

      toast.success("Giriş yapıldı.");
      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      console.error("Admin login error:", error);
      toast.error("Beklenmeyen bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: "#F8F8F8" }}
    >
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <div className="w-full max-w-md relative">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: "#D4A574" }}
            >
              <ShieldCheck className="w-8 h-8 text-white" strokeWidth={2} />
            </div>
            <h1 className="text-2xl font-semibold text-neutral-900 mb-1">
              Yönetici Girişi
            </h1>
            <p className="text-sm text-gray-500">
              Mağaza paneline erişmek için giriş yapın
            </p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div>
              <Label htmlFor="admin-email" className="mb-1.5 block">
                E-posta
              </Label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-gray-400" />
                <input
                  id="admin-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="yonetici@magaza.com"
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-neutral-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="admin-password" className="mb-1.5 block">
                Şifre
              </Label>
              <div className="relative">
                <Lock aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-gray-400" />
                <input
                  id="admin-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-neutral-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 active:scale-[0.98] shadow-lg shadow-neutral-900/10"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Giriş Yap"
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              Güvenli bağlantı ile korunmaktadır
            </p>
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-xs text-gray-400 tracking-wide uppercase">
            Celebix Admin
          </p>
        </div>
      </div>
    </div>
  );
}
