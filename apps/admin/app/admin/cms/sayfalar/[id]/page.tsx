"use client";

import { use, useEffect, useState } from "react";
import {
  getManagedContentPageDefinition,
  isManagedContentPageSlug,
} from "@celebix/platform-config/src/content-pages";
import { PageForm } from "@/components/admin/PageForm";
import { fetchCmsPageBySlug } from "@/lib/cms-pages";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import type { CmsPage } from "@/types/cms";

export default function EditManagedContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [page, setPage] = useState<CmsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageDefinition = isManagedContentPageSlug(id)
    ? getManagedContentPageDefinition(id)
    : null;

  useEffect(() => {
    let mounted = true;

    async function loadPage() {
      if (!pageDefinition) {
        setError("Gecersiz sabit sayfa.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const nextPage = await fetchCmsPageBySlug(pageDefinition.slug);

        if (mounted) {
          setPage(nextPage);
        }
      } catch (fetchError) {
        if (mounted) {
          setError(fetchError instanceof Error ? fetchError.message : "Sayfa yuklenemedi");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      mounted = false;
    };
  }, [pageDefinition]);

  if (!pageDefinition) {
    return (
      <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
        <div className="mx-auto max-w-5xl rounded-xl border border-red-200 bg-red-50 p-10 text-center text-sm text-red-700 shadow-sm">
          Gecersiz sabit sayfa tanimi.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
            Sayfa yukleniyor...
          </div>
        ) : null}

        {!loading && error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-10 text-center shadow-sm">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        ) : null}

        {!loading && !error ? (
          <PageForm
            initialData={page || undefined}
            template={{
              title: pageDefinition.name,
              slug: pageDefinition.slug,
              metaTitle: `${pageDefinition.name} | ${STORE_RUNTIME.name}`,
              metaDescription: pageDefinition.description,
              schemaType: pageDefinition.schemaType,
              icon: pageDefinition.icon,
              sortOrder: pageDefinition.sortOrder,
            }}
            lockTitle
            lockSlug
            backHref="/admin/cms/sayfalar"
            formTitle={pageDefinition.name}
            formDescription="Bu sabit storefront sayfasinin icerigini buradan yonetin. Yayin durumuna gore vitrinde gosterilir."
          />
        ) : null}
      </div>
    </div>
  );
}
