"use client";

import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  Clock,
  Eye,
  Filter,
  Gift,
  Loader2,
  Lock,
  Package,
  Percent,
  Save,
  Settings2,
  SlidersHorizontal,
  Tag,
  Truck,
  TurkishLira,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  AdminDiscount,
  AdminDiscountPayload,
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

type DiscountKind = "percentage" | "fixed" | "free_shipping" | "buy_x_get_y";
type ProductEligibility = "all" | "specific";
type CustomerEligibility = "all" | "segments" | "specific";

type FormState = {
  name: string;
  description: string;
  code: string;
  discountKind: DiscountKind;
  type: DiscountType;
  value: number;
  buyQuantity: number;
  getQuantity: number;
  productEligibility: ProductEligibility;
  includeDiscountedProducts: boolean;
  hasPurchaseAmountLimit: boolean;
  minOrder: number;
  maxOrder: number | null;
  hasQuantityLimit: boolean;
  minQuantity: number;
  maxQuantity: number | null;
  hasTotalUsageLimit: boolean;
  totalUsageLimit: number | null;
  hasCustomerUsageLimit: boolean;
  customerUsageLimit: number | null;
  customerEligibility: CustomerEligibility;
  requireCustomerAccount: boolean;
  canCombine: boolean;
  restrictChannels: boolean;
  hasStartDate: boolean;
  hasEndDate: boolean;
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

const DISCOUNT_KIND_OPTIONS: Array<{
  value: DiscountKind;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "percentage", label: "Yüzdelik", icon: Percent },
  { value: "fixed", label: "Sabit Tutar", icon: TurkishLira },
  { value: "free_shipping", label: "Ücretsiz Kargo", icon: Truck },
  { value: "buy_x_get_y", label: "X Al Y Kazan", icon: Gift },
];

const PRODUCT_OPTIONS: Array<{
  value: ProductEligibility;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "all", label: "Tüm Ürünler", icon: Package },
  { value: "specific", label: "Belirli Ürünler", icon: Filter },
];

const CUSTOMER_OPTIONS: Array<{
  value: CustomerEligibility;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "all", label: "Tüm Kişiler", icon: Users },
  { value: "segments", label: "Müşteri Grubu & Segment", icon: Users },
  { value: "specific", label: "Spesifik Müşteriler", icon: Tag },
];

function formatDateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function buildInitialState(initial?: AdminDiscount | null): FormState {
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  if (!initial) {
    return {
      name: "",
      description: "",
      code: "",
      discountKind: "percentage",
      type: "percentage",
      value: 10,
      buyQuantity: 2,
      getQuantity: 1,
      productEligibility: "all",
      includeDiscountedProducts: false,
      hasPurchaseAmountLimit: false,
      minOrder: 0,
      maxOrder: null,
      hasQuantityLimit: false,
      minQuantity: 1,
      maxQuantity: null,
      hasTotalUsageLimit: false,
      totalUsageLimit: null,
      hasCustomerUsageLimit: false,
      customerUsageLimit: null,
      customerEligibility: "all",
      requireCustomerAccount: false,
      canCombine: false,
      restrictChannels: false,
      hasStartDate: false,
      hasEndDate: false,
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

  const limitType = initial.limitType || (initial.maxUses ? "once" : "unlimited");

  return {
    name: initial.name,
    description: initial.description || "",
    code: initial.code,
    discountKind: initial.type === "fixed" ? "fixed" : "percentage",
    type: initial.type,
    value: initial.value,
    buyQuantity: 2,
    getQuantity: 1,
    productEligibility: initial.scope === "products" || initial.scope === "collections" ? "specific" : "all",
    includeDiscountedProducts: false,
    hasPurchaseAmountLimit: Boolean(initial.minOrder && initial.minOrder > 0),
    minOrder: initial.minOrder || 0,
    maxOrder: null,
    hasQuantityLimit: false,
    minQuantity: 1,
    maxQuantity: null,
    hasTotalUsageLimit: limitType === "once",
    totalUsageLimit: limitType === "once" ? initial.maxUses : null,
    hasCustomerUsageLimit: limitType === "once_per_customer",
    customerUsageLimit: limitType === "once_per_customer" ? initial.maxUses : null,
    customerEligibility: initial.scope === "customers" ? "specific" : "all",
    requireCustomerAccount: initial.scope === "customers",
    canCombine: false,
    restrictChannels: false,
    hasStartDate: Boolean(initial.startsAt),
    hasEndDate: Boolean(initial.expiresAt),
    startsAt: formatDateInput(initial.startsAt),
    expiresAt: formatDateInput(initial.expiresAt),
    isActive: initial.isActive,
    scope: initial.scope,
    visibility: initial.visibility,
    password: initial.password || "",
    limitType,
    tags: (initial.tags || []).join(", "),
    notes: initial.notes || "",
  };
}

function deriveScope(form: FormState): DiscountScope {
  if (form.productEligibility === "specific") return "products";
  if (form.customerEligibility !== "all") return "customers";
  return "all";
}

function deriveLimitType(form: FormState): DiscountLimitType {
  if (form.hasTotalUsageLimit) return "once";
  if (form.hasCustomerUsageLimit) return "once_per_customer";
  return "unlimited";
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
    const limitType = deriveLimitType(form);
    const normalizedMaxUses = form.hasTotalUsageLimit
      ? form.totalUsageLimit
      : form.hasCustomerUsageLimit
        ? form.customerUsageLimit
        : null;

    return {
      code: form.code.toUpperCase().trim(),
      type: form.discountKind === "percentage" ? "percentage" : "fixed",
      value: Number(form.value) || 0,
      minOrder: form.hasPurchaseAmountLimit ? Number(form.minOrder) || 0 : 0,
      maxUses: normalizedMaxUses && normalizedMaxUses > 0 ? normalizedMaxUses : null,
      startsAt:
        form.hasStartDate && form.startsAt ? new Date(`${form.startsAt}T00:00:00.000Z`).toISOString() : null,
      expiresAt:
        form.hasEndDate && form.expiresAt ? new Date(`${form.expiresAt}T23:59:59.999Z`).toISOString() : null,
      isActive: form.isActive,
      metadata: {
        name: form.name.trim(),
        description: form.description.trim(),
        scope: deriveScope(form),
        visibility: form.visibility,
        password: form.visibility === "password" ? form.password.trim() : "",
        limitType,
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

    if (form.discountKind === "free_shipping" || form.discountKind === "buy_x_get_y") {
      setError("Bu indirim türü frontend olarak hazır; backend bağlantısı yapılınca kaydedilebilir.");
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

    if (form.hasPurchaseAmountLimit && form.maxOrder && form.maxOrder < form.minOrder) {
      setError("Maksimum satın alma tutarı minimum tutardan küçük olamaz.");
      return;
    }

    if (form.hasQuantityLimit && form.maxQuantity && form.maxQuantity < form.minQuantity) {
      setError("Maksimum ürün adedi minimum adetten küçük olamaz.");
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

    if (form.hasTotalUsageLimit && (!form.totalUsageLimit || form.totalUsageLimit <= 0)) {
      setError("Toplam kullanım limiti zorunlu.");
      return;
    }

    if (form.hasCustomerUsageLimit && (!form.customerUsageLimit || form.customerUsageLimit <= 0)) {
      setError("Kullanıcı başına limit zorunlu.");
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

  const selectDiscountKind = (kind: DiscountKind) => {
    setForm((current) => ({
      ...current,
      discountKind: kind,
      type: kind === "percentage" ? "percentage" : "fixed",
      value:
        kind === "percentage"
          ? current.value || 10
          : kind === "fixed"
            ? current.value || 100
            : current.value,
    }));
  };

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
              rows={2}
              className={textAreaClass}
            />
          </Field>
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <SectionHeader icon={Percent} title="İndirim türü" />
        <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-4 xl:p-6">
          {DISCOUNT_KIND_OPTIONS.map((option) => (
            <ChoiceCard
              key={option.value}
              icon={option.icon}
              label={option.label}
              selected={form.discountKind === option.value}
              onClick={() => selectDiscountKind(option.value)}
              pending={option.value === "free_shipping" || option.value === "buy_x_get_y"}
            />
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <SectionHeader
          icon={form.discountKind === "fixed" ? TurkishLira : form.discountKind === "free_shipping" ? Truck : Percent}
          title={form.discountKind === "percentage" ? "İndirim oranı" : form.discountKind === "fixed" ? "İndirim tutarı" : form.discountKind === "free_shipping" ? "Kargo indirimi" : "X al Y kazan"}
        />
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-3 xl:p-6">
          {form.discountKind === "percentage" ? (
            <Field label="İndirim oranı" required>
              <div className="relative max-w-[220px]">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#6B7280]">%</span>
                <input
                  type="number"
                  value={form.value}
                  onChange={(event) => setForm({ ...form, value: Number(event.target.value) || 0 })}
                  placeholder="0"
                  className={`${inputClass} pl-9`}
                />
              </div>
            </Field>
          ) : null}

          {form.discountKind === "fixed" ? (
            <Field label="İndirim tutarı" required>
              <div className="relative max-w-[260px]">
                <TurkishLira className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                <input
                  type="number"
                  value={form.value}
                  onChange={(event) => setForm({ ...form, value: Number(event.target.value) || 0 })}
                  placeholder="0"
                  className={`${inputClass} pl-9`}
                />
              </div>
            </Field>
          ) : null}

          {form.discountKind === "free_shipping" ? (
            <div className="lg:col-span-3">
              <FrontendOnlyNotice text="Ücretsiz kargo türü görsel olarak hazır. Kargo hesaplama bağlantısı sonraki fazda yapılacak." />
            </div>
          ) : null}

          {form.discountKind === "buy_x_get_y" ? (
            <>
              <Field label="Alınacak adet">
                <input
                  type="number"
                  min={1}
                  value={form.buyQuantity}
                  onChange={(event) => setForm({ ...form, buyQuantity: Number(event.target.value) || 1 })}
                  className={inputClass}
                />
              </Field>
              <Field label="Kazanılacak adet">
                <input
                  type="number"
                  min={1}
                  value={form.getQuantity}
                  onChange={(event) => setForm({ ...form, getQuantity: Number(event.target.value) || 1 })}
                  className={inputClass}
                />
              </Field>
              <FrontendOnlyNotice text="X Al Y Kazan kuralları frontend olarak hazır; ürün eşleştirme bağlantısı sonraki fazda yapılacak." />
            </>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <SectionHeader icon={Package} title="Koşullar" />
        <div className="grid gap-3 border-b border-[#E1E6EF] p-4 sm:p-5 md:grid-cols-2 xl:p-6">
          {PRODUCT_OPTIONS.map((option) => (
            <ChoiceCard
              key={option.value}
              icon={option.icon}
              label={option.label}
              selected={form.productEligibility === option.value}
              onClick={() => setForm({ ...form, productEligibility: option.value })}
            />
          ))}
        </div>
        <div className="p-4 sm:p-5 xl:p-6">
          <CheckboxRow
            checked={form.includeDiscountedProducts}
            label="İndirimli ürünleri kampanyaya dahil et"
            onChange={() => setForm({ ...form, includeDiscountedProducts: !form.includeDiscountedProducts })}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <SectionHeader icon={SlidersHorizontal} title="Gereksinimler" />
        <div className="divide-y divide-[#E1E6EF]">
          <ToggleRow
            checked={form.hasPurchaseAmountLimit}
            title="Satın alma tutarını sınırla"
            onToggle={() =>
              setForm((current) => ({
                ...current,
                hasPurchaseAmountLimit: !current.hasPurchaseAmountLimit,
                minOrder: !current.hasPurchaseAmountLimit ? Math.max(current.minOrder, 0) : 0,
              }))
            }
          >
            {form.hasPurchaseAmountLimit ? (
              <div className="grid gap-3 pt-3 sm:grid-cols-2">
                <Field label="Minimum tutar">
                  <MoneyInput
                    value={form.minOrder}
                    onChange={(value) => setForm({ ...form, minOrder: value })}
                    inputClass={inputClass}
                  />
                </Field>
                <Field label="Maksimum tutar">
                  <MoneyInput
                    value={form.maxOrder ?? 0}
                    onChange={(value) => setForm({ ...form, maxOrder: value || null })}
                    inputClass={inputClass}
                  />
                </Field>
              </div>
            ) : null}
          </ToggleRow>

          <ToggleRow
            checked={form.hasQuantityLimit}
            title="Ürün adetini sınırla"
            onToggle={() => setForm({ ...form, hasQuantityLimit: !form.hasQuantityLimit })}
          >
            {form.hasQuantityLimit ? (
              <div className="grid gap-3 pt-3 sm:grid-cols-2">
                <Field label="Minimum adet">
                  <input
                    type="number"
                    min={1}
                    value={form.minQuantity}
                    onChange={(event) => setForm({ ...form, minQuantity: Number(event.target.value) || 1 })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Maksimum adet">
                  <input
                    type="number"
                    min={1}
                    value={form.maxQuantity ?? ""}
                    onChange={(event) => setForm({ ...form, maxQuantity: Number(event.target.value) || null })}
                    className={inputClass}
                  />
                </Field>
              </div>
            ) : null}
          </ToggleRow>
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <SectionHeader icon={Users} title="Kullanım limitleri" />
        <div className="divide-y divide-[#E1E6EF]">
          <ToggleRow
            checked={form.hasTotalUsageLimit}
            title="Toplam kullanım limiti belirle"
            onToggle={() =>
              setForm((current) => ({
                ...current,
                hasTotalUsageLimit: !current.hasTotalUsageLimit,
                totalUsageLimit: !current.hasTotalUsageLimit ? current.totalUsageLimit || 100 : null,
              }))
            }
          >
            {form.hasTotalUsageLimit ? (
              <div className="max-w-[260px] pt-3">
                <Field label="Toplam limit">
                  <input
                    type="number"
                    min={1}
                    value={form.totalUsageLimit ?? ""}
                    onChange={(event) => setForm({ ...form, totalUsageLimit: Number(event.target.value) || null })}
                    className={inputClass}
                  />
                </Field>
              </div>
            ) : null}
          </ToggleRow>

          <ToggleRow
            checked={form.hasCustomerUsageLimit}
            title="Kullanıcı başına limit belirle"
            onToggle={() =>
              setForm((current) => ({
                ...current,
                hasCustomerUsageLimit: !current.hasCustomerUsageLimit,
                customerUsageLimit: !current.hasCustomerUsageLimit ? current.customerUsageLimit || 1 : null,
              }))
            }
          >
            {form.hasCustomerUsageLimit ? (
              <div className="max-w-[260px] pt-3">
                <Field label="Kişi başı limit">
                  <input
                    type="number"
                    min={1}
                    value={form.customerUsageLimit ?? ""}
                    onChange={(event) => setForm({ ...form, customerUsageLimit: Number(event.target.value) || null })}
                    className={inputClass}
                  />
                </Field>
              </div>
            ) : null}
          </ToggleRow>
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <SectionHeader icon={Users} title="Müşteriler" />
        <div className="grid gap-3 border-b border-[#E1E6EF] p-4 sm:p-5 md:grid-cols-3 xl:p-6">
          {CUSTOMER_OPTIONS.map((option) => (
            <ChoiceCard
              key={option.value}
              icon={option.icon}
              label={option.label}
              selected={form.customerEligibility === option.value}
              onClick={() => setForm({ ...form, customerEligibility: option.value })}
              pending={option.value !== "all"}
            />
          ))}
        </div>
        <div className="p-4 sm:p-5 xl:p-6">
          <CheckboxRow
            checked={form.requireCustomerAccount}
            label="Kampanyadan sadece müşteri hesabı olanlar yararlanabilsin"
            onChange={() => setForm({ ...form, requireCustomerAccount: !form.requireCustomerAccount })}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <SectionHeader icon={Settings2} title="Ayarlar" />
        <div className="divide-y divide-[#E1E6EF]">
          <ToggleRow
            checked={form.canCombine}
            title="Diğer kampanyalarla birleştirilsin"
            onToggle={() => setForm({ ...form, canCombine: !form.canCombine })}
          />
          <ToggleRow
            checked={form.restrictChannels}
            title="Satış kanallarını ve kurları belirle"
            onToggle={() => setForm({ ...form, restrictChannels: !form.restrictChannels })}
          />
        </div>
        <div className="grid gap-4 border-t border-[#E1E6EF] p-4 sm:p-5 lg:grid-cols-2 xl:p-6">
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
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <SectionHeader icon={Clock} title="Aktif tarihler" />
        <div className="divide-y divide-[#E1E6EF]">
          <ToggleRow
            checked={form.hasStartDate}
            title="Başlangıç tarihi ekle"
            onToggle={() => setForm({ ...form, hasStartDate: !form.hasStartDate })}
          >
            {form.hasStartDate ? (
              <div className="max-w-[260px] pt-3">
                <Field label="Başlangıç">
                  <DateInput
                    value={form.startsAt}
                    onChange={(value) => setForm({ ...form, startsAt: value })}
                    inputClass={inputClass}
                  />
                </Field>
              </div>
            ) : null}
          </ToggleRow>

          <ToggleRow
            checked={form.hasEndDate}
            title="Bitiş tarihi ekle"
            onToggle={() => setForm({ ...form, hasEndDate: !form.hasEndDate })}
          >
            {form.hasEndDate ? (
              <div className="max-w-[260px] pt-3">
                <Field label="Bitiş">
                  <DateInput
                    value={form.expiresAt}
                    onChange={(value) => setForm({ ...form, expiresAt: value })}
                    inputClass={inputClass}
                  />
                </Field>
              </div>
            ) : null}
          </ToggleRow>
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

function ChoiceCard({
  icon: Icon,
  label,
  selected,
  pending = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  selected: boolean;
  pending?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-16 items-center justify-between gap-3 rounded-[8px] border bg-white px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]",
        selected
          ? "border-[#FF6A00] bg-[#FFF8F3] text-[#111827]"
          : "border-[#DCE3EC] text-[#374151] hover:border-[#FFD1B5] hover:bg-[#FFF8F3]",
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-[#FFD1B5] bg-[#FFF1E8] text-[#FF6A00]" : "border-[#DCE3EC] bg-[#F9F9F9] text-[#6B7280]",
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-bold">{label}</span>
          {pending ? <span className="mt-0.5 block text-[11px] font-semibold text-[#C05621]">Bağlantı bekliyor</span> : null}
        </span>
      </span>
      {selected ? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF6A00] text-xs font-black text-white">
          ✓
        </span>
      ) : null}
    </button>
  );
}

function ToggleRow({
  checked,
  title,
  children,
  onToggle,
}: {
  checked: boolean;
  title: string;
  children?: ReactNode;
  onToggle: () => void;
}) {
  return (
    <div className="p-4 sm:p-5 xl:p-6">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={checked}
          className={cn(
            "relative mt-0.5 h-[22px] w-10 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]",
            checked ? "bg-[#FF6A00]" : "bg-[#CBD5E1]",
          )}
          style={{ minHeight: "22px" }}
        >
          <span
            className={cn(
              "absolute top-[3px] h-4 w-4 rounded-full bg-white transition",
              checked ? "left-[21px]" : "left-[3px]",
            )}
          />
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onToggle}
            className="text-left text-sm font-bold text-[#111827] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]"
          >
            {title}
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}

function CheckboxRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex items-center gap-3 text-left text-sm font-bold text-[#111827] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]"
      aria-pressed={checked}
    >
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-[5px] border text-[11px] font-black",
          checked ? "border-[#FF6A00] bg-[#FF6A00] text-white" : "border-[#DCE3EC] bg-white text-transparent",
        )}
      >
        ✓
      </span>
      {label}
    </button>
  );
}

function FrontendOnlyNotice({ text }: { text: string }) {
  return (
    <div className="rounded-[8px] border border-[#FFD1B5] bg-[#FFF8F3] px-3 py-3 text-sm font-semibold text-[#C05621]">
      {text}
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
  inputClass,
}: {
  value: number;
  onChange: (value: number) => void;
  inputClass: string;
}) {
  return (
    <div className="relative">
      <TurkishLira className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className={`${inputClass} pl-9`}
      />
    </div>
  );
}

function DateInput({
  value,
  onChange,
  inputClass,
}: {
  value: string;
  onChange: (value: string) => void;
  inputClass: string;
}) {
  return (
    <div className="relative">
      <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} pl-9`}
      />
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
