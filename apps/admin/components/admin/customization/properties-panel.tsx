"use client";

// =====================================================
// PROPERTIES PANEL - Right sidebar for editing step properties
// =====================================================

import { useState, useEffect } from "react";
import {
  CustomizationStep,
  CustomizationOption,
  CustomizationStepType,
  GridWidth,
} from "@/types/product-customization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Trash2,
  Plus,
  GripVertical,
  DollarSign,
  Eye,
  AlertCircle,
  ImageIcon,
  Type,
  Hash,
  Settings,
} from "lucide-react";
import { ConditionalLogicEditor } from "./conditional-logic-editor";
import { PriceConfigEditor } from "./price-config-editor";
import { cn } from "@/lib/utils";

interface PropertiesPanelProps {
  step: CustomizationStep | undefined;
  allSteps: CustomizationStep[];
  onChange: (step: CustomizationStep) => void;
  onDelete: (id: string) => void;
}

export function PropertiesPanel({
  step,
  allSteps,
  onChange,
  onDelete,
}: PropertiesPanelProps) {
  if (!step) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Settings className="w-12 h-12 text-gray-300 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Özellikleri Düzenle
        </h3>
        <p className="text-sm text-gray-500">
          Düzenlemek için bir form alanı seçin
        </p>
      </div>
    );
  }

  const otherSteps = allSteps.filter((s) => s.id !== step.id);
  const typesWithOptions: CustomizationStepType[] = [
    "select",
    "radio_group",
    "image_select",
    "multi_select",
  ];
  const hasOptions = typesWithOptions.includes(step.type);

  // Update field
  const updateField = <K extends keyof CustomizationStep>(
    field: K,
    value: CustomizationStep[K]
  ) => {
    onChange({ ...step, [field]: value });
  };

  // Update nested field
  const updateValidationRule = (key: string, value: unknown) => {
    onChange({
      ...step,
      validation_rules: {
        ...step.validation_rules,
        [key]: value,
      },
    });
  };

  // Add option
  const addOption = () => {
    const newOption: CustomizationOption = {
      id: `temp-${Date.now()}`,
      step_id: step.id,
      label: `Seçenek ${(step.options?.length || 0) + 1}`,
      value: `secenek_${(step.options?.length || 0) + 1}`,
      price_adjustment: 0,
      price_adjustment_type: "fixed",
      track_stock: false,
      sort_order: step.options?.length || 0,
      is_default: false,
      is_disabled: false,
    };
    onChange({
      ...step,
      options: [...(step.options || []), newOption],
    });
  };

  // Update option
  const updateOption = (index: number, updates: Partial<CustomizationOption>) => {
    const newOptions = [...(step.options || [])];
    newOptions[index] = { ...newOptions[index], ...updates };
    onChange({ ...step, options: newOptions });
  };

  // Delete option
  const deleteOption = (index: number) => {
    const newOptions = step.options?.filter((_, i) => i !== index) || [];
    onChange({ ...step, options: newOptions });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Özellikler</h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700"
            onClick={() => onDelete(step.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              value="general"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent"
            >
              Genel
            </TabsTrigger>
            {hasOptions && (
              <TabsTrigger
                value="options"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent"
              >
                Seçenekler
              </TabsTrigger>
            )}
            <TabsTrigger
              value="validation"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent"
            >
              Doğrulama
            </TabsTrigger>
            <TabsTrigger
              value="advanced"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent"
            >
              Gelişmiş
            </TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="p-4 space-y-6 mt-0">
            {/* Label */}
            <div className="space-y-2">
              <Label htmlFor="label">
                Etiket <span className="text-red-500">*</span>
              </Label>
              <Input
                id="label"
                value={step.label}
                onChange={(e) => updateField("label", e.target.value)}
                placeholder="Telefon Modeli"
              />
            </div>

            {/* Key */}
            <div className="space-y-2">
              <Label htmlFor="key">
                Key <span className="text-red-500">*</span>
              </Label>
              <Input
                id="key"
                value={step.key}
                onChange={(e) =>
                  updateField(
                    "key",
                    e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")
                  )
                }
                placeholder="telefon_modeli"
              />
              <p className="text-xs text-gray-500">
                Sadece küçük harf, rakam ve alt çizgi
              </p>
            </div>

            {/* Placeholder */}
            {(step.type === "text" ||
              step.type === "textarea" ||
              step.type === "select") && (
              <div className="space-y-2">
                <Label htmlFor="placeholder">Placeholder</Label>
                <Input
                  id="placeholder"
                  value={step.placeholder || ""}
                  onChange={(e) => updateField("placeholder", e.target.value)}
                  placeholder="--Lütfen Seçiniz--"
                />
              </div>
            )}

            {/* Help Text */}
            <div className="space-y-2">
              <Label htmlFor="helpText">Yardım Metni</Label>
              <Textarea
                id="helpText"
                value={step.help_text || ""}
                onChange={(e) => updateField("help_text", e.target.value)}
                placeholder="Bu alan hakkında ek bilgi..."
                rows={2}
              />
            </div>

            {/* Required */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Zorunlu Alan</Label>
                <p className="text-sm text-gray-500">
                  Bu alan doldurulmadan gönderilemez
                </p>
              </div>
              <Switch
                checked={step.is_required}
                onCheckedChange={(checked) =>
                  updateField("is_required", checked)
                }
              />
            </div>

            {/* Grid Width */}
            <div className="space-y-2">
              <Label>Genişlik</Label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: "full", label: "Tam" },
                  { value: "half", label: "Yarım" },
                  { value: "third", label: "1/3" },
                  { value: "quarter", label: "1/4" },
                ].map((width) => (
                  <Button
                    key={width.value}
                    type="button"
                    variant={step.grid_width === width.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateField("grid_width", width.value as GridWidth)}
                    className={step.grid_width === width.value ? "bg-amber-600" : ""}
                  >
                    {width.label}
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Options Tab */}
          {hasOptions && (
            <TabsContent value="options" className="p-4 space-y-4 mt-0">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Seçenekler</h3>
                <Button size="sm" onClick={addOption}>
                  <Plus className="w-4 h-4 mr-1" />
                  Ekle
                </Button>
              </div>

              <div className="space-y-3">
                {step.options?.map((option, index) => (
                  <Card key={option.id || index} className="p-3">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-gray-400" />
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <Input
                            placeholder="Etiket"
                            value={option.label}
                            onChange={(e) =>
                              updateOption(index, { label: e.target.value })
                            }
                            className="h-8"
                          />
                          <Input
                            placeholder="Değer"
                            value={option.value}
                            onChange={(e) =>
                              updateOption(index, {
                                value: e.target.value
                                  .toLowerCase()
                                  .replace(/[^a-z0-9_]/g, ""),
                              })
                            }
                            className="h-8"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600"
                          onClick={() => deleteOption(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Image URL for image_select */}
                      {step.type === "image_select" && (
                        <div className="flex items-center gap-2">
                          <ImageIcon className="w-4 h-4 text-gray-400" />
                          <Input
                            placeholder="Görsel URL"
                            value={option.image_url || ""}
                            onChange={(e) =>
                              updateOption(index, { image_url: e.target.value })
                            }
                            className="h-8 flex-1"
                          />
                        </div>
                      )}

                      {/* Price Adjustment */}
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-gray-400" />
                        <Input
                          type="number"
                          placeholder="Fiyat farkı"
                          value={option.price_adjustment || 0}
                          onChange={(e) =>
                            updateOption(index, {
                              price_adjustment: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="h-8 w-24"
                        />
                        <select
                          value={option.price_adjustment_type}
                          onChange={(e) =>
                            updateOption(index, {
                              price_adjustment_type: e.target.value as any,
                            })
                          }
                          className="h-8 text-sm border rounded"
                        >
                          <option value="fixed">Sabit (₺)</option>
                          <option value="percentage">Yüzde (%)</option>
                        </select>
                        <div className="flex-1" />
                        <Switch
                          checked={option.is_default}
                          onCheckedChange={(checked) =>
                            updateOption(index, { is_default: checked })
                          }
                        />
                        <span className="text-xs text-gray-500">Varsayılan</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>
          )}

          {/* Validation Tab */}
          <TabsContent value="validation" className="p-4 space-y-6 mt-0">
            {(step.type === "text" || step.type === "textarea") && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="minLength">Minimum Karakter</Label>
                  <Input
                    id="minLength"
                    type="number"
                    min={0}
                    value={step.validation_rules?.min_length || ""}
                    onChange={(e) =>
                      updateValidationRule(
                        "min_length",
                        e.target.value ? parseInt(e.target.value) : undefined
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxLength">Maksimum Karakter</Label>
                  <Input
                    id="maxLength"
                    type="number"
                    min={0}
                    value={step.validation_rules?.max_length || ""}
                    onChange={(e) =>
                      updateValidationRule(
                        "max_length",
                        e.target.value ? parseInt(e.target.value) : undefined
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pattern">Regex Pattern</Label>
                  <Input
                    id="pattern"
                    value={step.validation_rules?.pattern || ""}
                    onChange={(e) =>
                      updateValidationRule(
                        "pattern",
                        e.target.value || undefined
                      )
                    }
                    placeholder="^[a-zA-Z0-9]+$"
                  />
                  <p className="text-xs text-gray-500">
                    Özel format doğrulama için regex pattern
                  </p>
                </div>
              </>
            )}

            {step.type === "number" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="minValue">Minimum Değer</Label>
                  <Input
                    id="minValue"
                    type="number"
                    value={step.validation_rules?.min_value || ""}
                    onChange={(e) =>
                      updateValidationRule(
                        "min_value",
                        e.target.value ? parseFloat(e.target.value) : undefined
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxValue">Maksimum Değer</Label>
                  <Input
                    id="maxValue"
                    type="number"
                    value={step.validation_rules?.max_value || ""}
                    onChange={(e) =>
                      updateValidationRule(
                        "max_value",
                        e.target.value ? parseFloat(e.target.value) : undefined
                      )
                    }
                  />
                </div>
              </>
            )}

            {step.type === "multi_select" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="minSelections">Minimum Seçim</Label>
                  <Input
                    id="minSelections"
                    type="number"
                    min={0}
                    value={step.validation_rules?.min_selections || ""}
                    onChange={(e) =>
                      updateValidationRule(
                        "min_selections",
                        e.target.value ? parseInt(e.target.value) : undefined
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxSelections">Maksimum Seçim</Label>
                  <Input
                    id="maxSelections"
                    type="number"
                    min={0}
                    value={step.validation_rules?.max_selections || ""}
                    onChange={(e) =>
                      updateValidationRule(
                        "max_selections",
                        e.target.value ? parseInt(e.target.value) : undefined
                      )
                    }
                  />
                </div>
              </>
            )}

            {step.type === "file_upload" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="maxFileSize">Maksimum Dosya Boyutu (MB)</Label>
                  <Input
                    id="maxFileSize"
                    type="number"
                    min={1}
                    value={
                      step.validation_rules?.max_file_size
                        ? Math.round(
                            step.validation_rules.max_file_size / 1024 / 1024
                          )
                        : ""
                    }
                    onChange={(e) =>
                      updateValidationRule(
                        "max_file_size",
                        e.target.value
                          ? parseInt(e.target.value) * 1024 * 1024
                          : undefined
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>İzin Verilen Formatalar</Label>
                  <div className="flex flex-wrap gap-2">
                    {["image/jpeg", "image/png", "image/gif", "application/pdf"].map(
                      (type) => (
                        <Badge
                          key={type}
                          variant={
                            step.validation_rules?.allowed_file_types?.includes(type)
                              ? "default"
                              : "outline"
                          }
                          className="cursor-pointer"
                          onClick={() => {
                            const current =
                              step.validation_rules?.allowed_file_types || [];
                            const updated = current.includes(type)
                              ? current.filter((t) => t !== type)
                              : [...current, type];
                            updateValidationRule("allowed_file_types", updated);
                          }}
                        >
                          {type.split("/")[1].toUpperCase()}
                        </Badge>
                      )
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Custom Error Message */}
            <div className="space-y-2 pt-4 border-t border-gray-100">
              <Label htmlFor="errorMessage">Özel Hata Mesajı</Label>
              <Input
                id="errorMessage"
                value={step.validation_rules?.custom_error_message || ""}
                onChange={(e) =>
                  updateValidationRule(
                    "custom_error_message",
                    e.target.value || undefined
                  )
                }
                placeholder="Lütfen geçerli bir değer giriniz"
              />
            </div>
          </TabsContent>

          {/* Advanced Tab */}
          <TabsContent value="advanced" className="p-4 space-y-6 mt-0">
            {/* Conditional Logic */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-gray-500" />
                <h3 className="font-medium">Koşullu Görünürlük</h3>
              </div>
              <p className="text-sm text-gray-500">
                Bu alanın hangi koşullara göre gösterileceğini belirleyin
              </p>
              <ConditionalLogicEditor
                value={step.show_conditions}
                onChange={(conditions) =>
                  updateField("show_conditions", conditions)
                }
                availableSteps={otherSteps}
                currentStepId={step.id}
              />
            </div>

            {/* Price Configuration */}
            {step.type === "text" || step.type === "textarea" ? (
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-gray-500" />
                  <h3 className="font-medium">Karakter Başına Fiyat</h3>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pricePerChar">
                    Her Karakter için Fiyat (₺)
                  </Label>
                  <Input
                    id="pricePerChar"
                    type="number"
                    min={0}
                    step={0.01}
                    value={step.price_config?.price_per_character || ""}
                    onChange={(e) =>
                      updateField("price_config", {
                        ...step.price_config,
                        price_per_character: e.target.value
                          ? parseFloat(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="0.00"
                  />
                  <p className="text-sm text-gray-500">
                    Örn: 5₺ girerseniz, &quot;Ahmet&quot; (5 harf) = +25₺
                  </p>
                </div>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </ScrollArea>
    </div>
  );
}
