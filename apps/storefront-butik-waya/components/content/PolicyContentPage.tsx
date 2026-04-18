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
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="mx-auto max-w-4xl px-6 py-8 lg:py-10">
        <article className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_20px_50px_-42px_rgba(41,24,15,0.35)] sm:p-8">
          <div
            className="text-sm leading-7 text-[#222222] [&_a]:font-medium [&_a]:text-[#222222] [&_a]:underline [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-[#C6AB92] [&_blockquote]:pl-4 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-[#222222] [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-[#222222] [&_h4]:mt-5 [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:text-[#222222] [&_li]:ml-5 [&_li]:pl-1 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:space-y-3 [&_ol]:pl-5 [&_p]:mb-5 [&_p]:text-[#222222] [&_strong]:font-semibold [&_ul]:my-5 [&_ul]:list-disc [&_ul]:space-y-3 [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />

          <div className="mt-8 border-t border-black/5 pt-5 text-sm text-[#222222]">
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
