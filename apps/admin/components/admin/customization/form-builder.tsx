"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { ArrowLeft, Eye, Layers, Loader2, Plus, Save, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { CustomizationSchema, CustomizationStep } from "@/types/product-customization";
import { BuilderCanvas } from "./builder-canvas";
import { LivePreview } from "./live-preview";
import { PropertiesPanel } from "./properties-panel";
import { SchemaAssignmentManager, type AssignableCategory, type AssignableProduct } from "./schema-assignment-manager";
import { SchemaSettingsDialog } from "./schema-settings-dialog";
import { StepPalette } from "./step-palette";

interface FormBuilderProps {
  initialSchema: CustomizationSchema & { steps: CustomizationStep[] };
  initialProductAssignments: string[];
  initialCategoryAssignments: string[];
  availableProducts: AssignableProduct[];
  availableCategories: AssignableCategory[];
}

type BuilderTab = "builder" | "preview" | "assignments";

const generateId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

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

export function FormBuilder({
  initialSchema,
  initialProductAssignments,
  initialCategoryAssignments,
  availableProducts,
  availableCategories,
}: FormBuilderProps) {
  const router = useRouter();
  const [schema, setSchema] = useState<CustomizationSchema>(initialSchema);
  const [steps, setSteps] = useState<CustomizationStep[]>(initialSchema.steps || []);
  const [productAssignments, setProductAssignments] = useState<string[]>(initialProductAssignments);
  const [categoryAssignments, setCategoryAssignments] = useState<string[]>(initialCategoryAssignments);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<BuilderTab>("builder");
  const [draggingStep, setDraggingStep] = useState<CustomizationStep | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    setIsDirty(true);
  }, [schema, steps, productAssignments, categoryAssignments]);

  const selectedStep = useMemo(
    () => steps.find((step) => step.id === selectedStepId) || null,
    [selectedStepId, steps],
  );

  const handleAddStep = useCallback(
    (type: CustomizationStep["type"]) => {
      const nextStep: CustomizationStep = {
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

      setSteps((prev) => [...prev, nextStep]);
      setSelectedStepId(nextStep.id);
      setActiveTab("builder");
    },
    [schema.id, steps.length],
  );

  const handleUpdateStep = useCallback((updatedStep: CustomizationStep) => {
    setSteps((prev) => prev.map((step) => (step.id === updatedStep.id ? updatedStep : step)));
  }, []);

  const handleDeleteStep = useCallback(
    (stepId: string) => {
      setSteps((prev) => prev.filter((step) => step.id !== stepId));
      setSelectedStepId((prev) => (prev === stepId ? null : prev));
    },
    [],
  );

  const handleDuplicateStep = useCallback(
    (stepId: string) => {
      const source = steps.find((step) => step.id === stepId);
      if (!source) return;

      const clone: CustomizationStep = {
        ...source,
        id: generateId(),
        key: `${source.key}_kopya`,
        label: `${source.label} (Kopya)`,
        sort_order: steps.length,
        options: source.options?.map((option) => ({
          ...option,
          id: generateId(),
          step_id: "",
        })),
      };

      setSteps((prev) => [...prev, clone]);
      setSelectedStepId(clone.id);
    },
    [steps],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const current = steps.find((step) => step.id === event.active.id);
      if (current) {
        setDraggingStep(current);
      }
    },
    [steps],
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingStep(null);

    if (!over || active.id === over.id) {
      return;
    }

    setSteps((prev) => {
      const oldIndex = prev.findIndex((step) => step.id === active.id);
      const newIndex = prev.findIndex((step) => step.id === over.id);

      return arrayMove(prev, oldIndex, newIndex).map((step, index) => ({
        ...step,
        sort_order: index,
      }));
    });
  }, []);

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
          productAssignments,
          categoryAssignments,
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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/urunler/ekstralar">
              <Button variant="ghost" className="h-10 w-10 p-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>

            <div>
              <h1 className="text-xl font-semibold text-gray-900">{schema.name}</h1>
              <p className="text-sm text-gray-500">
                /{schema.slug} • {steps.length} adım
              </p>
            </div>

            {isDirty ? (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">
                Kaydedilmemiş değişiklikler
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === "builder" ? "default" : "outline"}
              onClick={() => setActiveTab("builder")}
              className={activeTab === "builder" ? "bg-amber-600 hover:bg-amber-700" : ""}
            >
              <Layers className="mr-2 h-4 w-4" />
              Editör
            </Button>
            <Button
              variant={activeTab === "assignments" ? "default" : "outline"}
              onClick={() => setActiveTab("assignments")}
              className={activeTab === "assignments" ? "bg-amber-600 hover:bg-amber-700" : ""}
            >
              <Settings className="mr-2 h-4 w-4" />
              Atamalar
            </Button>
            <Button
              variant={activeTab === "preview" ? "default" : "outline"}
              onClick={() => setActiveTab("preview")}
              className={activeTab === "preview" ? "bg-amber-600 hover:bg-amber-700" : ""}
            >
              <Eye className="mr-2 h-4 w-4" />
              Önizleme
            </Button>
            <Button variant="outline" onClick={() => setShowSettings(true)}>
              <Settings className="mr-2 h-4 w-4" />
              Ayarlar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-amber-600 hover:bg-amber-700">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Kaydet
            </Button>
          </div>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as BuilderTab)} className="flex-1">
        <TabsContent value="assignments" className="m-0 h-[calc(100vh-73px)] overflow-auto bg-gray-50">
          <SchemaAssignmentManager
            products={availableProducts}
            categories={availableCategories}
            selectedProductIds={productAssignments}
            selectedCategoryIds={categoryAssignments}
            onProductAssignmentsChange={setProductAssignments}
            onCategoryAssignmentsChange={setCategoryAssignments}
          />
        </TabsContent>

        <div className={activeTab === "assignments" ? "hidden" : "flex h-[calc(100vh-73px)]"}>
          <div className="flex w-72 flex-col border-r border-gray-200 bg-white">
            <div className="border-b border-gray-200 p-4">
              <h2 className="flex items-center gap-2 font-semibold text-gray-900">
                <Plus className="h-4 w-4" />
                Adım Ekle
              </h2>
            </div>
            <StepPalette onSelect={handleAddStep} />
          </div>

          <div className="flex-1 overflow-auto bg-gray-50">
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
                    <div className="rounded-lg border-2 border-amber-500 bg-white p-4 opacity-80 shadow-lg">
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

          <div className="flex w-96 flex-col border-l border-gray-200 bg-white">
            <TabsContent value="builder" className="m-0 h-full flex-col">
              <PropertiesPanel
                step={selectedStep || undefined}
                allSteps={steps}
                onChange={handleUpdateStep}
                onDelete={handleDeleteStep}
              />
            </TabsContent>

            <TabsContent value="preview" className="m-0 h-full">
              <div className="p-4">
                <h3 className="mb-4 font-semibold text-gray-900">Önizleme Bilgisi</h3>
                <p className="text-sm text-gray-600">
                  Bu, müşterilerin ürün sayfasında göreceği formun canlı önizlemesidir.
                  Tüm değişiklikler anında yansıtılacaktır.
                </p>
              </div>
            </TabsContent>
          </div>
        </div>
      </Tabs>

      <SchemaSettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        schema={schema}
        onChange={setSchema}
      />
    </div>
  );
}
