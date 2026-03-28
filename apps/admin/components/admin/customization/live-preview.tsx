"use client";

// =====================================================
// LIVE PREVIEW - Real-time preview of the customization form
// =====================================================

import { useState, useMemo, useEffect } from "react";
import {
  CustomizationSchema,
  CustomizationStep,
  SelectionValue,
  PriceBreakdown,
} from "@/types/product-customization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { evaluateConditions } from "@/lib/customization/conditional-logic";
import { calculatePrice } from "@/lib/customization/price-calculator";
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
import { Check, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

interface LivePreviewProps {
  schema: CustomizationSchema & { steps: CustomizationStep[] };
  basePrice?: number;
}

export function LivePreview({ schema, basePrice = 299 }: LivePreviewProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);

  // Calculate which steps are visible and update price
  useEffect(() => {
    const visibleSteps = schema.steps.filter((step) => {
      if (!step.show_conditions) return true;
      return evaluateConditions(step.show_conditions, values, schema.steps);
    });

    const newPriceBreakdown = calculatePrice(
      basePrice,
      visibleSteps,
      values
    );
    setPriceBreakdown(newPriceBreakdown);
  }, [values, schema.steps, basePrice]);

  const handleValueChange = (stepKey: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [stepKey]: value }));
  };

  const visibleSteps = useMemo(() => {
    return schema.steps.filter((step) => {
      if (!step.show_conditions) return true;
      return evaluateConditions(step.show_conditions, values, schema.steps);
    });
  }, [schema.steps, values]);

  const isStepValid = (step: CustomizationStep): boolean => {
    if (!step.is_required) return true;
    const value = values[step.key];
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  };

  const allStepsValid = visibleSteps.every(isStepValid);

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{schema.name}</CardTitle>
              {schema.description && (
                <p className="text-sm text-gray-600">{schema.description}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {visibleSteps.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Henüz form alanı eklenmemiş
                </div>
              ) : (
                visibleSteps.map((step) => (
                  <FormField
                    key={step.id}
                    step={step}
                    value={values[step.key]}
                    onChange={(value) => handleValueChange(step.key, value)}
                    isValid={isStepValid(step)}
                  />
                ))
              )}

              <Button
                className="w-full bg-amber-600 hover:bg-amber-700"
                disabled={!allStepsValid || visibleSteps.length === 0}
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                {schema.settings?.submit_button_text || "Sepete Ekle"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        {(schema.settings?.show_summary !== false ||
          schema.settings?.show_price_breakdown !== false) && (
          <div>
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-lg">Sipariş Özeti</CardTitle>
              </CardHeader>
              <CardContent>
                {schema.settings?.show_summary !== false && (
                  <>
                    <div className="space-y-3">
                      {visibleSteps.map((step) => {
                        const value = values[step.key];
                        if (value === undefined || value === null || value === "")
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
                    <Separator className="my-4" />
                  </>
                )}

                {schema.settings?.show_price_breakdown !== false &&
                  priceBreakdown && (
                    <>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Temel Fiyat</span>
                          <span>₺{basePrice.toFixed(2)}</span>
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
                              +₺{adj.adjustment_amount.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <Separator className="my-4" />
                      <div className="flex justify-between">
                        <span className="font-semibold text-gray-900">Toplam</span>
                        <span className="font-bold text-xl text-amber-600">
                          ₺{priceBreakdown.final_price.toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// Form Field Component
function FormField({
  step,
  value,
  onChange,
  isValid,
}: {
  step: CustomizationStep;
  value: unknown;
  onChange: (value: unknown) => void;
  isValid: boolean;
}) {
  const hasError = !isValid && step.is_required;

  const label = (
    <div className="flex items-center gap-1 mb-2">
      <Label className={cn(hasError && "text-red-500")}>{step.label}</Label>
      {step.is_required && <span className="text-red-500">*</span>}
    </div>
  );

  const helpText = step.help_text && (
    <p className="text-xs text-gray-500 mt-1">{step.help_text}</p>
  );

  const errorMessage = hasError && (
    <p className="text-xs text-red-500 mt-1">Bu alan gereklidir</p>
  );

  switch (step.type) {
    case "select":
      return (
        <div>
          {label}
          <Select
            value={String(value || "")}
            onValueChange={onChange}
          >
            <SelectTrigger className={cn(hasError && "border-red-500")}>
              <SelectValue placeholder={step.placeholder || "Seçiniz"} />
            </SelectTrigger>
            <SelectContent>
              {step.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-center justify-between w-full">
                    <span>{option.label}</span>
                    {option.price_adjustment > 0 && (
                      <span className="text-green-600 text-xs ml-2">
                        +₺{option.price_adjustment}
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
      );

    case "radio_group":
      return (
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
                    hasError && "border-red-300"
                  )}
                >
                  {option.label}
                  {option.price_adjustment > 0 && (
                    <span className="text-green-600 text-xs ml-2">
                      +₺{option.price_adjustment}
                    </span>
                  )}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {helpText}
          {errorMessage}
        </div>
      );

    case "image_select":
      return (
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
                  hasError && "border-red-300"
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
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      Görsel Yok
                    </div>
                  )}
                </div>
                <div className="p-2 text-center">
                  <p className="text-sm font-medium">{option.label}</p>
                  {option.price_adjustment > 0 && (
                    <p className="text-xs text-green-600">
                      +₺{option.price_adjustment}
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
      );

    case "text":
      return (
        <div>
          {label}
          <Input
            type="text"
            value={String(value || "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={step.placeholder}
            maxLength={step.validation_rules?.max_length}
            className={cn(hasError && "border-red-500")}
          />
          {step.validation_rules?.max_length && (
            <p className="text-xs text-gray-400 mt-1 text-right">
              {String(value || "").length}/{step.validation_rules.max_length}
            </p>
          )}
          {helpText}
          {errorMessage}
        </div>
      );

    case "textarea":
      return (
        <div>
          {label}
          <Textarea
            value={String(value || "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={step.placeholder}
            rows={4}
            maxLength={step.validation_rules?.max_length}
            className={cn(hasError && "border-red-500")}
          />
          {step.validation_rules?.max_length && (
            <p className="text-xs text-gray-400 mt-1 text-right">
              {String(value || "").length}/{step.validation_rules.max_length}
            </p>
          )}
          {helpText}
          {errorMessage}
        </div>
      );

    case "checkbox":
      return (
        <div className="flex items-start gap-2">
          <Checkbox
            id={step.key}
            checked={Boolean(value)}
            onCheckedChange={onChange}
            className={cn(hasError && "border-red-500")}
          />
          <div className="flex-1">
            <Label htmlFor={step.key} className="cursor-pointer">
              {step.label}
              {step.is_required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {helpText}
            {errorMessage}
          </div>
        </div>
      );

    case "number":
      return (
        <div>
          {label}
          <Input
            type="number"
            value={String(value || "")}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            placeholder={step.placeholder}
            min={step.validation_rules?.min_value}
            max={step.validation_rules?.max_value}
            className={cn(hasError && "border-red-500")}
          />
          {helpText}
          {errorMessage}
        </div>
      );

    default:
      return (
        <div className="p-4 bg-gray-50 rounded-lg text-gray-500">
          <p className="text-sm">{step.type} tipi önizlemesi hazırlanıyor...</p>
        </div>
      );
  }
}
