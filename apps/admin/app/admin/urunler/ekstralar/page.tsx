import type { Metadata } from "next";
import Link from "next/link";
import { Layers3, Package, Plus, Settings2, Tags } from "lucide-react";
import { CustomizationSchemasList } from "@/components/admin/customization/schemas-list";
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
    <main className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5efe8] to-[#efe5dc]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 right-[-8rem] h-[22rem] w-[22rem] rounded-full bg-[#FE6100]/10 blur-3xl" />
        <div className="absolute left-[-6rem] top-[30%] h-[18rem] w-[18rem] rounded-full bg-amber-200/30 blur-3xl" />
        <div className="absolute bottom-[-6rem] right-[18%] h-[18rem] w-[18rem] rounded-full bg-orange-100/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="space-y-8">
          <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfa] to-[#faf4ed] shadow-[0_24px_80px_rgba(254,97,0,0.12)]">
            <div className="border-b border-[#FE6100]/8 px-6 py-6 md:px-8 md:py-7">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-0">
                  <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/20 bg-gradient-to-r from-[#FE6100]/10 to-[#FF8B3D]/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FE6100]">
                    Ekstralar
                  </div>
                  <h1 className="sr-only">Ürün Kişiselleştirme</h1>
                </div>

                <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                  <Link
                    href="/admin/urunler/ekstralar/yeni"
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.24)] transition hover:translate-y-[-1px] hover:from-[#f05c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                  >
                    <Plus className="h-4 w-4" />
                    Yeni Şema Oluştur
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-px bg-gradient-to-r from-[#f0ddd0] via-[#f7ebe2] to-[#f0ddd0] md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Toplam şema",
                  value: schemas.length.toLocaleString("tr-TR"),
                  icon: Layers3,
                  tone: "text-[#FE6100]",
                },
                {
                  label: "Aktif şema",
                  value: activeSchemas.toLocaleString("tr-TR"),
                  icon: Settings2,
                  tone: "text-emerald-700",
                },
                {
                  label: "Toplam atama",
                  value: totalAssignments.toLocaleString("tr-TR"),
                  icon: Tags,
                  tone: "text-amber-700",
                },
                {
                  label: "Toplam adım",
                  value: totalSteps.toLocaleString("tr-TR"),
                  icon: Package,
                  tone: "text-stone-700",
                },
              ].map((metric) => {
                const Icon = metric.icon;

                return (
                  <div key={metric.label} className="border border-white/70 bg-white/70 px-5 py-5 backdrop-blur-sm md:px-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">{metric.label}</p>
                        <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-stone-950 md:text-[30px]">{metric.value}</p>
                      </div>
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70 bg-white shadow-sm ${metric.tone}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <CustomizationSchemasList schemas={schemas} />
        </div>
      </div>
    </main>
  );
}
