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
          <div className="space-y-6">
            {sections.map((section) => (
              <p key={section} className="whitespace-pre-wrap text-sm leading-7 text-neutral-600">
                {section}
              </p>
            ))}
          </div>

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
