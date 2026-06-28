"use client";

import { use, useEffect, useState } from "react";
import {
  getPolicyPageDefinition,
  isPolicyPageSlug,
} from "@celebix/platform-config/src/policy-pages";
import { PageForm } from "@/components/admin/PageForm";
import { fetchCmsPageBySlug } from "@/lib/cms-pages";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import type { CmsPage } from "@/types/cms";

export default function EditPolicyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [page, setPage] = useState<CmsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const policy = isPolicyPageSlug(slug) ? getPolicyPageDefinition(slug) : null;

  useEffect(() => {
    let mounted = true;

    async function loadPage() {
      if (!policy) {
        setError("Geçersiz politika sayfası.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const nextPage = await fetchCmsPageBySlug(policy.slug);

        if (mounted) {
          setPage(nextPage);
        }
      } catch (fetchError) {
        if (mounted) {
          setError(fetchError instanceof Error ? fetchError.message : "Politika yüklenemedi");
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
  }, [policy]);

  if (!policy) {
    return (
      <div className="min-h-screen bg-[var(--admin-bg)] p-6 md:p-8">
        <div className="mx-auto max-w-5xl rounded-[8px] border border-red-200 bg-red-50 p-10 text-center text-sm text-red-700 shadow-sm">
          Geçersiz politika tanımı.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--admin-bg)] p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        {loading ? (
          <div className="rounded-[8px] border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
            Politika yükleniyor...
          </div>
        ) : null}

        {!loading && error ? (
          <div className="rounded-[8px] border border-red-200 bg-red-50 p-10 text-center shadow-sm">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        ) : null}

        {!loading && !error ? (
          <PageForm
            initialData={page || undefined}
            template={{
              title: policy.name,
              slug: policy.slug,
              metaTitle: `${policy.name} | ${STORE_RUNTIME.name}`,
              metaDescription: policy.description,
              schemaType: policy.schemaType,
              icon: policy.icon,
              sortOrder: policy.sortOrder,
            }}
            lockTitle
            lockSlug
            backHref="/admin/cms/politikalar"
            formTitle={policy.name}
            formDescription="Bu politika metni sadece içerik girilip yayınlandığında storefront footerında görünür."
          />
        ) : null}
      </div>
    </div>
  );
}
