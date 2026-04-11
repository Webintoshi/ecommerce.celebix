import { getStorefrontProfile } from "@/lib/storefront-profile";
import type { PublishedPolicyPage } from "@/lib/policy-pages";

interface PolicyContentPageProps {
  page: PublishedPolicyPage;
}

export async function PolicyContentPage({ page }: PolicyContentPageProps) {
  const profile = await getStorefrontProfile();
  const sections = page.content
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);
  const formattedDate = new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(page.updatedAt));

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
            Politikalar
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#18110B] sm:text-5xl">
            {page.name}
          </h1>
          <p className="mt-5 text-base leading-8 text-[#6B5A4D]">
            Bu içerik admin panelindeki politika ekranından yönetilir. Yayından kaldırıldığında storefront footerından da düşer.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12 lg:py-16">
        <article className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_20px_50px_-42px_rgba(41,24,15,0.35)]">
          <div className="space-y-5">
            {sections.map((section) => (
              <p key={section} className="whitespace-pre-wrap text-sm leading-7 text-[#5F5147]">
                {section}
              </p>
            ))}
          </div>

          <div className="mt-8 border-t border-black/5 pt-5 text-sm text-[#5F5147]">
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
