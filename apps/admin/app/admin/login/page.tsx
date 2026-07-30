"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import {
  buildAdminSignInPath,
  getAdminLoginErrorPresentation,
  parseAdminLoginErrorCode,
  type AdminLoginErrorCode,
} from "@/lib/admin-login-contract";
import { getOptionalBrowserSupabaseClient } from "@/lib/supabase-browser";

type PublicRuntimeBranding = {
  name?: string;
  logoUrl?: string | null;
};

export default function AdminLoginPage() {
  const router = useRouter();
  const authProvider =
    process.env.NEXT_PUBLIC_ADMIN_AUTH_PROVIDER === "logto" ? "logto" : "supabase";
  const isLogtoProvider = authProvider === "logto";
  const hasBrowserSupabaseAuthEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const authBlocked =
    process.env.NEXT_PUBLIC_RUNTIME_DATABASE_MODE === "light_postgres" &&
    process.env.NEXT_PUBLIC_AUTH_SETUP_STATUS === "blocked_auth_setup";
  const authUnavailable =
    authBlocked || (!isLogtoProvider && !hasBrowserSupabaseAuthEnv);
  const supabase = useMemo(
    () =>
      authUnavailable || isLogtoProvider
        ? null
        : getOptionalBrowserSupabaseClient(),
    [authUnavailable, isLogtoProvider],
  );
  const [nextPath, setNextPath] = useState("/admin");
  const [storeName, setStoreName] = useState(
    process.env.NEXT_PUBLIC_STORE_NAME || "Mağaza",
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loginErrorCode, setLoginErrorCode] =
    useState<AdminLoginErrorCode | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const logtoSignInHref = buildAdminSignInPath(nextPath);
  const logtoSwitchAccountHref = buildAdminSignInPath(nextPath, {
    forceAccountSelection: true,
  });
  const errorPresentation = loginErrorCode
    ? getAdminLoginErrorPresentation(loginErrorCode)
    : null;
  const storeInitial = storeName.trim().charAt(0).toLocaleUpperCase("tr") || "M";

  useEffect(() => {
    let mounted = true;

    const initializeLogin = async () => {
      const params = new URLSearchParams(window.location.search);
      const next = sanitizeInternalRedirectPath(params.get("next"), "/admin");
      const loggedOut = params.get("logged_out") === "1";

      if (mounted) {
        setNextPath(next);
        setLoginErrorCode(parseAdminLoginErrorCode(params.get("error")));
      }

      if (loggedOut) {
        try {
          await getOptionalBrowserSupabaseClient()?.auth.signOut();
        } catch {
          // The server-side logout has already cleared the authoritative admin session.
        }
      }

      const [runtimeResponse, sessionResponse] = await Promise.all([
        fetch("/api/public/runtime", {
          credentials: "same-origin",
          cache: "no-store",
        }).catch(() => null),
        fetch("/api/admin/me", {
          credentials: "same-origin",
          cache: "no-store",
        }).catch(() => null),
      ]);

      const runtimePayload = runtimeResponse
        ? ((await runtimeResponse.json().catch(() => null)) as PublicRuntimeBranding | null)
        : null;

      if (mounted && runtimePayload) {
        if (runtimePayload.name?.trim()) {
          setStoreName(runtimePayload.name.trim());
        }
        setLogoUrl(runtimePayload.logoUrl?.trim() || null);
      }

      if (mounted && sessionResponse?.ok) {
        router.replace(next);
      }
    };

    void initializeLogin();

    return () => {
      mounted = false;
    };
  }, [router]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    if (isLogtoProvider) {
      window.location.assign(logtoSignInHref);
      return;
    }

    if (authBlocked || !hasBrowserSupabaseAuthEnv || !supabase) {
      toast.error("Bu mağaza için yönetici girişi henüz kullanıma hazır değil.");
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

      router.replace(nextPath);
      router.refresh();
    } catch {
      toast.error("Beklenmeyen bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F6F7F9] text-[#202124]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1440px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(480px,0.78fr)]">
        <section className="relative flex min-h-[320px] flex-col justify-between overflow-hidden px-6 py-8 sm:px-10 sm:py-10 lg:min-h-screen lg:px-16 lg:py-14 xl:px-24">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full border-[56px] border-[#FE6100]/[0.07]"
          />
          <div className="relative flex items-center gap-3">
            {logoUrl ? (
              <div className="flex min-h-16 min-w-16 max-w-[220px] items-center rounded-2xl bg-white px-4 py-3 shadow-[0_12px_30px_rgba(31,41,55,0.07)] ring-1 ring-[#E2E7EE]">
                <img
                  src={logoUrl}
                  alt={`${storeName} logosu`}
                  className="max-h-10 w-auto max-w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#202124] text-2xl font-semibold text-white shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
                {storeInitial}
              </div>
            )}
          </div>

          <div className="relative max-w-xl py-10 lg:py-0">
            <h1 className="text-[clamp(2.25rem,5vw,4.75rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-[#202124]">
              {storeName}
              <span className="mt-2 block text-[#757B85]">Yönetim Paneli</span>
            </h1>
            <p className="mt-7 max-w-md text-base leading-7 text-[#626975] sm:text-lg sm:leading-8">
              Mağazanızı, siparişlerinizi ve ürünlerinizi güvenli yönetim alanından kontrol edin.
            </p>
          </div>

          <div className="relative flex items-center gap-3 text-sm font-medium text-[#626975]">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFF0E7] text-[#D95200]">
              <ShieldCheck className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            Güvenli, mağazaya özel erişim
          </div>
        </section>

        <section className="flex items-center border-t border-[#E2E7EE] bg-white px-6 py-12 sm:px-10 lg:min-h-screen lg:border-l lg:border-t-0 lg:px-14 xl:px-20">
          <div className="mx-auto w-full max-w-[480px]">
            <div className="mb-9">
              <h2 className="text-3xl font-semibold tracking-[-0.035em] text-[#202124] sm:text-[2.15rem]">
                Yönetici girişi
              </h2>
              <p className="mt-3 text-[15px] leading-6 text-[#6B7280]">
                Devam etmek için yönetici hesabınızla giriş yapın.
              </p>
            </div>

            {errorPresentation ? (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-6 rounded-2xl border border-[#FED7C2] bg-[#FFF7F2] px-4 py-4 text-[#7A3210]"
              >
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#D95200]" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold">{errorPresentation.title}</p>
                    <p className="mt-1 text-sm leading-6 text-[#8A4A2A]">
                      {errorPresentation.message}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {authUnavailable ? (
              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
                Bu mağaza için yönetici girişi henüz kullanıma hazır değil.
              </div>
            ) : null}

            <form onSubmit={handleLogin} className="space-y-5">
              {!isLogtoProvider ? (
                <>
                  <div>
                    <label htmlFor="admin-email" className="mb-2 block text-sm font-semibold text-[#34383F]">
                      E-posta
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B919B]" aria-hidden="true" />
                      <input
                        id="admin-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="email"
                        placeholder="yonetici@magaza.com"
                        className="min-h-14 w-full rounded-2xl border border-[#DCE1E8] bg-white pl-12 pr-4 text-[15px] text-[#202124] outline-none transition placeholder:text-[#A3A8B0] focus:border-[#FE6100] focus:ring-4 focus:ring-[#FE6100]/15"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="admin-password" className="mb-2 block text-sm font-semibold text-[#34383F]">
                      Şifre
                    </label>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B919B]" aria-hidden="true" />
                      <input
                        id="admin-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className="min-h-14 w-full rounded-2xl border border-[#DCE1E8] bg-white pl-12 pr-4 text-[15px] text-[#202124] outline-none transition placeholder:text-[#A3A8B0] focus:border-[#FE6100] focus:ring-4 focus:ring-[#FE6100]/15"
                        required
                        minLength={8}
                      />
                    </div>
                  </div>
                </>
              ) : null}

              {isLogtoProvider ? (
                authUnavailable ? (
                  <button
                    type="button"
                    disabled
                    className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#C9CDD3] px-5 text-[15px] font-semibold text-white"
                  >
                    Güvenli giriş yap
                  </button>
                ) : (
                  <a
                    href={logtoSignInHref}
                    className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#FE6100] px-5 text-[15px] font-semibold text-white shadow-[0_12px_24px_rgba(254,97,0,0.20)] transition hover:bg-[#D95200] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/25 active:translate-y-px"
                  >
                    Güvenli giriş yap
                    <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
                  </a>
                )
              ) : (
                <button
                  type="submit"
                  disabled={loading || authUnavailable}
                  className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#FE6100] px-5 text-[15px] font-semibold text-white shadow-[0_12px_24px_rgba(254,97,0,0.20)] transition hover:bg-[#D95200] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-label="Giriş yapılıyor" />
                  ) : (
                    <>
                      Giriş yap
                      <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
                    </>
                  )}
                </button>
              )}
            </form>

            {isLogtoProvider && !authUnavailable ? (
              <a
                href={logtoSwitchAccountHref}
                className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-[#555C66] transition hover:bg-[#F6F7F9] hover:text-[#202124] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
              >
                Başka hesapla giriş yap
              </a>
            ) : null}

            <div className="mt-9 flex items-center justify-center gap-2 border-t border-[#ECEFF3] pt-6 text-xs font-medium text-[#8B919B]">
              <ShieldCheck className="h-4 w-4 text-[#FE6100]" aria-hidden="true" />
              Celebix altyapısıyla korunuyor
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
