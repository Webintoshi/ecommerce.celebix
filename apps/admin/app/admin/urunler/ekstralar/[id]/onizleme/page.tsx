// =====================================================
// ADMIN - PREVIEW CUSTOMIZATION SCHEMA
// /admin/urunler/ekstralar/[id]/onizleme
// =====================================================

import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { createServerClient } from "@/lib/supabase";
import { LivePreview } from "@/components/admin/customization/live-preview";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye } from "lucide-react";

export const metadata: Metadata = {
  title: `Onizleme | ${STORE_RUNTIME.name} Admin`,
};

interface PreviewPageProps {
  params: Promise<{
    id: string;
  }>;
}

async function getSchemaWithDetails(id: string) {
  const supabase = createServerClient();
  
  const { data: schema, error: schemaError } = await supabase
    .from("product_customization_schemas")
    .select("*")
    .eq("id", id)
    .single();

  if (schemaError || !schema) {
    return null;
  }

  const { data: steps, error: stepsError } = await supabase
    .from("product_customization_steps")
    .select("*")
    .eq("schema_id", id)
    .order("sort_order", { ascending: true });

  if (stepsError) {
    return { ...schema, steps: [] };
  }

  const stepsWithOptions = await Promise.all(
    (steps || []).map(async (step) => {
      const { data: options } = await supabase
        .from("product_customization_options")
        .select("*")
        .eq("step_id", step.id)
        .order("sort_order", { ascending: true });

      return { ...step, options: options || [] };
    })
  );

  return { ...schema, steps: stepsWithOptions };
}

export default async function PreviewPage({ params }: PreviewPageProps) {
  const { id } = await params;
  const schema = await getSchemaWithDetails(id);

  if (!schema) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/admin/urunler/ekstralar/${id}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {schema.name}
              </h1>
              <p className="text-sm text-gray-500">Canlı Önizleme</p>
            </div>
          </div>

          <Link href={`/admin/urunler/ekstralar/${id}`}>
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Editöre Dön
            </Button>
          </Link>
        </div>
      </header>

      {/* Preview */}
      <LivePreview schema={schema} basePrice={299} />
    </div>
  );
}
