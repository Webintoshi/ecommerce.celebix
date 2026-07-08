import { redirect } from "next/navigation";

interface OnboardingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function buildKayitRedirect(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => search.append(key, entry));
    } else if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `/kayit?${query}` : "/kayit";
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  redirect(buildKayitRedirect(await searchParams));
}
