"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { getOptionalBrowserSupabaseClient } from "@/lib/supabase-browser";

type LoginResponse =
  | {
      error?: string;
      redirectTo?: string;
      requiresRedirect?: boolean;
      session?: {
        access_token?: string;
        refresh_token?: string;
      };
    }
  | null;

function resolveLoginErrorMessage(searchParams: URLSearchParams) {
  if (searchParams.get("blocked_auth_setup") === "1") {
    return "Yönetici girişi şu anda hazır değil. Lütfen daha sonra tekrar deneyin.";
  }

  switch (searchParams.get("error")) {
    case "unauthorized":
      return "Bu panel için yetkiniz bulunmuyor.";
    case "invalid_callback":
    case "login_failed":
      return "Giriş oturumu tamamlanamadı. Lütfen tekrar deneyin.";
    case "provider_disabled":
      return "Giriş servisi şu anda kullanılamıyor.";
    default:
      return null;
  }
}

export default function AdminLoginPage() {
  const router = useRouter();
  const storeName = process.env.NEXT_PUBLIC_STORE_NAME?.trim() || "Celebix";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const redirectIfAuthenticated = async () => {
      const searchParams =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
      const next = sanitizeInternalRedirectPath(searchParams.get("next"), "/admin");

      if (mounted) {
        setNextPath(next);
        setErrorMessage(resolveLoginErrorMessage(searchParams));
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

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (authUnavailable) {
      setErrorMessage(
        authBlocked
          ? "Yönetici girişi şu anda hazır değil. Lütfen daha sonra tekrar deneyin."
          : "Giriş servisi şu anda kullanılamıyor.",
      );
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      if (isLogtoProvider) {
        window.location.assign(`/api/auth/sign-in?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      if (!email.trim() || !password) {
        setErrorMessage("E-posta ve şifre zorunludur.");
        return;
      }

      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          nextPath,
        }),
      });

      const payload = (await response.json().catch(() => null)) as LoginResponse;

      if (!response.ok) {
        setErrorMessage(payload?.error || "Giriş başarısız. Bilgilerinizi kontrol edin.");
        return;
      }

      const session = payload?.session;
      if (!session?.access_token || !session?.refresh_token || !supabase) {
        setErrorMessage("Giriş oturumu oluşturulamadı.");
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      if (sessionError) {
        setErrorMessage("Giriş oturumu oluşturulamadı.");
        return;
      }

      setPassword("");
      router.replace(nextPath);
      router.refresh();
    } catch {
      setErrorMessage("Giriş başarısız. Bilgilerinizi kontrol edin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6"
      style={{ background: "linear-gradient(135deg, #f5efe7 0%, #fbf8f2 52%, #eadfce 100%)" }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-6rem] h-64 w-64 rounded-full bg-[#d6b38c]/20 blur-3xl" />
        <div className="absolute bottom-[-8rem] right-[-4rem] h-72 w-72 rounded-full bg-[#8a6742]/12 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="overflow-hidden rounded-[28px] border border-white/70 bg-white/90 shadow-[0_30px_80px_rgba(71,49,30,0.14)] backdrop-blur">
          <div className="border-b border-[#ede3d6] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,241,234,0.96)_100%)] px-6 py-7 sm:px-8">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#e6d8c7] bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7a5a3a]">
              <span className="h-2 w-2 rounded-full bg-[#c18f5a]" />
              {storeName}
            </div>

            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1f2937] shadow-[0_16px_32px_rgba(31,41,55,0.18)]">
                <ShieldCheck className="h-8 w-8 text-white" strokeWidth={2} />
              </div>

              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#1f2937]">
                  Yönetici Girişi
                </h1>
                <p className="mt-1 text-sm leading-6 text-[#6b5b4d]">
                  Mağaza panelinize güvenli şekilde erişin
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-8 sm:py-7">
            {authUnavailable ? (
              <div className="mb-5 rounded-2xl border border-[#ead8bf] bg-[#fff8ef] px-4 py-3 text-sm text-[#7d5f3f]">
                {authBlocked
                  ? "Yönetici girişi şu anda hazır değil. Lütfen daha sonra tekrar deneyin."
                  : "Giriş servisi şu anda kullanılamıyor."}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="mb-5 rounded-2xl border border-[#e8c7c1] bg-[#fff7f5] px-4 py-3 text-sm text-[#9f4134]" aria-live="polite">
                {errorMessage}
              </div>
            ) : null}

            <form onSubmit={handleLogin} className="space-y-5">
              {isLogtoProvider ? (
                <div className="rounded-2xl border border-[#e6d8c7] bg-[#fcf8f2] px-4 py-4 text-sm leading-6 text-[#6d5844]">
                  Güvenli giriş ekranında e-posta ve şifrenizle oturum açacaksınız.
                </div>
              ) : (
                <div>
                  <label htmlFor="admin-email" className="mb-1.5 block text-sm font-medium text-[#1f2937]">
                    E-posta
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#a68b70]" />
                    <input
                      id="admin-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (errorMessage) {
                          setErrorMessage(null);
                        }
                      }}
                      placeholder="yonetici@magaza.com"
                      required
                      disabled={loading || authUnavailable}
                      className="w-full rounded-2xl border border-[#deceb9] bg-[#fcfaf7] py-3 pl-11 pr-4 text-[15px] text-[#1f2937] outline-none transition focus:border-[#9f7a52] focus:bg-white focus:ring-4 focus:ring-[#c99e6e]/15 disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </div>
                </div>
              )}

              {!isLogtoProvider ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label htmlFor="admin-password" className="block text-sm font-medium text-[#1f2937]">
                      Şifre
                    </label>

                    <span className="text-xs font-medium text-[#a48d76]">
                      Şifremi unuttum
                    </span>
                  </div>

                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#a68b70]" />
                    <input
                      id="admin-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        if (errorMessage) {
                          setErrorMessage(null);
                        }
                      }}
                      placeholder="••••••••"
                      required
                      disabled={loading || authUnavailable}
                      className="w-full rounded-2xl border border-[#deceb9] bg-[#fcfaf7] py-3 pl-11 pr-12 text-[15px] text-[#1f2937] outline-none transition focus:border-[#9f7a52] focus:bg-white focus:ring-4 focus:ring-[#c99e6e]/15 disabled:cursor-not-allowed disabled:opacity-70"
                    />

                    <button
                      type="button"
                      aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                      onClick={() => setShowPassword((current) => !current)}
                      disabled={loading || authUnavailable}
                      className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#8c7359] transition hover:bg-[#f3ece4] hover:text-[#5c4229] disabled:cursor-not-allowed"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading || authUnavailable}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1f2937] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_20px_40px_rgba(31,41,55,0.18)] transition hover:bg-[#17202c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isLogtoProvider ? "Güvenli giriş hazırlanıyor..." : "Bilgileriniz kontrol ediliyor..."}
                  </>
                ) : (
                  isLogtoProvider ? "Yönetici Girişi Yap" : "Giriş Yap"
                )}
              </button>
            </form>

            <div className="mt-6 border-t border-[#ede3d6] pt-5 text-center">
              <p className="text-xs tracking-[0.18em] text-[#8d7762]">
                Güvenli bağlantı ile korunmaktadır
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
