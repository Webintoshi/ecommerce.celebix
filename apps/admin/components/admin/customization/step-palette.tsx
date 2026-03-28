"use client";

// =====================================================
// STEP PALETTE - Draggable step type selector
// =====================================================

import { CustomizationStepType } from "@/types/product-customization";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
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
} from "lucide-react";

interface StepPaletteProps {
  onSelect: (type: CustomizationStepType) => void;
}

const stepTypes: {
  type: CustomizationStepType;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
}[] = [
  {
    type: "select",
    label: "Açılır Liste",
    description: "Telefon modeli gibi seçimler",
    icon: List,
    color: "bg-blue-500",
  },
  {
    type: "radio_group",
    label: "Buton Grubu",
    description: "Hayır / Lazer / Harf gibi",
    icon: CircleDot,
    color: "bg-green-500",
  },
  {
    type: "image_select",
    label: "Görsel Seçimi",
    description: "Paket görselleri gibi",
    icon: ImageIcon,
    color: "bg-purple-500",
  },
  {
    type: "text",
    label: "Kısa Yazı",
    description: "İsim, model numarası",
    icon: Type,
    color: "bg-gray-500",
  },
  {
    type: "textarea",
    label: "Uzun Yazı",
    description: "Not, açıklama",
    icon: AlignLeft,
    color: "bg-gray-600",
  },
  {
    type: "checkbox",
    label: "Onay Kutusu",
    description: "Evet / Hayır",
    icon: CheckSquare,
    color: "bg-orange-500",
  },
  {
    type: "multi_select",
    label: "Çoklu Seçim",
    description: "Birden fazla seçenek",
    icon: ListChecks,
    color: "bg-teal-500",
  },
  {
    type: "number",
    label: "Sayı",
    description: "Miktar, boyut",
    icon: Hash,
    color: "bg-indigo-500",
  },
  {
    type: "color_picker",
    label: "Renk Seçici",
    description: "Renk seçimi",
    icon: Palette,
    color: "bg-pink-500",
  },
  {
    type: "date",
    label: "Tarih",
    description: "Tarih seçimi",
    icon: Calendar,
    color: "bg-cyan-500",
  },
  {
    type: "file_upload",
    label: "Dosya Yükleme",
    description: "Görsel, logo",
    icon: Upload,
    color: "bg-red-500",
  },
];

export function StepPalette({ onSelect }: StepPaletteProps) {
  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-2">
        {stepTypes.map((stepType) => {
          const Icon = stepType.icon;
          return (
            <Button
              key={stepType.type}
              variant="ghost"
              className="w-full justify-start h-auto p-3 hover:bg-gray-100"
              onClick={() => onSelect(stepType.type)}
            >
              <div className="flex items-start gap-3">
                <div className={`${stepType.color} p-2 rounded-lg shrink-0`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-gray-900">
                    {stepType.label}
                  </div>
                  <div className="text-xs text-gray-500">
                    {stepType.description}
                  </div>
                </div>
              </div>
            </Button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
