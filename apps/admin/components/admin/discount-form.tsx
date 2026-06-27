"use client";

import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  Eye,
  Loader2,
  Lock,
  Percent,
  Save,
  ShoppingCart,
  Tag,
  TurkishLira,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";

type Props = {
  initial?: AdminDiscount | null;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (payload: AdminDiscountPayload) => Promise<void>;
  formId?: string;
  hideFooterActions?: boolean;
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

export function DiscountForm({
  initial = null,
  submitting = false,
  submitLabel,
  onSubmit,
  formId,
  hideFooterActions = false,
}: Props) {
  const [form, setForm] = useState<FormState>(() => buildInitialState(initial));
  const [error, setError] = useState<string | null>(null);

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!payload.metadata.name) {
      setError("İndirim adı zorunlu.");
      return;
    }

    if (!payload.code) {
      setError("İndirim kodu zorunlu.");
      return;
    }

    if (payload.value <= 0) {
      setError("İndirim değeri 0'dan büyük olmalı.");
      return;
    }

    if (payload.type === "percentage" && payload.value > 100) {
      setError("Yüzde indirimi 100'den büyük olamaz.");
      return;
    }

    if (payload.startsAt && payload.expiresAt && new Date(payload.startsAt) >= new Date(payload.expiresAt)) {
      setError("Bitiş tarihi başlangıç tarihinden sonra olmalı.");
      return;
    }

    if (payload.metadata.visibility === "password" && !payload.metadata.password) {
      setError("Parola korumalı indirim için parola girin.");
      return;
    }

    if (payload.metadata.limitType !== "unlimited" && (!payload.maxUses || payload.maxUses <= 0)) {
      setError("Kullanım limiti zorunlu.");
      return;
    }

    await onSubmit(payload);
  };

  const inputClass =
    "h-11 w-full rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-medium text-[#111827] transition placeholder:text-[#9CA3AF] focus:border-[#FF6A00] focus:outline-none focus:ring-4 focus:ring-[#FFF1E8]";
  const selectClass =
    "h-11 w-full appearance-none rounded-[8px] border border-[#DCE3EC] bg-white px-3 pr-9 text-sm font-semibold text-[#374151] transition focus:border-[#FF6A00] focus:outline-none focus:ring-4 focus:ring-[#FFF1E8]";
  const textAreaClass =
    "w-full resize-none rounded-[8px] border border-[#DCE3EC] bg-white px-3 py-3 text-sm font-medium text-[#111827] transition placeholder:text-[#9CA3AF] focus:border-[#FF6A00] focus:outline-none focus:ring-4 focus:ring-[#FFF1E8]";

  return (
    <form id={formId} onSubmit={submit} className="space-y-4">
      {error ? (
        <div className="flex items-center gap-2 border-y border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <SectionHeader icon={Tag} title="Temel bilgiler" />
        <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-2 xl:p-6">
          <Field label="İndirim adı" required>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Yılbaşı indirimi"
              className={inputClass}
            />
          </Field>

          <Field label="Kupon kodu" required>
            <input
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
              placeholder="YENIYIL"
              className={`${inputClass} uppercase`}
            />
          </Field>

          <Field label="Açıklama" className="xl:col-span-2">
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Kısa açıklama"
              rows={3}
              className={textAreaClass}
            />
          </Field>
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <SectionHeader icon={Percent} title="İndirim ayarı" />
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-3 xl:p-6">
          <Field label="Tip">
            <SelectWrap>
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
            </SelectWrap>
          </Field>

          <Field label={form.type === "percentage" ? "Oran" : "Tutar"}>
            <div className="relative">
              <input
                type="number"
                value={form.value}
                onChange={(event) => setForm({ ...form, value: Number(event.target.value) || 0 })}
                placeholder={form.type === "percentage" ? "10" : "100"}
                className={cn(inputClass, form.type === "fixed" && "pl-9")}
              />
              {form.type === "percentage" ? (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#6B7280]">%</span>
              ) : (
                <TurkishLira className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
              )}
            </div>
          </Field>

          <Field label="Minimum sipariş">
            <div className="relative">
              <TurkishLira className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
              <input
                type="number"
                value={form.minOrder}
                onChange={(event) => setForm({ ...form, minOrder: Number(event.target.value) || 0 })}
                className={`${inputClass} pl-9`}
              />
            </div>
          </Field>

          <Field label="Başlangıç">
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
              <input
                type="date"
                value={form.startsAt}
                onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
                className={`${inputClass} pl-9`}
              />
            </div>
          </Field>

          <Field label="Bitiş">
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
              <input
                type="date"
                value={form.expiresAt}
                onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
                className={`${inputClass} pl-9`}
              />
            </div>
          </Field>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setForm({ ...form, isActive: !form.isActive })}
              className="flex h-11 w-full items-center justify-between rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-left text-sm font-semibold text-[#374151] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]"
              aria-pressed={form.isActive}
            >
              <span>Durum</span>
              <span className={cn("text-sm font-bold", form.isActive ? "text-[#16A34A]" : "text-[#9CA3AF]")}>
                {form.isActive ? "Aktif" : "Pasif"}
              </span>
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <SectionHeader icon={ShoppingCart} title="Kurallar" />
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-3 xl:p-6">
          <Field label="Kapsam">
            <SelectWrap>
              <select
                value={form.scope}
                onChange={(event) => setForm({ ...form, scope: event.target.value as DiscountScope })}
                className={`${selectClass} pl-9`}
              >
                {DISCOUNT_SCOPE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <ShoppingCart className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
            </SelectWrap>
          </Field>

          <Field label="Görünürlük">
            <SelectWrap>
              <select
                value={form.visibility}
                onChange={(event) => setForm({ ...form, visibility: event.target.value as DiscountVisibility })}
                className={`${selectClass} pl-9`}
              >
                {DISCOUNT_VISIBILITY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <Eye className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
            </SelectWrap>
          </Field>

          <Field label="Kullanım">
            <SelectWrap>
              <select
                value={form.limitType}
                onChange={(event) => setForm({ ...form, limitType: event.target.value as DiscountLimitType })}
                className={`${selectClass} pl-9`}
              >
                {DISCOUNT_LIMIT_TYPE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
            </SelectWrap>
          </Field>

          {form.visibility === "password" ? (
            <Field label="Parola" required>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  className={`${inputClass} pl-9`}
                />
              </div>
            </Field>
          ) : null}

          {form.limitType !== "unlimited" ? (
            <Field label="Limit" required>
              <input
                type="number"
                value={form.maxUses ?? ""}
                onChange={(event) => setForm({ ...form, maxUses: Number(event.target.value) || null })}
                className={inputClass}
              />
            </Field>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <SectionHeader icon={Tag} title="Etiket ve not" />
        <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-2 xl:p-6">
          <Field label="Etiketler">
            <input
              value={form.tags}
              onChange={(event) => setForm({ ...form, tags: event.target.value })}
              placeholder="kampanya, yeni sezon"
              className={inputClass}
            />
          </Field>

          <Field label="İç not">
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Yönetici notu"
              rows={3}
              className={textAreaClass}
            />
          </Field>
        </div>
      </section>

      {!hideFooterActions ? (
        <div className="flex justify-end border-t border-[#E1E6EF] pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.18)] transition hover:bg-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {submitting ? "Kaydediliyor" : submitLabel}
          </button>
        </div>
      ) : null}
    </form>
  );
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 sm:px-5 xl:px-6">
      <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#FFF1E8] text-[#FF6A00]">
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">{title}</h2>
    </div>
  );
}

function SelectWrap({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
    </div>
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
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
        {label}
        {required ? <span className="ml-1 text-[#FF6A00]">*</span> : null}
      </label>
      {children}
    </div>
  );
}
