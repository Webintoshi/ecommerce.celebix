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

  const inputClass = "w-full rounded-2xl border border-[var(--admin-border)] bg-white/85 px-4 py-3 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-[var(--admin-accent)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--admin-accent)]/15";
  const selectClass = "w-full appearance-none cursor-pointer rounded-2xl border border-[var(--admin-border)] bg-white/85 px-4 py-3 text-sm text-gray-700 shadow-sm transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--admin-accent)]/15";
  const textAreaClass = "w-full rounded-2xl border border-[var(--admin-border)] bg-white/85 px-4 py-3 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-[var(--admin-accent)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--admin-accent)]/15 resize-none";

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-[24px] border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {/* Progress Steps */}
      <div className="overflow-hidden rounded-[28px] border border-[var(--admin-border)] bg-white p-4 shadow-[var(--shadow-md)] md:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Kurulum ilerlemesi</p>
            <p className="mt-1 text-sm font-medium text-[var(--admin-heading)]">İndiriminizi dört adımda tamamlayın</p>
          </div>
          <div className="rounded-full border border-[var(--admin-border)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-text-secondary)]">
            Adım {activeStep}/4
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[1, 2, 3, 4].map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => setActiveStep(step)}
            className={`rounded-[22px] border px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)] ${
              activeStep === step
                ? "border-[var(--admin-accent-border)] bg-gradient-to-r from-white to-white text-[var(--admin-accent-hover)] shadow-sm"
                : activeStep > step
                  ? "border-emerald-200 bg-emerald-50/80 text-emerald-700"
                  : "border-[var(--admin-border)] bg-white/80 text-[#8b7768] hover:border-[var(--admin-accent-border)] hover:bg-[#fff8f2]"
            }`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">0{step}</div>
            <div className="mt-1 text-sm font-semibold">
              {step === 1 ? "Temel bilgiler" : step === 2 ? "İndirim ayarları" : step === 3 ? "Kampanya kuralları" : "Notlar"}
            </div>
          </button>
        ))}
        </div>
      </div>

      {/* Step 1: Basic Info */}
      <section className={`rounded-[30px] border p-6 transition-all md:p-7 ${activeStep === 1 ? "border-[var(--admin-accent-border)] bg-white shadow-[var(--shadow-md)]" : "border-[var(--admin-border)] bg-white/92 shadow-[var(--shadow-md)]"}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent)] shadow-sm">
            <Tag className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--admin-heading)]">Temel Bilgiler</h2>
            <p className="text-sm text-[#7d6959]">İndirim adı, kodu ve açıklaması</p>
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
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase tracking-[0.14em] text-[#9a7c67]">Büyük harf</span>
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
            className="rounded-2xl bg-[var(--admin-accent)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(255,106,0,0.18)] transition hover:translate-y-[-1px] hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
          >
            Devam Et
          </button>
        </div>
      </section>

      {/* Step 2: Discount Settings */}
      <section className={`rounded-[30px] border p-6 transition-all md:p-7 ${activeStep === 2 ? "border-[var(--admin-accent-border)] bg-white shadow-[var(--shadow-md)]" : "border-[var(--admin-border)] bg-white/92 shadow-[var(--shadow-md)]"}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[var(--admin-border)] bg-gradient-to-br from-white to-white text-[var(--admin-accent-hover)] shadow-sm">
            <Settings2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--admin-heading)]">İndirim Ayarları</h2>
            <p className="text-sm text-[#7d6959]">Oran, tutar ve geçerlilik tarihleri</p>
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
        <div className="mt-6 flex flex-col gap-4 rounded-[24px] border border-[var(--admin-border)] bg-[#FCFDFE] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-[16px] ${form.isActive ? "bg-emerald-100" : "bg-stone-200"}`}>
              <Check className={`w-5 h-5 ${form.isActive ? "text-green-600" : "text-gray-400"}`} />
            </div>
            <div>
              <p className="font-medium text-[var(--admin-heading)]">İndirimi Aktif Başlat</p>
              <p className="text-sm text-[#7d6959]">Oluşturulduğunda hemen yayına alınır</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setForm({ ...form, isActive: !form.isActive })}
            className={`relative h-8 w-14 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)] ${form.isActive ? "bg-[var(--admin-accent)]" : "bg-stone-300"}`}
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
            className="rounded-2xl border border-[var(--admin-border)] bg-white px-6 py-3 text-sm font-medium text-[var(--admin-text-secondary)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] hover:text-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
          >
            Geri
          </button>
          <button
            type="button"
            onClick={() => setActiveStep(3)}
            className="rounded-2xl bg-[var(--admin-accent)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(255,106,0,0.18)] transition hover:translate-y-[-1px] hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
          >
            Devam Et
          </button>
        </div>
      </section>

      {/* Step 3: Campaign Rules */}
      <section className={`rounded-[30px] border p-6 transition-all md:p-7 ${activeStep === 3 ? "border-[var(--admin-accent-border)] bg-white shadow-[var(--shadow-md)]" : "border-[var(--admin-border)] bg-white/92 shadow-[var(--shadow-md)]"}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-amber-200 bg-gradient-to-br from-amber-50 to-white text-amber-700 shadow-sm">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--admin-heading)]">Kampanya Kuralları</h2>
            <p className="text-sm text-[#7d6959]">Kapsam, görünürlük ve kullanım limitleri</p>
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
            className="rounded-2xl border border-[var(--admin-border)] bg-white px-6 py-3 text-sm font-medium text-[var(--admin-text-secondary)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] hover:text-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
          >
            Geri
          </button>
          <button
            type="button"
            onClick={() => setActiveStep(4)}
            className="rounded-2xl bg-[var(--admin-accent)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(255,106,0,0.18)] transition hover:translate-y-[-1px] hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
          >
            Devam Et
          </button>
        </div>
      </section>

      {/* Step 4: Tags & Notes */}
      <section className={`rounded-[30px] border p-6 transition-all md:p-7 ${activeStep === 4 ? "border-[var(--admin-accent-border)] bg-white shadow-[var(--shadow-md)]" : "border-[var(--admin-border)] bg-white/92 shadow-[var(--shadow-md)]"}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[var(--admin-border)] bg-gradient-to-br from-white to-white text-[var(--admin-accent-hover)] shadow-sm">
            <StickyNote className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--admin-heading)]">Etiketler ve Notlar</h2>
            <p className="text-sm text-[#7d6959]">Organizasyon ve iç notlar</p>
          </div>
        </div>

        <Field label="Etiketler">
          <input
            value={form.tags}
            onChange={(event) => setForm({ ...form, tags: event.target.value })}
            placeholder="kampanya, yılbaşı, özel (virgülle ayırın)"
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-[#9a7c67]">Birden fazla etiket için virgül kullanın</p>
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
            className="rounded-2xl border border-[var(--admin-border)] bg-white px-6 py-3 text-sm font-medium text-[var(--admin-text-secondary)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] hover:text-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
          >
            Geri
          </button>
        </div>
      </section>

      {/* Submit Button */}
      <div className="rounded-[30px] border border-[var(--admin-border)] bg-gradient-to-r from-white via-white to-[#fff6ee] p-6 shadow-[var(--shadow-md)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex-1">
            <p className="font-semibold text-[var(--admin-heading)]">İndirimi Oluşturmaya Hazır</p>
            <p className="text-sm text-[#7d6959]">Tüm bilgileri kontrol ettikten sonra kaydedin.</p>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--admin-accent)] px-8 py-3 text-sm font-semibold text-white shadow-[var(--shadow-md)] transition hover:translate-y-[-1px] hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)] disabled:cursor-not-allowed disabled:opacity-50"
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
      <label className="mb-2 block text-sm font-medium text-[var(--admin-text-secondary)]">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}
