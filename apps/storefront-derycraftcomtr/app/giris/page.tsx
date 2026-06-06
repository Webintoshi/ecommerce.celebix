"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Chrome, Loader2, Mail } from "lucide-react";
import { motion } from "framer-motion";
import { SITE_LOGO_PATH, SITE_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";

function sanitizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/hesap";
  }

  return value;
}

function resolveErrorMessage(errorCode: string | null) {
  switch (errorCode) {
    case "unauthorized":
      return "Bu hesapla bağlı bir müşteri profili bulunamadı. Farklı bir hesapla tekrar deneyin.";
    case "invalid_callback":
      return "Giriş oturumu doğrulanamadı. Lütfen yeniden deneyin.";
    case "login_failed":
      return "Giriş işlemi tamamlanamadı. Lütfen tekrar deneyin.";
    default:
      return "";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const [submitting, setSubmitting] = useState<"email" | "google" | null>(null);
  const showLogoImage =
    typeof SITE_LOGO_PATH === "string" &&
    !SITE_LOGO_PATH.includes("placeholder-storefront-logo");
  const nextPath = useMemo(() => sanitizeNextPath(searchParams.get("next")), [searchParams]);
  const errorMessage = resolveErrorMessage(searchParams.get("error"));

  useEffect(() => {
    if (!loading && user) {
      router.push(nextPath);
    }
  }, [loading, nextPath, router, user]);

  const openLogtoFlow = (mode: "email" | "google") => {
    setSubmitting(mode);

    const url = new URL("/api/auth/sign-in", window.location.origin);
    url.searchParams.set("next", nextPath);

    if (mode === "google") {
      url.searchParams.set("directSignIn", "social:google");
    } else {
      url.searchParams.set("firstScreen", "sign_in");
    }

    window.location.assign(url.toString());
  };

  return (
    <main className="min-h-screen bg-[#F7F3EE] px-5 py-10 text-[#17130F] sm:py-14">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-3xl flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 text-center"
        >
          <Link href="/" className="inline-block">
            {showLogoImage ? (
              <img
                src={SITE_LOGO_PATH}
                alt={SITE_NAME}
                className="mx-auto h-20 w-auto object-contain sm:h-24"
              />
            ) : (
              <span className="font-serif text-4xl font-semibold text-[#17130F]">
                {SITE_NAME}
              </span>
            )}
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[28px] border border-[#DED4C8] bg-white/95 p-6 shadow-[0_30px_80px_-55px_rgba(38,28,19,0.65)] sm:p-10"
        >
          <div className="mb-8">
            <p className="mb-3 text-sm font-semibold uppercase text-[#8A6847]">DeryCraft Hesabı</p>
            <h1 className="text-3xl font-bold text-[#17130F] sm:text-4xl">Giriş Yap</h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-[#6B6259]">
              E-posta veya Google hesabınızı kullanarak hesabınıza erişin.
            </p>
          </div>

          {errorMessage ? (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="space-y-4">
            <button
              type="button"
              onClick={() => openLogtoFlow("email")}
              disabled={Boolean(submitting)}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#11100E] px-5 py-4 text-base font-bold text-white transition-colors hover:bg-[#3B2B1E] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting === "email" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Mail className="h-5 w-5" />
              )}
              E-posta ile Giriş Yap
            </button>

            <button
              type="button"
              onClick={() => openLogtoFlow("google")}
              disabled={Boolean(submitting)}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-[#D7CEC4] bg-white px-5 py-4 text-base font-bold text-[#17130F] transition-colors hover:bg-[#FAF7F3] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting === "google" ? (
                <Loader2 className="h-5 w-5 animate-spin text-[#6B6259]" />
              ) : (
                <Chrome className="h-5 w-5" />
              )}
              Google ile Devam Et
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-[#E7E0D8] bg-[#FBF8F4] px-4 py-4 text-sm leading-6 text-[#6B6259]">
            Şifrenizi unuttuysanız güvenli şifre yenileme ekranına yönlendirileceksiniz.
          </div>

          <div className="mt-6 flex flex-col gap-3 text-sm font-semibold text-[#17130F] sm:flex-row sm:items-center sm:justify-between">
            <Link href="/sifremi-unuttum" className="hover:text-[#8A6847] hover:underline">
              Şifremi Unuttum
            </Link>
            <Link href="/kayit" className="hover:text-[#8A6847] hover:underline">
              Hesap Oluştur
            </Link>
          </div>

          <div className="mt-8 border-t border-[#E7E0D8] pt-6 text-center text-sm leading-6 text-[#6B6259]">
            Misafir olarak devam etmek ister misiniz?{" "}
            <Link href="/odeme" className="font-bold text-[#17130F] hover:text-[#8A6847] hover:underline">
              Ödeme sayfasına git
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-6 text-center"
        >
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#6B6259] hover:text-[#17130F]">
            <ArrowLeft className="h-4 w-4" />
            Ana Sayfaya Dön
          </Link>
        </motion.div>
      </div>
    </main>
  );
}
