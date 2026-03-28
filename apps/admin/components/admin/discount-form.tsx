"use client";

import { useMemo, useState } from "react";
import {
  Tag,
  Settings2,
  Shield,
  StickyNote,
  Percent,
  TurkishLira,
  Calendar,
  ShoppingCart,
  Eye,
  Lock,
  Users,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  AdminDiscount,
  AdminDiscountPayload,
  DISCOUNT_LIMIT_TYPE_OPTIONS,
  DISCOUNT_SCOPE_OPTIONS,
  DISCOUNT_TYPE_OPTIONS,
  DISCOUNT_VISIBILITY_OPTIONS,
  DiscountLimitType,
  DiscountScope,
  DiscountType,
  DiscountVisibility,
} from "@/types/discount";

type Props = {
  initial?: AdminDiscount | null;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (payload: AdminDiscountPayload) => Promise<void>;
};

type FormState = {
  name: string;
  description: string;
  code: string;
  type: DiscountType;
  value: number;
  minOrder: number;
  maxUses: number | null;
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
  scope: DiscountScope;
  visibility: DiscountVisibility;
  password: string;
  limitType: DiscountLimitType;
  tags: string;
  notes: string;
};

function formatDateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function buildInitialState(initial?: AdminDiscount | null): FormState {
  if (!initial) {
    const now = new Date();
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      name: "",
      description: "",
      code: "",
      type: "percentage",
      value: 10,
      minOrder: 0,
      maxUses: null,
      startsAt: now.toISOString().slice(0, 10),
      expiresAt: future.toISOString().slice(0, 10),
      isActive: true,
      scope: "all",
      visibility: "public",
      password: "",
      limitType: "unlimited",
      tags: "",
      notes: "",
    };
  }

  return {
    name: initial.name,
    description: initial.description || "",
    code: initial.code,
    type: initial.type,
    value: initial.value,
    minOrder: initial.minOrder || 0,
    maxUses: initial.maxUses,
    startsAt: formatDateInput(initial.startsAt),
    expiresAt: formatDateInput(initial.expiresAt),
    isActive: initial.isActive,
    scope: initial.scope,
    visibility: initial.visibility,
    password: initial.password || "",
    limitType: initial.limitType,
    tags: (initial.tags || []).join(", "),
    notes: initial.notes || "",
  };
}

export function DiscountForm({ initial = null, submitting = false, submitLabel, onSubmit }: Props) {
  const [form, setForm] = useState<FormState>(() => buildInitialState(initial));
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(1);

  const payload = useMemo<AdminDiscountPayload>(() => {
    const normalizedMaxUses = form.limitType === "unlimited" ? null : form.maxUses;

    return {
      code: form.code.toUpperCase().trim(),
      type: form.type,
      value: Number(form.value) || 0,
      minOrder: Number(form.minOrder) || 0,
      maxUses: normalizedMaxUses && normalizedMaxUses > 0 ? normalizedMaxUses : null,
      startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00.000Z`).toISOString() : null,
      expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59.999Z`).toISOString() : null,
      isActive: form.isActive,
      metadata: {
        name: form.name.trim(),
        description: form.description.trim(),
        scope: form.scope,
        visibility: form.visibility,
        password: form.visibility === "password" ? form.password.trim() : "",
        limitType: form.limitType,
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        notes: form.notes.trim(),
      },
    };
  }, [form]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!payload.metadata.name) {
      setError("İndirim adı zorunlu.");
      setActiveStep(1);
      return;
    }

    if (!payload.code) {
      setError("İndirim kodu zorunlu.");
      setActiveStep(1);
      return;
    }

    if (payload.value <= 0) {
      setError("İndirim değeri 0'dan büyük olmalı.");
      setActiveStep(2);
      return;
    }

    if (payload.type === "percentage" && payload.value > 100) {
      setError("Yüzde indirimi 100'den büyük olamaz.");
      setActiveStep(2);
      return;
    }

    if (payload.startsAt && payload.expiresAt && new Date(payload.startsAt) >= new Date(payload.expiresAt)) {
      setError("Bitiş tarihi başlangıç tarihinden sonra olmalı.");
      setActiveStep(2);
      return;
    }

    if (payload.metadata.visibility === "password" && !payload.metadata.password) {
      setError("Parola korumalı indirim için parola girin.");
      setActiveStep(3);
      return;
    }

    if (payload.metadata.limitType !== "unlimited" && (!payload.maxUses || payload.maxUses <= 0)) {
      setError("Kullanım limiti zorunlu.");
      setActiveStep(3);
      return;
    }

    await onSubmit(payload);
  };

  const inputClass = "w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition-all text-sm";
  const selectClass = "w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition-all text-sm appearance-none cursor-pointer";
  const textAreaClass = "w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition-all text-sm resize-none";

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3, 4].map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => setActiveStep(step)}
            className={`flex-1 h-2 rounded-full transition-all ${
              activeStep === step ? "bg-primary" : activeStep > step ? "bg-primary/40" : "bg-gray-200"
            }`}
          />
        ))}
      </div>

      {/* Step 1: Basic Info */}
      <section className={`bg-white border rounded-2xl p-6 transition-all ${activeStep === 1 ? "border-primary/30 shadow-lg shadow-primary/5" : "border-gray-200"}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Tag className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">Temel Bilgiler</h2>
            <p className="text-sm text-gray-500">İndirim adı, kodu ve açıklaması</p>
          </div>
          {activeStep > 1 && <Check className="w-5 h-5 text-green-500 ml-auto" />}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="İndirim Adı" required>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="örn: Yılbaşı Kampanyası"
              className={inputClass}
            />
          </Field>
          <Field label="Kupon Kodu" required>
            <div className="relative">
              <input
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                placeholder="örn: YENIYIL2024"
                className={`${inputClass} font-mono uppercase`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">BÜYÜK HARF</span>
            </div>
          </Field>
        </div>

        <Field label="Açıklama" className="mt-5">
          <textarea
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Müşterilere gösterilecek açıklama..."
            rows={3}
            className={textAreaClass}
          />
        </Field>

        <div className="flex justify-end mt-6">
          <button
            type="button"
            onClick={() => setActiveStep(2)}
            className="px-6 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors"
          >
            Devam Et
          </button>
        </div>
      </section>

      {/* Step 2: Discount Settings */}
      <section className={`bg-white border rounded-2xl p-6 transition-all ${activeStep === 2 ? "border-primary/30 shadow-lg shadow-primary/5" : "border-gray-200"}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
            <Settings2 className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">İndirim Ayarları</h2>
            <p className="text-sm text-gray-500">Oran, tutar ve geçerlilik tarihleri</p>
          </div>
          {activeStep > 2 && <Check className="w-5 h-5 text-green-500 ml-auto" />}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="İndirim Tipi">
            <div className="relative">
              <select
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value as DiscountType })}
                className={selectClass}
              >
                {DISCOUNT_TYPE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </Field>
          <Field label={form.type === "percentage" ? "İndirim Oranı (%)" : "İndirim Tutarı (₺)"}>
            <div className="relative">
              <input
                type="number"
                value={form.value}
                onChange={(event) => setForm({ ...form, value: Number(event.target.value) || 0 })}
                placeholder={form.type === "percentage" ? "20" : "100"}
                className={`${inputClass} ${form.type === "percentage" ? "pr-10" : "pl-10"}`}
              />
              {form.type === "percentage" ? (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">%</span>
              ) : (
                <TurkishLira className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              )}
            </div>
          </Field>
          <Field label="Minimum Sipariş Tutarı">
            <div className="relative">
              <TurkishLira className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                value={form.minOrder}
                onChange={(event) => setForm({ ...form, minOrder: Number(event.target.value) || 0 })}
                placeholder="0"
                className={`${inputClass} pl-10`}
              />
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
          <Field label="Başlangıç Tarihi">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={form.startsAt}
                onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
                className={`${inputClass} pl-10`}
              />
            </div>
          </Field>
          <Field label="Bitiş Tarihi">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={form.expiresAt}
                onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
                className={`${inputClass} pl-10`}
              />
            </div>
          </Field>
        </div>

        {/* Toggle Switch */}
        <div className="mt-6 flex items-center justify-between p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${form.isActive ? "bg-green-100" : "bg-gray-200"}`}>
              <Check className={`w-5 h-5 ${form.isActive ? "text-green-600" : "text-gray-400"}`} />
            </div>
            <div>
              <p className="font-medium text-gray-900">İndirimi Aktif Başlat</p>
              <p className="text-sm text-gray-500">Oluşturulduğunda hemen yayına alınır</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setForm({ ...form, isActive: !form.isActive })}
            className={`relative w-14 h-8 rounded-full transition-colors ${form.isActive ? "bg-primary" : "bg-gray-300"}`}
          >
            <span
              className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                form.isActive ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="flex justify-between mt-6">
          <button
            type="button"
            onClick={() => setActiveStep(1)}
            className="px-6 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            Geri
          </button>
          <button
            type="button"
            onClick={() => setActiveStep(3)}
            className="px-6 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors"
          >
            Devam Et
          </button>
        </div>
      </section>

      {/* Step 3: Campaign Rules */}
      <section className={`bg-white border rounded-2xl p-6 transition-all ${activeStep === 3 ? "border-primary/30 shadow-lg shadow-primary/5" : "border-gray-200"}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
            <Shield className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">Kampanya Kuralları</h2>
            <p className="text-sm text-gray-500">Kapsam, görünürlük ve kullanım limitleri</p>
          </div>
          {activeStep > 3 && <Check className="w-5 h-5 text-green-500 ml-auto" />}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Kapsam">
            <div className="relative">
              <ShoppingCart className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={form.scope}
                onChange={(event) => setForm({ ...form, scope: event.target.value as DiscountScope })}
                className={`${selectClass} pl-10`}
              >
                {DISCOUNT_SCOPE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Görünürlük">
            <div className="relative">
              <Eye className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={form.visibility}
                onChange={(event) => setForm({ ...form, visibility: event.target.value as DiscountVisibility })}
                className={`${selectClass} pl-10`}
              >
                {DISCOUNT_VISIBILITY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Kullanım Tipi">
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={form.limitType}
                onChange={(event) => setForm({ ...form, limitType: event.target.value as DiscountLimitType })}
                className={`${selectClass} pl-10`}
              >
                {DISCOUNT_LIMIT_TYPE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        </div>

        {form.visibility === "password" && (
          <Field label="Erişim Parolası" required className="mt-5">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="Müşterinin girmesi gereken parola"
                className={`${inputClass} pl-10`}
              />
            </div>
          </Field>
        )}

        {form.limitType !== "unlimited" && (
          <Field label="Kullanım Limiti" required className="mt-5">
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                value={form.maxUses ?? ""}
                onChange={(event) => setForm({ ...form, maxUses: Number(event.target.value) || null })}
                placeholder="örn: 100"
                className={`${inputClass} pl-10`}
              />
            </div>
          </Field>
        )}

        <div className="flex justify-between mt-6">
          <button
            type="button"
            onClick={() => setActiveStep(2)}
            className="px-6 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            Geri
          </button>
          <button
            type="button"
            onClick={() => setActiveStep(4)}
            className="px-6 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors"
          >
            Devam Et
          </button>
        </div>
      </section>

      {/* Step 4: Tags & Notes */}
      <section className={`bg-white border rounded-2xl p-6 transition-all ${activeStep === 4 ? "border-primary/30 shadow-lg shadow-primary/5" : "border-gray-200"}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
            <StickyNote className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">Etiketler ve Notlar</h2>
            <p className="text-sm text-gray-500">Organizasyon ve iç notlar</p>
          </div>
        </div>

        <Field label="Etiketler">
          <input
            value={form.tags}
            onChange={(event) => setForm({ ...form, tags: event.target.value })}
            placeholder="kampanya, yılbaşı, özel (virgülle ayırın)"
            className={inputClass}
          />
          <p className="text-xs text-gray-400 mt-1.5">Birden fazla etiket için virgül kullanın</p>
        </Field>

        <Field label="İç Notlar" className="mt-5">
          <textarea
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="Sadece yöneticilerin görebileceği notlar..."
            rows={4}
            className={textAreaClass}
          />
        </Field>

        <div className="flex justify-between mt-6">
          <button
            type="button"
            onClick={() => setActiveStep(3)}
            className="px-6 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            Geri
          </button>
        </div>
      </section>

      {/* Submit Button */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="font-semibold text-gray-900">İndirimi Oluşturmaya Hazır</p>
            <p className="text-sm text-gray-500">Tüm bilgileri kontrol ettikten sonra kaydedin</p>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-8 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-primary/30"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Kaydediliyor...
              </>
            ) : (
              <>
                <Tag className="w-4 h-4" />
                {submitLabel}
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
