import { getStorefrontProfile } from "@/lib/storefront-profile";
import type { PublishedPolicyPage } from "@/lib/policy-pages";
import { normalizeProductDescriptionHtml } from "@celebix/platform-config/src/product-description-rich-text";

interface PolicyContentPageProps {
  page: PublishedPolicyPage;
}

export async function PolicyContentPage({ page }: PolicyContentPageProps) {
  const profile = await getStorefrontProfile();
  const contentHtml = normalizeProductDescriptionHtml(page.content);
  const formattedDate = new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(page.updatedAt));

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
            Politikalar
          </p>
          <h1 className="mt-4 text-3xl font-light tracking-tight text-neutral-900 sm:text-4xl">
            {page.name}
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12 lg:py-16">
        <article className="rounded-lg border border-neutral-200 bg-white p-8">
          <div
            className="text-sm leading-7 text-neutral-600 [&_a]:font-medium [&_a]:text-neutral-900 [&_a]:underline [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-200 [&_blockquote]:pl-4 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-medium [&_h2]:text-neutral-900 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-medium [&_h3]:text-neutral-900 [&_h4]:mt-5 [&_h4]:text-lg [&_h4]:font-medium [&_h4]:text-neutral-900 [&_li]:ml-5 [&_li]:pl-1 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:space-y-3 [&_ol]:pl-5 [&_p]:mb-5 [&_strong]:font-semibold [&_ul]:my-5 [&_ul]:list-disc [&_ul]:space-y-3 [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />

          <div className="mt-10 border-t border-neutral-100 pt-6 text-xs text-neutral-400">
            <p>Son güncelleme: {formattedDate}</p>
            <p className="mt-1">
              İletişim: {profile.email}
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}
