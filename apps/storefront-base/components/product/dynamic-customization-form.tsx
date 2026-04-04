"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CartCustomizationPayload,
  CustomizationSchema,
  CustomizationStep,
  PriceBreakdown,
  SelectionValue,
} from "@/types/product-customization";
import { Skeleton } from "@/components/ui/skeleton";
import { evaluateConditions } from "@/lib/customization/conditional-logic";
import { calculatePrice, formatPrice } from "@/lib/customization/price-calculator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const IMAGE_ASPECT_RATIO_CLASS = {
  "1:1": "aspect-square",
  "3:2": "aspect-[3/2]",
  "2:3": "aspect-[3/2]",
  "16:9": "aspect-video",
} as const;

export interface CustomizationSelectionState {
  payload: CartCustomizationPayload | null;
  extraPrice: number;
  finalPrice: number;
  isValid: boolean;
  hasSelections: boolean;
}

interface DynamicCustomizationFormProps {
  schemaId: string;
  productId: string;
  variantId: string;
  basePrice: number;
  initialSchema?: (CustomizationSchema & { steps: CustomizationStep[] }) | null;
  onCustomizationChange?: (state: CustomizationSelectionState) => void;
  validationNonce?: number;
  className?: string;
}

function buildDefaultValues(steps: CustomizationStep[]) {
  const defaultValues: Record<string, unknown> = {};

  for (const step of steps) {
    if (step.default_value !== undefined) {
      defaultValues[step.key] = step.default_value;
    } else if (step.type === "checkbox") {
      defaultValues[step.key] = false;
    } else if (step.type === "multi_select") {
      defaultValues[step.key] = [];
    }
  }

  return defaultValues;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function buildSelections(
  steps: CustomizationStep[],
  values: Record<string, unknown>,
  priceBreakdown: PriceBreakdown
): SelectionValue[] {
  return steps
    .filter((step) => hasMeaningfulValue(values[step.key]))
    .map((step) => {
      const value = values[step.key] as string | number | boolean | string[];
      let displayValue = String(value);

      if (Array.isArray(value)) {
        const labels = value.map((entry) => {
          const option = step.options?.find((opt) => opt.value === entry);
          return option?.label || String(entry);
        });
        displayValue = labels.join(", ");
      } else if (step.options) {
        const option = step.options.find((opt) => opt.value === value);
        if (option) displayValue = option.label;
      }

      const adjustment =
        priceBreakdown.adjustments.find((adj) => adj.step_key === step.key)
          ?.adjustment_amount ?? 0;

      return {
        step_id: step.id,
        step_key: step.key,
        step_label: step.label,
        type: step.type,
        value,
        display_value: displayValue,
        price_adjustment: adjustment,
      };
    });
}

export function DynamicCustomizationForm({
  schemaId,
  productId: _productId,
  variantId: _variantId,
  basePrice,
  initialSchema = null,
  onCustomizationChange,
  validationNonce = 0,
  className,
}: DynamicCustomizationFormProps) {
  const [schema, setSchema] = useState<(CustomizationSchema & { steps: CustomizationStep[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadSchema() {
      setLoading(true);

      if (initialSchema && initialSchema.id === schemaId) {
        setSchema(initialSchema);
        setValues(buildDefaultValues(initialSchema.steps || []));
        setTouched({});
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          "/api/customization/schema?schemaId=" + encodeURIComponent(schemaId),
          { cache: "no-store" }
        );
        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Kişiselleştirme şeması yüklenemedi");
        }

        const loadedSchema = payload.schema as
          | (CustomizationSchema & { steps: CustomizationStep[] })
          | null;

        if (!loadedSchema) {
          setSchema(null);
          setValues({});
          setTouched({});
          return;
        }

        setSchema(loadedSchema);
        setValues(buildDefaultValues(loadedSchema.steps || []));
        setTouched({});
      } catch (error) {
        console.error("Customization schema load error:", error);
        setSchema(null);
        setValues({});
        setTouched({});
      } finally {
        setLoading(false);
      }
    }

    loadSchema();
  }, [initialSchema, schemaId]);

  const visibleSteps = useMemo(
    () =>
      schema?.steps.filter((step) => {
        if (!step.show_conditions) return true;
        return evaluateConditions(step.show_conditions, values, schema.steps);
      }) || [],
    [schema, values]
  );

  useEffect(() => {
    if (!schema) {
      setPriceBreakdown(null);
      return;
    }

    const breakdown = calculatePrice(basePrice, visibleSteps, values);
    setPriceBreakdown(breakdown);
  }, [values, schema, basePrice, visibleSteps]);

  const handleValueChange = useCallback((stepKey: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [stepKey]: value }));
    setTouched((prev) => ({ ...prev, [stepKey]: true }));
  }, []);

  const isStepValid = useCallback(
    (step: CustomizationStep): boolean => {
      if (!step.is_required) return true;
      return hasMeaningfulValue(values[step.key]);
    },
    [values]
  );

  const allStepsValid = useMemo(
    () => visibleSteps.every(isStepValid),
    [visibleSteps, isStepValid]
  );

  useEffect(() => {
    if (!validationNonce || visibleSteps.length === 0) return;

    setTouched((prev) => {
      const next = { ...prev };
      for (const step of visibleSteps) {
        next[step.key] = true;
      }
      return next;
    });
  }, [validationNonce, visibleSteps]);

  useEffect(() => {
    if (!onCustomizationChange) return;

    if (!schema || !priceBreakdown) {
      onCustomizationChange({
        payload: null,
        extraPrice: 0,
        finalPrice: basePrice,
        isValid: true,
        hasSelections: false,
      });
      return;
    }

    const selections = buildSelections(visibleSteps, values, priceBreakdown);
    const hasSelections = selections.length > 0;

    onCustomizationChange({
      payload:
        allStepsValid && hasSelections
          ? {
              schema_id: schema.id,
              schema_snapshot: {
                id: schema.id,
                name: schema.name,
                slug: schema.slug,
                description: schema.description,
                is_active: schema.is_active,
                sort_order: schema.sort_order,
                settings: schema.settings || {},
              },
              selections,
              price_breakdown: priceBreakdown,
            }
          : null,
      extraPrice: priceBreakdown.total_adjustment,
      finalPrice: priceBreakdown.final_price,
      isValid: allStepsValid,
      hasSelections,
    });
  }, [allStepsValid, basePrice, onCustomizationChange, priceBreakdown, schema, values, visibleSteps]);

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-11 w-full rounded-2xl" />
        <Skeleton className="h-11 w-full rounded-2xl" />
      </div>
    );
  }

  if (!schema || visibleSteps.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-4", className)}>
      {schema.description && (
        <p className="text-sm leading-relaxed text-neutral-500">
          {schema.description}
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        {visibleSteps.map((step) => (
          <FormField
            key={step.id}
            step={step}
            value={values[step.key]}
            onChange={(value) => handleValueChange(step.key, value)}
            isValid={isStepValid(step)}
            showError={Boolean(touched[step.key] && !isStepValid(step))}
          />
        ))}
      </div>

      {priceBreakdown && priceBreakdown.total_adjustment > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white/70 px-4 py-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-500">
              Ekstra Ücret
            </p>
            <p className="text-sm text-neutral-500">
              Seçtiğiniz kişiselleştirme fiyatı ürüne eklenir.
            </p>
          </div>
          <span className="text-base font-semibold text-neutral-900">
            +{formatPrice(priceBreakdown.total_adjustment)}
          </span>
        </div>
      )}

      {validationNonce > 0 && !allStepsValid && (
        <p className="text-sm text-rose-600">
          Sepete eklemeden önce zorunlu kişiselleştirme alanlarını tamamlayın.
        </p>
      )}
    </div>
  );
}

function FormField({
  step,
  value,
  onChange,
  isValid,
  showError,
}: {
  step: CustomizationStep;
  value: unknown;
  onChange: (value: unknown) => void;
  isValid: boolean;
  showError: boolean;
}) {
  const label = (
    <div className="mb-2 flex items-center gap-1">
      <Label className={cn("text-sm text-neutral-900", showError && "text-rose-600")}>
        {step.label}
      </Label>
      {step.is_required && <span className="text-rose-600">*</span>}
    </div>
  );

  const helpText = step.help_text && (
    <p className="mt-1 text-xs text-neutral-500">{step.help_text}</p>
  );

  const errorMessage = showError && !isValid && (
    <p className="mt-1 text-xs text-rose-600">Bu alan gereklidir</p>
  );

  const imageAspectRatioClass =
    IMAGE_ASPECT_RATIO_CLASS[step.style_config?.image_aspect_ratio || "1:1"];
  const imageFitMode = step.style_config?.image_fit_mode || "contain";
  const imageFitModeClass =
    imageFitMode === "cover" ? "object-cover" : "object-contain";
  const imageWrapperClass = imageFitMode === "cover" ? "" : "p-3";

  const gridClass = {
    full: "w-full",
    half: "w-full md:w-[calc(50%-0.5rem)]",
    third: "w-full md:w-[calc(33.333%-0.75rem)]",
    quarter: "w-full md:w-[calc(25%-0.75rem)]",
  }[step.grid_width || "full"];

  return (
    <div className={gridClass}>
      {step.type === "select" && (
        <div>
          {label}
          <Select value={String(value || "")} onValueChange={onChange}>
            <SelectTrigger
              className={cn(
                "rounded-2xl border-neutral-200 bg-white",
                showError && "border-rose-400"
              )}
            >
              <SelectValue placeholder={step.placeholder || "Seçiniz"} />
            </SelectTrigger>
            <SelectContent>
              {step.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex w-full items-center justify-between">
                    <span>{option.label}</span>
                    {option.price_adjustment > 0 && (
                      <span className="ml-2 text-xs text-emerald-600">
                        +{formatPrice(option.price_adjustment)}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {helpText}
          {errorMessage}
        </div>
      )}

      {step.type === "radio_group" && (
        <div>
          {label}
          <RadioGroup
            value={String(value || "")}
            onValueChange={onChange}
            className="flex flex-wrap gap-2"
          >
            {step.options?.map((option) => (
              <div key={option.value}>
                <RadioGroupItem
                  value={option.value}
                  id={`${step.key}-${option.value}`}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={`${step.key}-${option.value}`}
                  className={cn(
                    "flex cursor-pointer items-center justify-center rounded-full border px-4 py-2 text-sm transition-all",
                    "border-neutral-200 bg-white hover:border-neutral-300",
                    "peer-data-[state=checked]:border-[#8A6B37] peer-data-[state=checked]:bg-[#8A6B37]/10",
                    showError && "border-rose-300"
                  )}
                >
                  {option.label}
                  {option.price_adjustment > 0 && (
                    <span className="ml-2 text-xs text-emerald-600">
                      +{formatPrice(option.price_adjustment)}
                    </span>
                  )}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {helpText}
          {errorMessage}
        </div>
      )}

      {step.type === "image_select" && (
        <div>
          {label}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {step.options?.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                className={cn(
                  "relative overflow-hidden rounded-2xl border transition-all",
                  value === option.value
                    ? "border-[#8A6B37] ring-1 ring-[#8A6B37]/30"
                    : "border-neutral-200 hover:border-neutral-300",
                  showError && "border-rose-300"
                )}
              >
                <div
                  className={cn(
                    imageAspectRatioClass,
                    "bg-neutral-50",
                    imageWrapperClass
                  )}
                >
                  {option.image_url ? (
                    <img
                      src={option.image_url}
                      alt={option.label}
                      className={cn(
                        "h-full w-full object-center",
                        imageFitModeClass
                      )}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
                      Görsel Yok
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-3 text-left">
                  <p className="text-sm font-medium text-neutral-900">{option.label}</p>
                  {option.price_adjustment > 0 && (
                    <p className="text-xs text-emerald-600">
                      +{formatPrice(option.price_adjustment)}
                    </p>
                  )}
                </div>
                {value === option.value && (
                  <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#8A6B37]">
                    <Check className="h-4 w-4 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
          {helpText}
          {errorMessage}
        </div>
      )}

      {step.type === "text" && (
        <div>
          {label}
          <Input
            type="text"
            value={String(value || "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={step.placeholder}
            maxLength={step.validation_rules?.max_length}
            className={cn(
              "rounded-2xl border-neutral-200 bg-white",
              showError && "border-rose-400"
            )}
          />
          {step.validation_rules?.max_length && (
            <p className="mt-1 text-right text-xs text-neutral-400">
              {String(value || "").length}/{step.validation_rules.max_length}
            </p>
          )}
          {helpText}
          {errorMessage}
        </div>
      )}

      {step.type === "textarea" && (
        <div>
          {label}
          <Textarea
            value={String(value || "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={step.placeholder}
            rows={4}
            maxLength={step.validation_rules?.max_length}
            className={cn(
              "min-h-[120px] rounded-2xl border-neutral-200 bg-white",
              showError && "border-rose-400"
            )}
          />
          {step.validation_rules?.max_length && (
            <p className="mt-1 text-right text-xs text-neutral-400">
              {String(value || "").length}/{step.validation_rules.max_length}
            </p>
          )}
          {helpText}
          {errorMessage}
        </div>
      )}

      {step.type === "checkbox" && (
        <div className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3">
          <Checkbox
            id={step.key}
            checked={Boolean(value)}
            onCheckedChange={onChange}
            className={cn(showError && "border-rose-400")}
          />
          <div className="flex-1">
            <Label htmlFor={step.key} className="cursor-pointer text-sm text-neutral-900">
              {step.label}
              {step.is_required && <span className="ml-1 text-rose-600">*</span>}
            </Label>
            {helpText}
            {errorMessage}
          </div>
        </div>
      )}

      {step.type === "number" && (
        <div>
          {label}
          <Input
            type="number"
            value={String(value || "")}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            placeholder={step.placeholder}
            min={step.validation_rules?.min_value}
            max={step.validation_rules?.max_value}
            className={cn(
              "rounded-2xl border-neutral-200 bg-white",
              showError && "border-rose-400"
            )}
          />
          {helpText}
          {errorMessage}
        </div>
      )}
    </div>
  );
}
