// =====================================================
// ADMIN - PRODUCT CUSTOMIZATION SCHEMAS LIST
// /admin/urunler/ekstra
// =====================================================

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { createServerClient } from "@/lib/supabase";
import { CustomizationSchemasList } from "@/components/admin/customization/schemas-list";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: `Urun Kisilestirme | ${STORE_RUNTIME.name} Admin`,
  description: "Ürün kişiselleştirme şemalarını yönetin",
};

export const dynamic = "force-dynamic";

async function getCustomizationSchemas() {
  const supabase = createServerClient();
  
  const { data: schemas, error } = await supabase
    .from("product_customization_schemas")
    .select(`
      *,
      steps:product_customization_steps(count),
      assignments:product_schema_assignments(count)
    `)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching schemas:", error);
    return [];
  }

  return schemas?.map(schema => ({
    ...schema,
    step_count: schema.steps?.[0]?.count || 0,
    product_count: schema.assignments?.[0]?.count || 0,
  })) || [];
}

export default async function CustomizationSchemasPage() {
  const schemas = await getCustomizationSchemas();

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Ürün Kişiselleştirme
          </h1>
          <p className="text-gray-600 mt-1">
            Ürünlere özel kişiselleştirme seçenekleri oluşturun ve yönetin
          </p>
        </div>
        <Link href="/admin/urunler/ekstralar/yeni">
          <Button className="bg-amber-600 hover:bg-amber-700">
            <Plus className="w-4 h-4 mr-2" />
            Yeni Şema Oluştur
          </Button>
        </Link>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-3xl font-bold text-amber-600">
            {schemas.length}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Toplam Şema
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-3xl font-bold text-green-600">
            {schemas.filter(s => s.is_active).length}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Aktif Şema
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-3xl font-bold text-blue-600">
            {schemas.reduce((acc, s) => acc + (s.product_count || 0), 0)}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Atanan Ürün
          </div>
        </div>
      </div>

      {/* Schemas List */}
      <CustomizationSchemasList schemas={schemas} />
    </div>
  );
}
