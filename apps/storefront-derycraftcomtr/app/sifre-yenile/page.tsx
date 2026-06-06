"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, KeyRound, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { SITE_LOGO_PATH, SITE_NAME } from "@/lib/constants";
import { CUSTOMER_AUTH_URLS } from "@/lib/customer-auth-links";

export default function ResetPasswordPage() {
  const [submitting, setSubmitting] = useState(false);
  const showLogoImage =
    typeof SITE_LOGO_PATH === "string" &&
    !SITE_LOGO_PATH.includes("placeholder-storefront-logo");

  const openResetFlow = () => {
    setSubmitting(true);
    const url = new URL("/api/auth/sign-in", window.location.origin);
    url.searchParams.set("firstScreen", "reset_password");
    url.searchParams.set("identifier", "email");
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
              <h1 className="text-2xl font-bold text-gray-900">Yeni Şifre Belirle</h1>
              <p className="text-sm text-gray-500">
                Şifre değişikliği güvenli kimlik ekranında tamamlanır.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openResetFlow}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 font-semibold text-white transition-colors hover:bg-[#7B1113] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <KeyRound className="h-5 w-5" />
            )}
            Güvenli Şifre Ekranını Aç
          </button>

          <div className="mt-6 text-center text-sm text-gray-600">
            <Link href={CUSTOMER_AUTH_URLS.signIn} className="font-semibold text-primary hover:underline">
              Giriş sayfasına dön
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
            Ana Sayfaya Dön
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
