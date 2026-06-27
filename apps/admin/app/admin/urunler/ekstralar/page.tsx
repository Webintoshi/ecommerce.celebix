import type { Metadata } from "next";
import Link from "next/link";
import { Layers3, Package, Plus, Settings2, Tags } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageShell";
import { CustomizationSchemasList } from "@/components/admin/customization/schemas-list";
import { maybeListAdminCustomizationSchemas } from "@/lib/db/light-postgres-read";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: `Ürün Kişiselleştirme | ${STORE_RUNTIME.name} Admin`,
  description: "Ürünlere özel kişiselleştirme şemalarını, adımları ve atamaları tek ekranda yönetin.",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

async function getCustomizationSchemas() {
  const lightPostgresSchemas = await maybeListAdminCustomizationSchemas();
  if (lightPostgresSchemas !== undefined) {
    return lightPostgresSchemas;
  }

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
  const totalSteps = schemas.reduce((accumulator, schema) => accumulator + (schema.step_count || 0), 0);
  const activeSchemas = schemas.filter((schema) => schema.is_active).length;

  return (
    <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[var(--admin-heading)]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageHeader
          sectionLabel="Katalog"
          title="Ekstralar"
          description="Ürünlerde ekstra seçenek ve kişiselleştirme akışlarını yönetin."
          actions={
            <Link
              href="/admin/urunler/ekstralar/yeni"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[var(--admin-accent)] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.20)] transition hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
            >
              <Plus className="h-4 w-4" />
              Yeni Ekstra
            </Link>
          }
          metrics={
            <>
              {[
                {
                  label: "Toplam",
                  value: schemas.length.toLocaleString("tr-TR"),
                  detail: "şema",
                  icon: Layers3,
                },
                {
                  label: "Aktif",
                  value: activeSchemas.toLocaleString("tr-TR"),
                  detail: "kullanımda",
                  icon: Settings2,
                },
                {
                  label: "Atama",
                  value: totalAssignments.toLocaleString("tr-TR"),
                  detail: "ürün/kategori",
                  icon: Tags,
                },
                {
                  label: "Adım",
                  value: totalSteps.toLocaleString("tr-TR"),
                  detail: "form alanı",
                  icon: Package,
                },
              ].map((metric) => {
                const Icon = metric.icon;

                return (
                  <div key={metric.label} className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">
                        {metric.label}
                      </p>
                      <Icon className="h-4 w-4 text-[#9CA3AF]" />
                    </div>
                    <div className="mt-3 flex items-end gap-2">
                      <p className="text-3xl font-semibold tracking-[-0.04em] text-[#111827]">
                        {metric.value}
                      </p>
                      <span className="pb-1 text-sm font-medium text-[#6B7280]">{metric.detail}</span>
                    </div>
                  </div>
                );
              })}
            </>
          }
        />

        <CustomizationSchemasList schemas={schemas} />
      </div>
    </main>
  );
}
