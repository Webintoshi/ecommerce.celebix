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
    <div className="min-h-screen bg-[#F7FAF9]">
      <section className="border-b border-[#DDE7E4] bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-[#0F766E]">
            Politikalar
          </p>
          <h1 className="mt-4 text-4xl font-semibold text-[#111827] sm:text-5xl">
            {page.name}
          </h1>
          <p className="mt-5 text-base leading-8 text-[#526B66]">
            Hemenaku alışveriş deneyimiyle ilgili güncel koşullar ve bilgilendirmeler bu sayfada yer alır.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12 lg:py-16">
        <article className="rounded-lg border border-[#DDE7E4] bg-white p-6 shadow-sm">
          <div
            className="text-sm leading-7 text-[#526B66] [&_a]:font-medium [&_a]:text-[#0F766E] [&_a]:underline [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-[#0F766E]/30 [&_blockquote]:pl-4 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-[#111827] [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-[#111827] [&_h4]:mt-5 [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:text-[#111827] [&_li]:ml-5 [&_li]:pl-1 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:space-y-3 [&_ol]:pl-5 [&_p]:mb-5 [&_strong]:font-semibold [&_ul]:my-5 [&_ul]:list-disc [&_ul]:space-y-3 [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />

          <div className="mt-8 border-t border-[#DDE7E4] pt-5 text-sm text-[#526B66]">
            <p>Son güncelleme: {formattedDate}</p>
            <p className="mt-2">
              İletişim: {profile.email} / {profile.phone}
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}
