"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, ShieldCheck, Mail } from "lucide-react";
import { toast } from "sonner";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { getOptionalBrowserSupabaseClient } from "@/lib/supabase-browser";

export default function AdminLoginPage() {
  const router = useRouter();
  const authProvider = process.env.NEXT_PUBLIC_ADMIN_AUTH_PROVIDER === "logto" ? "logto" : "supabase";
  const isLogtoProvider = authProvider === "logto";
  const hasBrowserSupabaseAuthEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const authBlocked =
    process.env.NEXT_PUBLIC_RUNTIME_DATABASE_MODE === "light_postgres" &&
    process.env.NEXT_PUBLIC_AUTH_SETUP_STATUS === "blocked_auth_setup";
  const authUnavailable = authBlocked || (!isLogtoProvider && !hasBrowserSupabaseAuthEnv);
  const supabase = useMemo(
    () => (authUnavailable || isLogtoProvider ? null : getOptionalBrowserSupabaseClient()),
    [authUnavailable, isLogtoProvider],
  );
  const [nextPath, setNextPath] = useState("/admin");
  const logtoSignInHref = `/api/auth/sign-in?next=${encodeURIComponent(nextPath)}`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const redirectIfAuthenticated = async () => {
      const params =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const next =
        typeof window !== "undefined"
          ? sanitizeInternalRedirectPath(params?.get("next"), "/admin")
          : "/admin";
      const loggedOut = params?.get("logged_out") === "1";
      if (mounted) {
        setNextPath(next);
      }

      if (loggedOut) {
        try {
          await getOptionalBrowserSupabaseClient()?.auth.signOut();
        } catch (error) {
          console.warn("Admin logout cleanup failed:", error);
        }
      }

      const response = await fetch("/api/admin/me", {
        credentials: "same-origin",
        cache: "no-store",
      }).catch(() => null);

      if (mounted && response?.ok) {
        router.replace(next);
      }
    };

    redirectIfAuthenticated();

    return () => {
      mounted = false;
    };
  }, [router]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLogtoProvider) {
      if (typeof window !== "undefined") {
        window.location.assign(`/api/auth/sign-in?next=${encodeURIComponent(nextPath)}`);
      }
      return;
    }

    if (authBlocked || !hasBrowserSupabaseAuthEnv || !supabase) {
      toast.error("Bu store icin admin auth kurulumu henuz tamamlanmadi.");
      return;
    }
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
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

          <form onSubmit={handleLogin} className="space-y-5">
            {authUnavailable ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                {authBlocked
                  ? "Admin uygulamasi olustu ancak bu yeni light_postgres store icin giris kimligi henuz tamamlanmadi."
                  : "Bu ortamda admin auth degiskenleri henuz tanimli olmadigi icin giris gecici olarak pasif."}{" "}
                Owner provisioning bu adimi acikca
                <code className="mx-1 rounded bg-amber-100 px-1.5 py-0.5 text-[12px]">blocked_auth_setup</code>
                olarak isaretler.
              </div>
            ) : null}

            {isLogtoProvider ? (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-700">
                Bu panel Celebix merkezi kimlik altyapısı ile giriş yapıyor. Devam ettiğinizde güvenli Logto oturumu başlatılacak.
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-neutral-900 mb-1.5">
                    E-posta
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="yonetici@magaza.com"
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-neutral-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-900 mb-1.5">
                    Şifre
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-neutral-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all"
                      required
                      minLength={8}
                    />
                  </div>
                </div>
              </>
            )}

            {isLogtoProvider ? (
              <a
                href={logtoSignInHref}
                className="w-full py-3.5 rounded-xl font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 active:scale-[0.98] shadow-lg shadow-neutral-900/10"
              >
                Celebix Auth ile Devam Et
              </a>
            ) : (
              <button
                type="submit"
                disabled={loading || authUnavailable}
                className="w-full py-3.5 rounded-xl font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 active:scale-[0.98] shadow-lg shadow-neutral-900/10"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Giriş Yap"
                )}
              </button>
            )}
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
