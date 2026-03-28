"use client";

// =====================================================
// SCHEMA SETTINGS DIALOG
// Edit schema name, description, and settings
// =====================================================

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomizationSchema } from "@/types/product-customization";

interface SchemaSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schema: CustomizationSchema;
  onChange: (schema: CustomizationSchema) => void;
}

export function SchemaSettingsDialog({
  open,
  onOpenChange,
  schema,
  onChange,
}: SchemaSettingsDialogProps) {
  const updateSettings = (key: string, value: unknown) => {
    onChange({
      ...schema,
      settings: {
        ...schema.settings,
        [key]: value,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Şema Ayarları</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general">Genel</TabsTrigger>
            <TabsTrigger value="display">Görünüm</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Şema Adı</Label>
              <Input
                id="name"
                value={schema.name}
                onChange={(e) => onChange({ ...schema, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={schema.slug}
                disabled
                className="bg-gray-50"
              />
              <p className="text-xs text-gray-500">
                Slug değiştirilemez. Yeni bir slug için şemayı kopyalayın.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Açıklama</Label>
              <Textarea
                id="description"
                value={schema.description || ""}
                onChange={(e) =>
                  onChange({ ...schema, description: e.target.value })
                }
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <Label className="text-base">Aktif</Label>
                <p className="text-sm text-gray-500">
                  Bu şema müşterilere gösterilsin mi?
                </p>
              </div>
              <Switch
                checked={schema.is_active}
                onCheckedChange={(checked) =>
                  onChange({ ...schema, is_active: checked })
                }
              />
            </div>
          </TabsContent>

          <TabsContent value="display" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="submitText">Buton Metni</Label>
              <Input
                id="submitText"
                value={schema.settings?.submit_button_text || "Sepete Ekle"}
                onChange={(e) => updateSettings("submit_button_text", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="successMessage">Başarı Mesajı</Label>
              <Input
                id="successMessage"
                value={schema.settings?.success_message || "Ürün sepete eklendi"}
                onChange={(e) => updateSettings("success_message", e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <Label className="text-base">Özet Göster</Label>
                <p className="text-sm text-gray-500">
                  Seçimlerin özetini formun altında göster
                </p>
              </div>
              <Switch
                checked={schema.settings?.show_summary !== false}
                onCheckedChange={(checked) => updateSettings("show_summary", checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Fiyat Detayını Göster</Label>
                <p className="text-sm text-gray-500">
                  Fiyat hesaplama detayını göster
                </p>
              </div>
              <Switch
                checked={schema.settings?.show_price_breakdown !== false}
                onCheckedChange={(checked) =>
                  updateSettings("show_price_breakdown", checked)
                }
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end mt-6">
          <Button onClick={() => onOpenChange(false)}>Tamam</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
