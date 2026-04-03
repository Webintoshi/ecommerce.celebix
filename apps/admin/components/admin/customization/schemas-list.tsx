"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { CustomizationSchema } from "@/types/product-customization";
import { toast } from "sonner";
import {
  Copy,
  Edit,
  Eye,
  Layers,
  MoreVertical,
  Package,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

interface SchemaWithCounts extends CustomizationSchema {
  step_count: number;
  product_count: number;
  category_count?: number;
}

interface CustomizationSchemasListProps {
  schemas: SchemaWithCounts[];
}

export function CustomizationSchemasList({ schemas }: CustomizationSchemasListProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteSchema, setDeleteSchema] = useState<SchemaWithCounts | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [localSchemas, setLocalSchemas] = useState<SchemaWithCounts[]>(schemas);

  const filteredSchemas = localSchemas.filter((schema) => {
    const query = searchQuery.toLocaleLowerCase("tr-TR");
    return (
      schema.name.toLocaleLowerCase("tr-TR").includes(query) ||
      schema.slug.toLocaleLowerCase("tr-TR").includes(query) ||
      schema.description?.toLocaleLowerCase("tr-TR").includes(query)
    );
  });

  const handleToggleActive = async (schema: SchemaWithCounts) => {
    try {
      const response = await fetch("/api/admin/customization/schemas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: schema.id, is_active: !schema.is_active }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Şema durumu güncellenemedi");
      }

      setLocalSchemas((prev) =>
        prev.map((current) =>
          current.id === schema.id ? { ...current, is_active: !current.is_active } : current,
        ),
      );
      toast.success(schema.is_active ? "Şema pasife alındı" : "Şema aktifleştirildi");
    } catch (error) {
      console.error("Error toggling schema:", error);
      toast.error("İşlem sırasında bir hata oluştu");
    }
  };

  const handleDuplicate = async (schema: SchemaWithCounts) => {
    try {
      const response = await fetch("/api/admin/customization/schemas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate", schemaId: schema.id }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Kopyalama sırasında bir hata oluştu");
      }

      toast.success("Şema başarıyla kopyalandı");
      router.refresh();
    } catch (error) {
      console.error("Error duplicating schema:", error);
      toast.error("Kopyalama sırasında bir hata oluştu");
    }
  };

  const handleDelete = async () => {
    if (!deleteSchema) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/customization/schemas?id=${deleteSchema.id}`, {
        method: "DELETE",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Silme işlemi başarısız");
      }

      setLocalSchemas((prev) => prev.filter((schema) => schema.id !== deleteSchema.id));
      toast.success("Şema başarıyla silindi");
    } catch (error) {
      console.error("Error deleting schema:", error);
      toast.error("Silme sırasında bir hata oluştu");
    } finally {
      setIsDeleting(false);
      setDeleteSchema(null);
    }
  };

  if (localSchemas.length === 0) {
    return (
      <Card className="border-2 border-dashed border-gray-300">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Layers className="mb-4 h-16 w-16 text-gray-400" />
          <h3 className="mb-2 text-xl font-semibold text-gray-900">Henüz şema oluşturulmadı</h3>
          <p className="mb-6 max-w-md text-center text-gray-600">
            Ürünlere ekstra seçim alanları eklemek için ilk şemanızı oluşturun.
          </p>
          <Link href="/admin/urunler/ekstralar/yeni">
            <Button className="bg-amber-600 hover:bg-amber-700">
              <Plus className="mr-2 h-4 w-4" />
              İlk Şemayı Oluştur
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Şema ara..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredSchemas.map((schema) => {
          const assignmentCount = (schema.product_count || 0) + (schema.category_count || 0);

          return (
            <Card
              key={schema.id}
              className={`group transition-shadow hover:shadow-md ${!schema.is_active ? "opacity-75" : ""}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-lg font-semibold">{schema.name}</CardTitle>
                    <p className="mt-1 text-sm text-gray-500">/{schema.slug}</p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <Link href={`/admin/urunler/ekstralar/${schema.id}`}>
                        <DropdownMenuItem>
                          <Edit className="mr-2 h-4 w-4" />
                          Düzenle
                        </DropdownMenuItem>
                      </Link>
                      <Link href={`/admin/urunler/ekstralar/${schema.id}/onizleme`}>
                        <DropdownMenuItem>
                          <Eye className="mr-2 h-4 w-4" />
                          Önizleme
                        </DropdownMenuItem>
                      </Link>
                      <DropdownMenuItem onClick={() => handleDuplicate(schema)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Kopyala
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteSchema(schema)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Sil
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                {schema.description ? (
                  <p className="mb-4 line-clamp-2 text-sm text-gray-600">{schema.description}</p>
                ) : null}

                <div className="mb-4 flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Layers className="h-4 w-4" />
                    <span>{schema.step_count} adım</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Package className="h-4 w-4" />
                    <span>{assignmentCount} atama</span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={schema.is_active} onCheckedChange={() => handleToggleActive(schema)} />
                    <span className="text-sm text-gray-600">{schema.is_active ? "Aktif" : "Pasif"}</span>
                  </div>
                  <Link href={`/admin/urunler/ekstralar/${schema.id}`}>
                    <Button variant="outline" size="sm">
                      Düzenle
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={!!deleteSchema} onOpenChange={() => setDeleteSchema(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Şemayı silmek istediğinize emin misiniz?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteSchema?.name}</strong> şeması kalıcı olarak silinecektir.
              Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Siliniyor..." : "Evet, Sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
