"use client";

// =====================================================
// FORM BUILDER - Main Component
// Drag-drop form builder for product customization
// =====================================================

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  CustomizationSchema,
  CustomizationStep,
  CustomizationOption,
} from "@/types/product-customization";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Loader2,
  Eye,
  Plus,
  Settings,
  Layers,
} from "lucide-react";
import { StepPalette } from "./step-palette";
import { BuilderCanvas } from "./builder-canvas";
import { PropertiesPanel } from "./properties-panel";
import { LivePreview } from "./live-preview";
import { SchemaSettingsDialog } from "./schema-settings-dialog";
import { generateKey, customizationStepSchema } from "@/lib/validations/product-customization";

interface FormBuilderProps {
  initialSchema: CustomizationSchema & { steps: CustomizationStep[] };
}

// Generate unique ID for new steps
const generateId = () => `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export function FormBuilder({ initialSchema }: FormBuilderProps) {
  const router = useRouter();
  const [schema, setSchema] = useState<CustomizationSchema>(initialSchema);
  const [steps, setSteps] = useState<CustomizationStep[]>(initialSchema.steps || []);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState("builder");
  const [draggingStep, setDraggingStep] = useState<CustomizationStep | null>(null);

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Track changes
  useEffect(() => {
    setIsDirty(true);
  }, [steps, schema]);

  // Add new step
  const handleAddStep = useCallback((type: CustomizationStep["type"]) => {
    const newStep: CustomizationStep = {
      id: generateId(),
      schema_id: schema.id,
      type,
      key: `step_${steps.length + 1}`,
      label: getDefaultLabel(type),
      is_required: false,
      validation_rules: {},
      grid_width: "full",
      style_config: {},
      sort_order: steps.length,
      options: ["select", "radio_group", "image_select", "multi_select"].includes(type)
        ? [
            {
              id: generateId(),
              step_id: "",
              label: "Seçenek 1",
              value: "secenek_1",
              price_adjustment: 0,
              price_adjustment_type: "fixed",
              track_stock: false,
              sort_order: 0,
              is_default: false,
              is_disabled: false,
            },
          ]
        : undefined,
    };

    setSteps((prev) => [...prev, newStep]);
    setSelectedStepId(newStep.id);
    setActiveTab("builder");
  }, [schema.id, steps.length]);

  // Update step
  const handleUpdateStep = useCallback((updatedStep: CustomizationStep) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === updatedStep.id ? updatedStep : step))
    );
  }, []);

  // Delete step
  const handleDeleteStep = useCallback((stepId: string) => {
    setSteps((prev) => prev.filter((step) => step.id !== stepId));
    if (selectedStepId === stepId) {
      setSelectedStepId(null);
    }
  }, [selectedStepId]);

  // Reorder steps
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingStep(null);

    if (over && active.id !== over.id) {
      setSteps((prev) => {
        const oldIndex = prev.findIndex((step) => step.id === active.id);
        const newIndex = prev.findIndex((step) => step.id === over.id);
        return arrayMove(prev, oldIndex, newIndex).map((step, index) => ({
          ...step,
          sort_order: index,
        }));
      });
    }
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const step = steps.find((s) => s.id === event.active.id);
    if (step) {
      setDraggingStep(step);
    }
  }, [steps]);

  // Duplicate step
  const handleDuplicateStep = useCallback((stepId: string) => {
    const stepToDuplicate = steps.find((s) => s.id === stepId);
    if (!stepToDuplicate) return;

    const newStep: CustomizationStep = {
      ...stepToDuplicate,
      id: generateId(),
      key: `${stepToDuplicate.key}_kopya`,
      label: `${stepToDuplicate.label} (Kopya)`,
      sort_order: steps.length,
      options: stepToDuplicate.options?.map((opt) => ({
        ...opt,
        id: generateId(),
        step_id: "",
      })),
    };

    setSteps((prev) => [...prev, newStep]);
    setSelectedStepId(newStep.id);
  }, [steps]);

  // Save all changes
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/customization/schemas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          schema: {
            id: schema.id,
            name: schema.name,
            description: schema.description,
            settings: schema.settings,
          },
          steps,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Kaydetme işlemi başarısız");
      }

      toast.success("Değişiklikler kaydedildi");
      setIsDirty(false);
      router.refresh();
    } catch (error) {
      console.error("Error saving schema:", error);
      toast.error("Kaydetme sırasında bir hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedStep = steps.find((s) => s.id === selectedStepId);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/urunler/ekstralar">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {schema.name}
              </h1>
              <p className="text-sm text-gray-500">
                /{schema.slug} • {steps.length} adım
              </p>
            </div>
            {isDirty && (
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
                Kaydedilmemiş değişiklikler
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowSettings(true)}
            >
              <Settings className="w-4 h-4 mr-2" />
              Ayarlar
            </Button>
            <Button
              variant="outline"
              onClick={() => setActiveTab(activeTab === "builder" ? "preview" : "builder")}
            >
              <Eye className="w-4 h-4 mr-2" />
              {activeTab === "builder" ? "Önizleme" : "Editör"}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Kaydet
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <div className="flex h-[calc(100vh-73px)]">
          {/* Left Sidebar - Step Palette */}
          <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Adım Ekle
              </h2>
            </div>
            <StepPalette onSelect={handleAddStep} />
          </div>

          {/* Center - Builder Canvas */}
          <div className="flex-1 bg-gray-50 overflow-auto">
            <TabsContent value="builder" className="m-0 h-full">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <BuilderCanvas
                  steps={steps}
                  selectedStepId={selectedStepId}
                  onSelectStep={setSelectedStepId}
                  onUpdateStep={handleUpdateStep}
                  onDeleteStep={handleDeleteStep}
                  onDuplicateStep={handleDuplicateStep}
                />
                <DragOverlay>
                  {draggingStep ? (
                    <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-amber-500 opacity-80">
                      {draggingStep.label}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </TabsContent>

            <TabsContent value="preview" className="m-0 h-full">
              <LivePreview schema={{ ...schema, steps }} />
            </TabsContent>
          </div>

          {/* Right Sidebar - Properties Panel */}
          <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
            <TabsContent value="builder" className="m-0 h-full flex flex-col">
              <PropertiesPanel
                step={selectedStep}
                allSteps={steps}
                onChange={handleUpdateStep}
                onDelete={handleDeleteStep}
              />
            </TabsContent>
            <TabsContent value="preview" className="m-0 h-full">
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 mb-4">Önizleme Bilgisi</h3>
                <p className="text-sm text-gray-600">
                  Bu, müşterilerin ürün sayfasında göreceği formun canlı önizlemesidir.
                  Tüm değişiklikler anında yansıyacaktır.
                </p>
              </div>
            </TabsContent>
          </div>
        </div>
      </Tabs>

      {/* Settings Dialog */}
      <SchemaSettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        schema={schema}
        onChange={setSchema}
      />
    </div>
  );
}

// Helper function
function getDefaultLabel(type: CustomizationStep["type"]): string {
  const labels: Record<string, string> = {
    select: "Seçim Alanı",
    radio_group: "Seçenek Grubu",
    image_select: "Görsel Seçimi",
    text: "Yazı Alanı",
    textarea: "Uzun Yazı Alanı",
    checkbox: "Onay Kutusu",
    multi_select: "Çoklu Seçim",
    file_upload: "Dosya Yükleme",
    number: "Sayı Alanı",
    date: "Tarih Alanı",
    color_picker: "Renk Seçici",
  };
  return labels[type] || "Yeni Alan";
}

