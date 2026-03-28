"use client";

// =====================================================
// DYNAMIC PRODUCT CUSTOMIZATION FORM
// Customer-facing form for product customization
// =====================================================

import { useState, useEffect, useCallback } from "react";
import {
  CustomizationSchema,
  CustomizationStep,
  PriceBreakdown,
  CartCustomizationPayload,
} from "@/types/product-customization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
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
import { Check, ShoppingCart, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DynamicCustomizationFormProps {
  schemaId: string;
  productId: string;
  variantId: string;
  basePrice: number;
  onAddToCart: (customization: CartCustomizationPayload) => void;
  className?: string;
}

export function DynamicCustomizationForm({
  schemaId,
  productId,
  variantId,
  basePrice,
  onAddToCart,
  className,
}: DynamicCustomizationFormProps) {
  const [schema, setSchema] = useState<(CustomizationSchema & { steps: CustomizationStep[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [addingToCart, setAddingToCart] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Load schema
  useEffect(() => {
    async function loadSchema() {
      try {
        // Fetch schema
        const { data: schemaData, error: schemaError } = await supabase
          .from("product_customization_schemas")
          .select("*")
          .eq("id", schemaId)
          .single();

        if (schemaError) throw schemaError;

        // Fetch steps
        const { data: steps, error: stepsError } = await supabase
          .from("product_customization_steps")
          .select("*")
          .eq("schema_id", schemaId)
          .order("sort_order", { ascending: true });

        if (stepsError) throw stepsError;

        // Fetch options for each step
        const stepsWithOptions = await Promise.all(
          (steps || []).map(async (step) => {
            const { data: options } = await supabase
              .from("product_customization_options")
              .select("*")
              .eq("step_id", step.id)
              .order("sort_order", { ascending: true });

            return { ...step, options: options || [] };
          })
        );

        setSchema({ ...schemaData, steps: stepsWithOptions });

        // Set default values
        const defaultValues: Record<string, unknown> = {};
        for (const step of stepsWithOptions) {
          if (step.default_value !== undefined) {
            defaultValues[step.key] = step.default_value;
          } else if (step.type === "checkbox") {
            defaultValues[step.key] = false;
          } else if (step.type === "multi_select") {
            defaultValues[step.key] = [];
          }
        }
        setValues(defaultValues);
      } catch (error) {
        console.error("Error loading schema:", error);
        toast.error("Kişiselleştirme şeması yüklenirken bir hata oluştu");
      } finally {
        setLoading(false);
      }
    }

    loadSchema();
  }, [schemaId]);

  // Calculate price when values change
  useEffect(() => {
    if (!schema) return;

    const visibleSteps = schema.steps.filter((step) => {
      if (!step.show_conditions) return true;
      return evaluateConditions(step.show_conditions, values, schema.steps);
    });

    const breakdown = calculatePrice(basePrice, visibleSteps, values);
    setPriceBreakdown(breakdown);
  }, [values, schema, basePrice]);

  const handleValueChange = useCallback((stepKey: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [stepKey]: value }));
    setTouched((prev) => ({ ...prev, [stepKey]: true }));
  }, []);

  const visibleSteps = schema?.steps.filter((step) => {
    if (!step.show_conditions) return true;
    return evaluateConditions(step.show_conditions, values, schema.steps);
  }) || [];

  const isStepValid = (step: CustomizationStep): boolean => {
    if (!step.is_required) return true;
    const value = values[step.key];
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  };

  const allStepsValid = visibleSteps.every(isStepValid);

  const handleSubmit = async () => {
    if (!allStepsValid || !priceBreakdown) return;

    setAddingToCart(true);
    try {
      const selections = visibleSteps
        .filter((step) => {
          const value = values[step.key];
          if (value === undefined || value === null || value === "") return false;
          if (Array.isArray(value) && value.length === 0) return false;
          return true;
        })
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

      const payload: CartCustomizationPayload = {
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
      };

      await onAddToCart(payload);
      toast.success(schema?.settings?.success_message || "Ürün sepete eklendi");
    } catch (error) {
      console.error("Error adding to cart:", error);
      toast.error("Sepete eklenirken bir hata oluştu");
    } finally {
      setAddingToCart(false);
    }
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!schema) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">{schema.name}</CardTitle>
        {schema.description && (
          <p className="text-sm text-gray-600">{schema.description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Form Fields */}
        {visibleSteps.map((step) => (
          <FormField
            key={step.id}
            step={step}
            value={values[step.key]}
            onChange={(value) => handleValueChange(step.key, value)}
            isValid={isStepValid(step)}
            showError={touched[step.key] && !isStepValid(step)}
          />
        ))}

        {/* Price Summary */}
        {(schema.settings?.show_summary !== false ||
          schema.settings?.show_price_breakdown !== false) &&
          priceBreakdown && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              {schema.settings?.show_summary !== false && (
                <>
                  <h4 className="font-medium text-sm text-gray-900">
                    Seçimleriniz
                  </h4>
                  <div className="space-y-1">
                    {visibleSteps.map((step) => {
                      const value = values[step.key];
                      if (
                        value === undefined ||
                        value === null ||
                        value === ""
                      )
                        return null;

                      let displayValue = String(value);
                      if (step.options) {
                        const option = step.options.find(
                          (o) => o.value === value
                        );
                        if (option) displayValue = option.label;
                      }

                      return (
                        <div
                          key={step.id}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-gray-600">{step.label}</span>
                          <span className="font-medium text-gray-900">
                            {displayValue}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <Separator />
                </>
              )}

              {schema.settings?.show_price_breakdown !== false && (
                <>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Temel Fiyat</span>
                      <span>{formatPrice(basePrice)}</span>
                    </div>
                    {priceBreakdown.adjustments.map((adj, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-gray-600">
                          {adj.step_label}
                          {adj.option_label && ` (${adj.option_label})`}
                        </span>
                        <span className="text-green-600">
                          +{formatPrice(adj.adjustment_amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-900">Toplam</span>
                    <span className="font-bold text-xl text-amber-600">
                      {formatPrice(priceBreakdown.final_price)}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={!allStepsValid || addingToCart}
          className="w-full bg-amber-600 hover:bg-amber-700"
          size="lg"
        >
          {addingToCart ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Ekleniyor...
            </>
          ) : (
            <>
              <ShoppingCart className="w-4 h-4 mr-2" />
              {schema.settings?.submit_button_text || "Sepete Ekle"}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// Form Field Component
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
    <div className="flex items-center gap-1 mb-2">
      <Label className={cn(showError && "text-red-500")}>{step.label}</Label>
      {step.is_required && <span className="text-red-500">*</span>}
    </div>
  );

  const helpText = step.help_text && (
    <p className="text-xs text-gray-500 mt-1">{step.help_text}</p>
  );

  const errorMessage = showError && (
    <p className="text-xs text-red-500 mt-1">Bu alan gereklidir</p>
  );

  const gridClass = {
    full: "w-full",
    half: "w-full md:w-1/2",
    third: "w-full md:w-1/3",
    quarter: "w-full md:w-1/4",
  }[step.grid_width || "full"];

  return (
    <div className={gridClass}>
      {step.type === "select" && (
        <div>
          {label}
          <Select value={String(value || "")} onValueChange={onChange}>
            <SelectTrigger className={cn(showError && "border-red-500")}>
              <SelectValue placeholder={step.placeholder || "Seçiniz"} />
            </SelectTrigger>
            <SelectContent>
              {step.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-center justify-between w-full">
                    <span>{option.label}</span>
                    {option.price_adjustment > 0 && (
                      <span className="text-green-600 text-xs ml-2">
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
                    "flex items-center justify-center px-4 py-2 border-2 rounded-lg cursor-pointer transition-all",
                    "peer-data-[state=checked]:border-amber-500 peer-data-[state=checked]:bg-amber-50",
                    "hover:border-gray-300",
                    showError && "border-red-300"
                  )}
                >
                  {option.label}
                  {option.price_adjustment > 0 && (
                    <span className="text-green-600 text-xs ml-2">
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
          <div className="grid grid-cols-3 gap-3">
            {step.options?.map((option) => (
              <button
                key={option.value}
                onClick={() => onChange(option.value)}
                className={cn(
                  "relative border-2 rounded-lg overflow-hidden transition-all",
                  value === option.value
                    ? "border-amber-500 ring-2 ring-amber-200"
                    : "border-gray-200 hover:border-gray-300",
                  showError && "border-red-300"
                )}
              >
                <div className="aspect-square bg-gray-100">
                  {option.image_url ? (
                    <img
                      src={option.image_url}
                      alt={option.label}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                      Görsel Yok
                    </div>
                  )}
                </div>
                <div className="p-2 text-center">
                  <p className="text-sm font-medium">{option.label}</p>
                  {option.price_adjustment > 0 && (
                    <p className="text-xs text-green-600">
                      +{formatPrice(option.price_adjustment)}
                    </p>
                  )}
                </div>
                {value === option.value && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
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
            className={cn(showError && "border-red-500")}
          />
          {step.validation_rules?.max_length && (
            <p className="text-xs text-gray-400 mt-1 text-right">
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
            className={cn(showError && "border-red-500")}
          />
          {step.validation_rules?.max_length && (
            <p className="text-xs text-gray-400 mt-1 text-right">
              {String(value || "").length}/{step.validation_rules.max_length}
            </p>
          )}
          {helpText}
          {errorMessage}
        </div>
      )}

      {step.type === "checkbox" && (
        <div className="flex items-start gap-2">
          <Checkbox
            id={step.key}
            checked={Boolean(value)}
            onCheckedChange={onChange}
            className={cn(showError && "border-red-500")}
          />
          <div className="flex-1">
            <Label htmlFor={step.key} className="cursor-pointer">
              {step.label}
              {step.is_required && (
                <span className="text-red-500 ml-1">*</span>
              )}
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
            className={cn(showError && "border-red-500")}
          />
          {helpText}
          {errorMessage}
        </div>
      )}
    </div>
  );
}
