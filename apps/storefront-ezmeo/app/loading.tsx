import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="surface-card w-full max-w-md p-10 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(144,21,20,0.08)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[rgba(144,21,20,0.16)] border-t-[var(--primary)]" />
        </div>
        <p className="editorial-kicker">
          Ezmeo hazirlaniyor
        </p>
        <h2 className="mt-5 text-3xl text-[var(--foreground)]">
          {STOREFRONT_RUNTIME.name}
        </h2>
        <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">
          Secili urunler, koleksiyonlar ve gorseller yukleniyor.
        </p>
      </div>
    </div>
  );
}
