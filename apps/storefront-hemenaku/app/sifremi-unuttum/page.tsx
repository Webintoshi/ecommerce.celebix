"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { resolveCustomerAuthMode, isGeneratedAuthMode } from "@/lib/customer-auth-mode";
import { AuthLandingCard } from "@/components/auth/AuthLandingCard";
import { SITE_LOGO_PATH, SITE_NAME } from "@/lib/constants";
import { Mail, ArrowRight, CheckCircle, Shield } from "lucide-react";
import { motion } from "framer-motion";

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const customerAuthMode = resolveCustomerAuthMode();
  const useGeneratedAuth = isGeneratedAuthMode(customerAuthMode);
  
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const showLogoImage =
    typeof SITE_LOGO_PATH === "string" &&
    !SITE_LOGO_PATH.includes("placeholder-storefront-logo");

  const handleGeneratedReset = async () => {
    setLoading(true);
    setError("");
    const { error: resetError } = await resetPassword("");
    if (resetError) {
      setError(resetError.message);
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: resetError } = await resetPassword(email);

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  if (useGeneratedAuth) {
    return (
      <AuthLandingCard
        eyebrow="Hesap erisimi"
        title="Sifrenizi guvenli ekranda yenileyin"
        description={
          customerAuthMode === "logto"
            ? "Sifre yenileme islemi guvenli Hemenaku hesap ekraninda tamamlanir."
            : "Hesap modulu su anda hazir degil. Magazayi misafir olarak kullanmaya devam edebilirsiniz."
        }
        primaryLabel={loading ? "Yonlendiriliyor..." : "Sifre Yenile"}
        secondaryLabel="Giris Sayfasina Don"
        secondaryHref="/giris"
        onPrimaryAction={customerAuthMode === "logto" ? handleGeneratedReset : undefined}
        primaryDisabled={customerAuthMode !== "logto" || loading}
        helperText={
          error ||
          (customerAuthMode === "logto"
            ? "Devam ettiginizde guvenli hesap kurtarma ekranina yonlendirilirsiniz."
            : "Alisverisi misafir olarak tamamlayabilir, destek icin iletisim sayfasini kullanabilirsiniz.")
        }
      />
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FA] p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-lg border border-[#D7DEE8] bg-white p-8 text-center shadow-xl shadow-slate-950/5"
        >
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            E-posta Gonderildi
          </h2>
          <p className="text-gray-600 mb-2">
            Sifre sifirlama linki e-posta adresinize gonderildi.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Lutfen gelen kutunuzu kontrol edin ve linke tiklayarak sifrenizi sifirlayin.
          </p>
          <Link
            href="/giris"
            className="inline-block rounded-lg bg-[#0F172A] px-8 py-3 font-bold text-white transition-colors hover:bg-[#1E293B]"
          >
            Giris Sayfasina Git
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F7FA] p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <Link href="/" className="inline-block">
            {showLogoImage ? (
              <img src={SITE_LOGO_PATH} alt={SITE_NAME} className="h-16 w-auto mx-auto" />
            ) : (
              <span className="text-3xl font-semibold tracking-tight text-[#0B1220]">
                {SITE_NAME}
              </span>
            )}
          </Link>
        </motion.div>

        {/* Forgot Password Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-lg border border-[#D7DEE8] bg-white p-8 shadow-xl shadow-slate-950/5"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#ECFDF5]">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">
              Sifremi Unuttum
            </h2>
          </div>
          <p className="text-gray-500 mb-6">
            E-posta adresinizi girin, sifre sifirlama linki gonderelim.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                E-posta Adresi
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="ornek@email.com"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F172A] py-3 font-bold text-white transition-colors hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Gonderiliyor...
                </>
              ) : (
                <>
                  Sifirlama Linki Gonder
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Back to Login */}
          <div className="mt-6 text-center text-gray-600">
            <Link href="/giris" className="text-primary font-bold hover:underline">
              Giris Sayfasina Don
            </Link>
          </div>
        </motion.div>

        {/* Back to Home */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-6 text-center"
        >
          <Link 
            href="/" 
            className="text-sm text-gray-500 hover:text-primary transition-colors"
          >
            Ana Sayfaya Don
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
