"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Chrome, Shield, UserRound } from "lucide-react";
import { motion } from "framer-motion";
import { CustomerAuthMigrationNotice } from "@/components/auth/CustomerAuthMigrationNotice";
import { SITE_LOGO_PATH, SITE_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { getOptionalBrowserSupabaseClient } from "@/lib/supabase-browser";
import { isStorefrontCustomerAuthMigrationRequired } from "@/lib/supabase-disconnect-readiness";

function sanitizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/hesap";
  }

  return value;
}

function resolveErrorMessage(errorCode: string | null) {
  switch (errorCode) {
    case "unauthorized":
      return "Bu hesapla bagli bir musteri profili bulunamadi. Farkli bir hesapla tekrar deneyin.";
    case "invalid_callback":
      return "Giris oturumu dogrulanamadi. Lutfen yeniden deneyin.";
    case "login_failed":
      return "Giris islemi tamamlanamadi. Lutfen tekrar deneyin.";
    default:
      return "";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const authMigrationRequired = isStorefrontCustomerAuthMigrationRequired();
  const [submitting, setSubmitting] = useState<"email" | "google" | null>(null);
  const showLogoImage =
    typeof SITE_LOGO_PATH === "string" &&
    !SITE_LOGO_PATH.includes("placeholder-storefront-logo");
  const nextPath = useMemo(() => sanitizeNextPath(searchParams.get("next")), [searchParams]);
  const errorMessage = resolveErrorMessage(searchParams.get("error"));
  const loggedOut = searchParams.get("logged_out") === "1";
  const [logoutCleanupDone, setLogoutCleanupDone] = useState(!loggedOut);

  useEffect(() => {
    if (!loggedOut) {
      setLogoutCleanupDone(true);
      return;
    }

    let active = true;

    const cleanup = async () => {
      try {
        await getOptionalBrowserSupabaseClient()?.auth.signOut();
      } catch (error) {
        console.warn("Storefront logout cleanup failed:", error);
      } finally {
        if (active) {
          setLogoutCleanupDone(true);
        }
      }
    };

    void cleanup();

    return () => {
      active = false;
    };
  }, [loggedOut]);

  useEffect(() => {
    if (!logoutCleanupDone) {
      return;
    }

    if (!authMigrationRequired && !loading && user) {
      router.push(nextPath);
    }
  }, [authMigrationRequired, loading, logoutCleanupDone, nextPath, router, user]);

  if (authMigrationRequired) {
    return (
      <CustomerAuthMigrationNotice
        title="Musteri girisi gecici olarak pasif"
        description="DeryCraft 2 light_postgres provasinda musteri auth yuzeyi Supabase'e geri donmesin diye giris akisi kontrollu olarak kapatildi. Siparis akisi misafir odeme ile devam eder."
      />
    );
  }

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
    <div className="min-h-screen bg-gradient-to-br from-[#FFF5F5] to-[#FFE5E5] px-4 py-12">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <Link href="/" className="inline-block">
            {showLogoImage ? (
              <img src={SITE_LOGO_PATH} alt={SITE_NAME} className="mx-auto h-16 w-auto" />
            ) : (
              <span className="font-serif text-3xl font-semibold tracking-tight text-gray-900">
                {SITE_NAME}
              </span>
            )}
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-3xl bg-white p-8 shadow-xl"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Giris Yap</h1>
              <p className="text-sm text-gray-500">
                E-posta veya Google hesabinizi kullanarak hesabiniza erisin.
              </p>
            </div>
          </div>

          {errorMessage ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => openLogtoFlow("email")}
              disabled={Boolean(submitting)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 font-semibold text-white transition-colors hover:bg-[#7B1113] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting === "email" ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <UserRound className="h-5 w-5" />
              )}
              E-posta ile Giris Yap
            </button>

            <button
              type="button"
              onClick={() => openLogtoFlow("google")}
              disabled={Boolean(submitting)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-3.5 font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting === "google" ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
              ) : (
                <Chrome className="h-5 w-5" />
              )}
              Google ile Devam Et
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-sm text-gray-600">
            Sifrenizi unuttuysaniz guvenli sifre yenileme ekranina yonlendirileceksiniz.
          </div>

          <div className="mt-6 flex items-center justify-between text-sm">
            <Link href="/sifremi-unuttum" className="font-medium text-primary hover:underline">
              Sifremi Unuttum
            </Link>
            <Link href="/kayit" className="font-medium text-primary hover:underline">
              Hesap Olustur
            </Link>
          </div>

          <div className="mt-8 border-t border-gray-100 pt-6 text-center text-sm text-gray-600">
            Misafir olarak devam etmek ister misiniz?{" "}
            <Link href="/odeme" className="font-semibold text-primary hover:underline">
              Odeme sayfasina git
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-6 text-center"
        >
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary">
            <ArrowRight className="h-4 w-4 rotate-180" />
            Ana Sayfaya Don
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
