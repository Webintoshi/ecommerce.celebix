import { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CustomizationSchemasList } from "@/components/admin/customization/schemas-list";
import { Button } from "@/components/ui/button";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: `Ürün Kişiselleştirme | ${STORE_RUNTIME.name} Admin`,
  description: "Ürünlere özel kişiselleştirme şemalarını yönetin",
};

export const dynamic = "force-dynamic";

async function getCustomizationSchemas() {
  const supabase = createServerClient();

  const { data: schemas, error } = await supabase
    .from("product_customization_schemas")
    .select(`
      *,
      steps:product_customization_steps(count),
      assignments:product_schema_assignments(count),
      category_assignments:category_schema_assignments(count)
    `)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching schemas:", error);
    return [];
  }

  return (schemas || []).map((schema) => ({
    ...schema,
    step_count: schema.steps?.[0]?.count || 0,
    product_count: schema.assignments?.[0]?.count || 0,
    category_count: schema.category_assignments?.[0]?.count || 0,
  }));
}

export default async function CustomizationSchemasPage() {
  const schemas = await getCustomizationSchemas();
  const totalAssignments = schemas.reduce(
    (accumulator, schema) => accumulator + (schema.product_count || 0) + (schema.category_count || 0),
    0,
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Ürün Kişiselleştirme</h1>
          <p className="mt-1 text-gray-600">
            Ürünlere özel ekstra seçim şemaları oluşturun, ürüne veya kategoriye atayın.
          </p>
        </div>
        <Link href="/admin/urunler/ekstralar/yeni">
          <Button className="bg-amber-600 hover:bg-amber-700">
            <Plus className="mr-2 h-4 w-4" />
            Yeni Şema Oluştur
          </Button>
        </Link>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-3xl font-bold text-amber-600">{schemas.length}</div>
          <div className="mt-1 text-sm text-gray-600">Toplam Şema</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-3xl font-bold text-green-600">
            {schemas.filter((schema) => schema.is_active).length}
          </div>
          <div className="mt-1 text-sm text-gray-600">Aktif Şema</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-3xl font-bold text-blue-600">{totalAssignments}</div>
          <div className="mt-1 text-sm text-gray-600">Toplam Atama</div>
        </div>
      </div>

      <CustomizationSchemasList schemas={schemas} />
    </div>
  );
}
