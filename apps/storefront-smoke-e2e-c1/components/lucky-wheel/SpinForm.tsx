"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SpinFormProps {
  onSubmit: (data: { userName: string; userEmail?: string; userPhone?: string }) => Promise<void>;
  requireEmail?: boolean;
  requirePhone?: boolean;
  isLoading?: boolean;
  className?: string;
}

const turkishPhoneRegex = /^(\+90|0)?[5-9][0-9]{9}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SpinForm({
  onSubmit,
  requireEmail = false,
  requirePhone = false,
  isLoading = false,
  className
}: SpinFormProps) {
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): Record<string, string> => {
    const newErrors: Record<string, string> = {};

    if (!userName.trim() || userName.trim().length < 2) {
      newErrors.userName = "Lütfen geçerli bir isim giriniz";
    }

    if (requireEmail && (!userEmail || !emailRegex.test(userEmail))) {
      newErrors.userEmail = "Lütfen geçerli bir email adresi giriniz";
    }

    if (requirePhone && (!userPhone || !turkishPhoneRegex.test(userPhone.replace(/\s/g, "")))) {
      newErrors.userPhone = "Lütfen geçerli bir telefon numarası giriniz";
    }

    if (!requireEmail && !requirePhone && !userEmail && !userPhone) {
      newErrors.contact = "Email veya telefon numarası gereklidir";
    }

    if (!agreed) {
      newErrors.agreed = "Devam etmek için KVKK koşullarını kabul etmelisiniz";
    }

    setErrors(newErrors);
    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formErrors = validate();
    if (Object.keys(formErrors).length > 0) {
      const firstError = Object.values(formErrors)[0];
      if (firstError) toast.error(firstError);
      return;
    }

    try {
      await onSubmit({
        userName: userName.trim(),
        userEmail: userEmail.trim() || undefined,
        userPhone: userPhone.replace(/\s/g, "") || undefined
      });
    } catch (error) {
      console.error("Spin form submit error:", error);
    }
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
  };

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          İsminiz <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Adınız"
          className={cn(
            "w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all",
            errors.userName ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"
          )}
          disabled={isLoading}
        />
        {errors.userName && (
          <p className="text-xs text-red-500 mt-1">{errors.userName}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email {requireEmail && <span className="text-red-500">*</span>}
          </label>
          <input
            type="email"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            placeholder="email@ornek.com"
            className={cn(
              "w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all",
              errors.userEmail ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"
            )}
            disabled={isLoading}
          />
          {errors.userEmail && (
            <p className="text-xs text-red-500 mt-1">{errors.userEmail}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Telefon {requirePhone && <span className="text-red-500">*</span>}
          </label>
          <input
            type="tel"
            value={userPhone}
            onChange={(e) => setUserPhone(formatPhone(e.target.value))}
            placeholder="5XX XXX XXXX"
            className={cn(
              "w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all",
              errors.userPhone ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"
            )}
            disabled={isLoading}
            maxLength={14}
          />
          {errors.userPhone && (
            <p className="text-xs text-red-500 mt-1">{errors.userPhone}</p>
          )}
        </div>
      </div>

      {errors.contact && (
        <p className="text-xs text-red-500">{errors.contact}</p>
      )}

      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="agreed"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500"
          disabled={isLoading}
        />
        <label htmlFor="agreed" className="text-sm text-gray-600">
          Kişisel verilerimin işlenmesini ve tarafıma kampanya iletileri gönderilmesini kabul ediyorum.{" "}
          <a href="/gizlilik" className="text-orange-500 hover:underline">KVKK Aydınlatma Metni</a>
        </label>
      </div>
      {errors.agreed && (
        <p className="text-xs text-red-500">{errors.agreed}</p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl hover:from-orange-600 hover:to-red-600 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-orange-500/30"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Hazırlanıyor...
          </span>
        ) : (
          "Şans Çarkını Çevir!"
        )}
      </button>
    </form>
  );
}
