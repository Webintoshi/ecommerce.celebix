"use client";

import Image from "next/image";
import { useState, useEffect, useCallback, useMemo, type CSSProperties } from "react";
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
import { Check, Info } from "lucide-react";
import { resolveStorefrontAssetUrl, resolveStorefrontDirectAssetUrl } from "@/lib/asset-url";
import { cn } from "@/lib/utils";

const CUSTOMIZATION_LABEL_CLASS =
  "text-sm font-semibold leading-snug tracking-normal text-[#12100D]";
const CUSTOMIZATION_CONTROL_CLASS =
  "border-[#E8DFD3] bg-white text-[#12100D] shadow-none";
const CUSTOMIZATION_SELECT_TRIGGER_CLASS = cn(
  "h-11 w-full rounded-md px-3 text-sm",
  CUSTOMIZATION_CONTROL_CLASS,
  "focus:ring-1 focus:ring-[#C4A062]/35 focus:ring-offset-0",
);
const CUSTOMIZATION_INPUT_CLASS = cn(
  "h-11 rounded-md text-sm",
  CUSTOMIZATION_CONTROL_CLASS,
  "focus-visible:ring-1 focus-visible:ring-[#C4A062]/35 focus-visible:ring-offset-0",
);

function formatDisplayLabel(label: string) {
  const trimmed = label.trim();
  if (!trimmed) {
    return trimmed;
  }

  const lettersOnly = trimmed.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, "");
  if (
    lettersOnly.length >= 4 &&
    lettersOnly === lettersOnly.toLocaleUpperCase("tr-TR")
  ) {
    return trimmed
      .toLocaleLowerCase("tr-TR")
      .replace(/(^|[\s/])([a-zçğıöşü])/g, (_match, prefix: string, char: string) =>
        prefix + char.toLocaleUpperCase("tr-TR"),
      );
  }

  return trimmed;
}

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

function OptionImage({
  source,
  alt,
  className,
}: {
  source?: string | null;
  alt: string;
  className: string;
}) {
  const proxiedSource = resolveStorefrontAssetUrl(source);
  const directSource = resolveStorefrontDirectAssetUrl(source);
  const [currentSource, setCurrentSource] = useState(proxiedSource || directSource || "");
  const [usedFallback, setUsedFallback] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrentSource(proxiedSource || directSource || "");
    setUsedFallback(false);
    setFailed(false);
  }, [directSource, proxiedSource]);

  const handleError = () => {
    if (!usedFallback && directSource && directSource !== currentSource) {
      setCurrentSource(directSource);
      setUsedFallback(true);
      return;
    }

    setFailed(true);
  };

  if (failed || !currentSource) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
        -
      </div>
    );
  }

  return (
    <Image
      src={currentSource}
      alt={alt}
      fill
      sizes="(max-width: 768px) 88px, 140px"
      className={className}
      onError={handleError}
    />
  );
}

function buildDefaultValues(steps: CustomizationStep[]) {
  const defaultValues: Record<string, unknown> = {};

  for (const step of steps) {
    if (step.default_value !== undefined) {
      defaultValues[step.key] = step.default_value;
      continue;
    }

    const options = Array.isArray(step.options)
      ? [...step.options].sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0))
      : [];
    const defaultOptions = options.filter((option) => option.is_default && !option.is_disabled);

    if (step.type === "multi_select") {
      defaultValues[step.key] = defaultOptions.map((option) => option.value);
    } else if (["select", "radio_group", "image_select"].includes(step.type)) {
      if (defaultOptions[0]?.value !== undefined) {
        defaultValues[step.key] = defaultOptions[0].value;
      }
    } else if (step.type === "checkbox") {
      defaultValues[step.key] = false;
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
      <div className={cn("space-y-5", className)}>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton className="h-11 w-full rounded-md" />
      </div>
    );
  }

  if (!schema || visibleSteps.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-6", className)}>
      {schema.description && (
        <p className="text-sm leading-relaxed text-[#6B5F54]">
          {schema.description}
        </p>
      )}

      <div className="flex flex-col gap-6">
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
        <div className="flex items-center justify-between rounded-md border border-[#E8DFD3] bg-[#FAF7F2] px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-[#12100D]">Kişiselleştirme ücreti</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[#6B5F54]">
              Seçimler ürün fiyatına eklenir.
            </p>
          </div>
          <span className="text-sm font-semibold text-[#9A7234]">
            +{formatPrice(priceBreakdown.total_adjustment)}
          </span>
        </div>
      )}

      {validationNonce > 0 && !allStepsValid && (
        <p className="text-sm text-rose-600">
          Bu ürünü sepete eklemeden önce zorunlu kişiselleştirme alanlarını tamamlayın.
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
  const displayLabel = formatDisplayLabel(step.label);
  const optionCount = step.options?.length ?? 0;
  const useSegmentedRadio = step.type === "radio_group" && optionCount > 0 && optionCount <= 3;

  const label = (
    <div className="mb-2.5 flex items-start gap-2">
      <Label className={cn(CUSTOMIZATION_LABEL_CLASS, showError && "text-rose-600")}>
        {displayLabel}
        {step.is_required ? <span className="text-[#C4A062]"> *</span> : null}
      </Label>
      {step.help_text ? (
        <span
          className="mt-0.5 inline-flex text-[#9A7234]"
          title={step.help_text}
          aria-label={step.help_text}
        >
          <Info className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
      ) : null}
    </div>
  );

  const helpText =
    step.help_text && step.help_text.length > 80 ? (
      <p className="mt-2 text-xs leading-relaxed text-[#6B5F54]">{step.help_text}</p>
    ) : null;

  const errorMessage = showError && !isValid && (
    <p className="mt-1 text-xs text-rose-600">Bu alan zorunludur</p>
  );

  const imageAspectRatioClass =
    IMAGE_ASPECT_RATIO_CLASS[step.style_config?.image_aspect_ratio || "1:1"];
  const imageFitMode = step.style_config?.image_fit_mode || "contain";
  const imageFitModeClass =
    imageFitMode === "cover" ? "object-cover" : "object-contain";
  const imageWrapperClass = imageFitMode === "cover" ? "" : "p-3.5";
  const imageSelectColumnCount = Math.min(Math.max(step.options?.length || 1, 1), 4);
  const imageSelectMinWidth =
    imageSelectColumnCount >= 4
      ? 72
      : imageSelectColumnCount === 3
        ? 88
        : imageSelectColumnCount === 2
          ? 108
          : 140;
  const mobileImageSelectGridStyle = {
    "--mobile-image-select-columns": `repeat(${imageSelectColumnCount}, minmax(56px, 72px))`,
    "--image-select-columns": `repeat(${imageSelectColumnCount}, minmax(${imageSelectMinWidth}px, 1fr))`,
  } as CSSProperties;
  const hasSelectedValue =
    value !== undefined &&
    value !== null &&
    value !== "" &&
    (!Array.isArray(value) || value.length > 0);

  return (
    <div className="w-full">
      {step.type === "select" && (
        <div>
          {label}
          <Select value={String(value || "")} onValueChange={onChange}>
            <SelectTrigger
              className={cn(
                CUSTOMIZATION_SELECT_TRIGGER_CLASS,
                hasSelectedValue && "border-[#C4A062]/70 bg-[#FAF7F2]",
                showError && "border-rose-400",
              )}
            >
              <SelectValue placeholder={step.placeholder || "Bir seçenek seçin"} />
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
            className={cn(
              useSegmentedRadio
                ? "grid gap-2"
                : "flex flex-col gap-2",
              useSegmentedRadio &&
                (optionCount === 2
                  ? "grid-cols-2"
                  : optionCount === 3
                    ? "grid-cols-3"
                    : "grid-cols-1"),
            )}
          >
            {step.options?.map((option) => (
              <div key={option.value} className={useSegmentedRadio ? "min-w-0" : "w-full"}>
                <RadioGroupItem
                  value={option.value}
                  id={`${step.key}-${option.value}`}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={`${step.key}-${option.value}`}
                  className={cn(
                    "flex min-h-11 w-full cursor-pointer items-center justify-center border px-3 py-2.5 text-center text-sm font-medium leading-snug transition-colors",
                    CUSTOMIZATION_CONTROL_CLASS,
                    "hover:border-[#C4A062]",
                    "peer-data-[state=checked]:border-[#8A6B37] peer-data-[state=checked]:bg-[#FAF7F2] peer-data-[state=checked]:text-[#12100D]",
                    showError && "border-rose-300",
                  )}
                >
                  <span>{formatDisplayLabel(option.label)}</span>
                  {option.price_adjustment > 0 && (
                    <span className="ml-1.5 text-xs font-normal text-[#9A7234]">
                      (+{formatPrice(option.price_adjustment)})
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
        <div className="w-full">
          {label}
          <div
            className={cn(
              "grid justify-start gap-2 [grid-template-columns:var(--mobile-image-select-columns)] sm:gap-3 md:[grid-template-columns:var(--image-select-columns)]",
            )}
            style={mobileImageSelectGridStyle}
          >
            {step.options?.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                className={cn(
                  "relative h-full w-full min-w-0 overflow-hidden rounded-md border bg-white transition-colors",
                  value === option.value
                    ? "border-[#8A6B37] bg-[#FAF7F2]"
                    : "border-[#E8DFD3] hover:border-[#C4A062]",
                  showError && "border-rose-300",
                )}
              >
                <div
                  className={cn(
                    "relative aspect-square bg-neutral-50",
                    imageWrapperClass === "p-3.5" ? "p-1 md:p-2" : "p-1"
                  )}
                >
                  {option.image_url ? (
                    <OptionImage
                      source={option.image_url}
                      alt={option.label}
                      className={cn(
                        "object-center",
                        imageFitModeClass
                      )}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
                      -
                    </div>
                  )}
                </div>
                <div className="border-t border-[#E8DFD3] px-2 py-2 text-center sm:px-3 sm:py-2.5">
                  <p
                    className={cn(
                      "break-words text-[11px] font-medium leading-snug text-[#12100D] sm:text-xs",
                      value === option.value && "font-semibold text-[#8A6B37]",
                    )}
                  >
                    {formatDisplayLabel(option.label)}
                  </p>
                  {option.price_adjustment > 0 && (
                    <p className="mt-0.5 text-[10px] text-[#9A7234] sm:text-[11px]">
                      +{formatPrice(option.price_adjustment)}
                    </p>
                  )}
                </div>
                {value === option.value ? (
                  <div className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-sm bg-[#8A6B37]">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </div>
                ) : null}
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
            className={cn(CUSTOMIZATION_INPUT_CLASS, showError && "border-rose-400")}
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
              "min-h-[120px] rounded-md text-sm",
              CUSTOMIZATION_CONTROL_CLASS,
              "focus-visible:ring-1 focus-visible:ring-[#C4A062]/35 focus-visible:ring-offset-0",
              showError && "border-rose-400",
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
        <div
          className={cn(
            "flex items-start gap-3 rounded-md border px-4 py-3 transition-colors",
            CUSTOMIZATION_CONTROL_CLASS,
            Boolean(value) && "border-[#8A6B37]/50 bg-[#FAF7F2]",
          )}
        >
          <Checkbox
            id={step.key}
            checked={Boolean(value)}
            onCheckedChange={onChange}
            className={cn(showError && "border-rose-400")}
          />
          <div className="flex-1">
            <Label htmlFor={step.key} className="cursor-pointer text-sm text-[#12100D]">
              {formatDisplayLabel(step.label)}
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
            className={cn(CUSTOMIZATION_INPUT_CLASS, showError && "border-rose-400")}
          />
          {helpText}
          {errorMessage}
        </div>
      )}
    </div>
  );
}
