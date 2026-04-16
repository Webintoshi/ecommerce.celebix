import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F8F8] px-6">
      <div className="w-full max-w-md rounded-[32px] border border-black/5 bg-white p-10 text-center shadow-[0_24px_60px_-44px_rgba(41,24,15,0.45)]">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#DA630D]/10">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#DA630D]/20 border-t-[#DA630D]" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8A6847]">
          Premium Storefront
        </p>
        <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#18110B]">
          {STOREFRONT_RUNTIME.name}
        </h2>
        <p className="mt-3 text-sm leading-7 text-[#6B5A4D]">
          Sayfa hazirlaniyor. Admin panelinden gelen icerikler ve vitrin bloklari yukleniyor.
        </p>
      </div>
    </div>
  );
}
