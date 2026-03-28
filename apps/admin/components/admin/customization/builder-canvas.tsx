"use client";

// =====================================================
// BUILDER CANVAS - Main workspace for form builder
// =====================================================

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CustomizationStep,
  CustomizationStepType,
} from "@/types/product-customization";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GripVertical,
  Trash2,
  Copy,
  Settings,
  List,
  CircleDot,
  ImageIcon,
  Type,
  AlignLeft,
  CheckSquare,
  ListChecks,
  Upload,
  Hash,
  Calendar,
  Palette,
  Eye,
  EyeOff,
} from "lucide-react";

interface BuilderCanvasProps {
  steps: CustomizationStep[];
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
  onUpdateStep: (step: CustomizationStep) => void;
  onDeleteStep: (id: string) => void;
  onDuplicateStep: (id: string) => void;
}

const stepTypeIcons: Record<CustomizationStepType, React.ElementType> = {
  select: List,
  radio_group: CircleDot,
  image_select: ImageIcon,
  text: Type,
  textarea: AlignLeft,
  checkbox: CheckSquare,
  multi_select: ListChecks,
  file_upload: Upload,
  number: Hash,
  date: Calendar,
  color_picker: Palette,
};

const stepTypeLabels: Record<CustomizationStepType, string> = {
  select: "Açılır Liste",
  radio_group: "Buton Grubu",
  image_select: "Görsel Seçimi",
  text: "Kısa Yazı",
  textarea: "Uzun Yazı",
  checkbox: "Onay Kutusu",
  multi_select: "Çoklu Seçim",
  file_upload: "Dosya Yükleme",
  number: "Sayı",
  date: "Tarih",
  color_picker: "Renk Seçici",
};

function SortableStepItem({
  step,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  step: CustomizationStep;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (step: CustomizationStep) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = stepTypeIcons[step.type];
  const hasConditions = !!step.show_conditions;
  const hasPrice = !!step.price_config;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative",
        isDragging && "opacity-50",
        isSelected && "z-10"
      )}
    >
      <Card
        className={cn(
          "cursor-pointer transition-all",
          isSelected
            ? "ring-2 ring-amber-500 border-amber-500"
            : "hover:border-gray-300",
          "border-2"
        )}
        onClick={onSelect}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Drag Handle */}
            <button
              {...attributes}
              {...listeners}
              className="mt-1 p-1 hover:bg-gray-100 rounded cursor-grab active:cursor-grabbing"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-4 h-4 text-gray-400" />
            </button>

            {/* Icon */}
            <div className="p-2 bg-gray-100 rounded-lg shrink-0">
              <Icon className="w-4 h-4 text-gray-600" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium text-gray-900 truncate">
                  {step.label}
                </h3>
                {step.is_required && (
                  <Badge variant="destructive" className="text-xs">
                    Zorunlu
                  </Badge>
                )}
                {hasConditions && (
                  <Badge variant="secondary" className="text-xs">
                    <Eye className="w-3 h-3 mr-1" />
                    Koşullu
                  </Badge>
                )}
                {hasPrice && (
                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                    Fiyat
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {stepTypeLabels[step.type]} • Key: {step.key}
              </p>

              {/* Options Preview (for select types) */}
              {(step.type === "select" ||
                step.type === "radio_group" ||
                step.type === "image_select" ||
                step.type === "multi_select") &&
                step.options && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {step.options.slice(0, 4).map((opt, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="text-xs"
                      >
                        {opt.label}
                        {opt.price_adjustment > 0 && (
                          <span className="text-green-600 ml-1">
                            +₺{opt.price_adjustment}
                          </span>
                        )}
                      </Badge>
                    ))}
                    {step.options.length > 4 && (
                      <Badge variant="outline" className="text-xs">
                        +{step.options.length - 4} daha
                      </Badge>
                    )}
                  </div>
                )}

              {/* Validation Preview */}
              {(step.validation_rules?.min_length ||
                step.validation_rules?.max_length) && (
                <p className="text-xs text-gray-400 mt-2">
                  {step.validation_rules.min_length &&
                    `Min: ${step.validation_rules.min_length} `}
                  {step.validation_rules.max_length &&
                    `Max: ${step.validation_rules.max_length}`}
                  {step.validation_rules.pattern && " • Pattern"}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate();
                }}
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function BuilderCanvas({
  steps,
  selectedStepId,
  onSelectStep,
  onUpdateStep,
  onDeleteStep,
  onDuplicateStep,
}: BuilderCanvasProps) {
  if (steps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Settings className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Formunuzu Oluşturmaya Başlayın
          </h3>
          <p className="text-gray-600 mb-6">
            Sol panelden form alanları ekleyerek kişiselleştirme şemanızı
            oluşturun. İlk adım olarak bir &quot;Telefon Modeli&quot; seçimi ekleyebilirsiniz.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Badge variant="outline">Açılır Liste</Badge>
            <Badge variant="outline">Buton Grubu</Badge>
            <Badge variant="outline">Görsel Seçimi</Badge>
            <Badge variant="outline">Yazı Alanı</Badge>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="space-y-4">
        {steps.map((step, index) => (
          <SortableStepItem
            key={step.id}
            step={step}
            isSelected={step.id === selectedStepId}
            onSelect={() => onSelectStep(step.id)}
            onUpdate={onUpdateStep}
            onDelete={() => onDeleteStep(step.id)}
            onDuplicate={() => onDuplicateStep(step.id)}
          />
        ))}
      </div>

      {/* Add Step Hint */}
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Daha fazla alan eklemek için sol panelden seçim yapın
        </p>
      </div>
    </div>
  );
}
