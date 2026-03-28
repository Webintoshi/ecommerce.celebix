"use client";

// =====================================================
// CONDITIONAL LOGIC EDITOR
// Allows setting when a step should be shown
// =====================================================

import { useState } from "react";
import {
  ConditionalLogicGroup,
  ShowCondition,
  CustomizationStep,
  ConditionOperator,
  LogicalOperator,
} from "@/types/product-customization";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";

interface ConditionalLogicEditorProps {
  value?: ConditionalLogicGroup;
  onChange: (value: ConditionalLogicGroup | undefined) => void;
  availableSteps: CustomizationStep[];
  currentStepId?: string;
}

const operators: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "Eşittir" },
  { value: "not_equals", label: "Eşit Değildir" },
  { value: "contains", label: "İçerir" },
  { value: "not_contains", label: "İçermez" },
  { value: "greater_than", label: "Büyüktür" },
  { value: "less_than", label: "Küçüktür" },
  { value: "is_empty", label: "Boştur" },
  { value: "is_not_empty", label: "Boş Değildir" },
];

export function ConditionalLogicEditor({
  value,
  onChange,
  availableSteps,
}: ConditionalLogicEditorProps) {
  const [isExpanded, setIsExpanded] = useState(!!value);

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        className="w-full justify-start text-left"
        onClick={() => setIsExpanded(true)}
      >
        <Plus className="w-4 h-4 mr-2" />
        Koşul Ekle
      </Button>
    );
  }

  const addCondition = () => {
    const newCondition: ShowCondition = {
      step_key: availableSteps[0]?.key || "",
      operator: "equals",
      value: "",
    };

    if (!value) {
      onChange({
        operator: "and",
        conditions: [newCondition],
      });
    } else {
      onChange({
        ...value,
        conditions: [...value.conditions, newCondition],
      });
    }
  };

  const updateCondition = (index: number, updates: Partial<ShowCondition>) => {
    if (!value) return;

    const newConditions = [...value.conditions];
    newConditions[index] = { ...(newConditions[index] as ShowCondition), ...updates };
    onChange({ ...value, conditions: newConditions });
  };

  const removeCondition = (index: number) => {
    if (!value) return;

    const newConditions = value.conditions.filter((_, i) => i !== index);
    if (newConditions.length === 0) {
      onChange(undefined);
      setIsExpanded(false);
    } else {
      onChange({ ...value, conditions: newConditions });
    }
  };

  const toggleOperator = () => {
    if (!value) return;
    onChange({
      ...value,
      operator: value.operator === "and" ? "or" : "and",
    });
  };

  const getStepType = (stepKey: string): string => {
    const step = availableSteps.find((s) => s.key === stepKey);
    return step?.type || "text";
  };

  const getStepLabel = (stepKey: string): string => {
    const step = availableSteps.find((s) => s.key === stepKey);
    return step?.label || stepKey;
  };

  const getStepOptions = (stepKey: string) => {
    const step = availableSteps.find((s) => s.key === stepKey);
    return step?.options || [];
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="cursor-pointer"
            onClick={toggleOperator}
          >
            {value?.operator === "and" ? "&&" : "||"}
            <span className="ml-1">{value?.operator === "and" ? "VE" : "VEYA"}</span>
          </Badge>
          <span className="text-sm text-gray-500">
            şartları sağlandığında göster
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(undefined);
            setIsExpanded(false);
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-3">
        {value?.conditions.map((condition, index) => {
          const isSimpleCondition = "step_key" in condition;
          
          if (!isSimpleCondition) {
            // Nested group - for simplicity, we'll just show a placeholder
            return (
              <Card key={index} className="p-3 bg-gray-50">
                <div className="text-sm text-gray-500">
                  İç içe grup desteklenmektedir (gelişmiş düzenleyicide düzenleyin)
                </div>
              </Card>
            );
          }

          const cond = condition as ShowCondition;
          const stepType = getStepType(cond.step_key);
          const stepOptions = getStepOptions(cond.step_key);
          const showValueInput = !["is_empty", "is_not_empty"].includes(cond.operator);

          return (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-3 gap-2">
                {/* Step Select */}
                <Select
                  value={cond.step_key}
                  onValueChange={(val) =>
                    updateCondition(index, { step_key: val, value: "" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Alan seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSteps.map((step) => (
                      <SelectItem key={step.key} value={step.key}>
                        {step.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Operator Select */}
                <Select
                  value={cond.operator}
                  onValueChange={(val) =>
                    updateCondition(index, { operator: val as ConditionOperator })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Value Input */}
                {showValueInput && (
                  <>
                    {stepType === "select" ||
                    stepType === "radio_group" ||
                    stepType === "image_select" ? (
                      <Select
                        value={String(cond.value || "")}
                        onValueChange={(val) =>
                          updateCondition(index, { value: val })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Değer seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          {stepOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : stepType === "checkbox" ? (
                      <Select
                        value={String(cond.value || "true")}
                        onValueChange={(val) =>
                          updateCondition(index, { value: val === "true" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">İşaretli</SelectItem>
                          <SelectItem value="false">İşaretsiz</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        placeholder="Değer girin"
                        value={String(cond.value || "")}
                        onChange={(e) =>
                          updateCondition(index, { value: e.target.value })
                        }
                      />
                    )}
                  </>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="text-red-600"
                onClick={() => removeCondition(index)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          );
        })}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="mt-3 w-full"
        onClick={addCondition}
        disabled={availableSteps.length === 0}
      >
        <Plus className="w-4 h-4 mr-1" />
        Şart Ekle
      </Button>

      {availableSteps.length === 0 && (
        <p className="text-sm text-gray-500 mt-2 text-center">
          Koşul eklemek için önce diğer alanları oluşturun
        </p>
      )}
    </Card>
  );
}
