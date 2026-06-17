import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7FAF9] px-6">
      <div className="w-full max-w-md rounded-lg border border-[#DDE7E4] bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#F0FDFA]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#0F766E]/20 border-t-[#0F766E]" />
        </div>
        <p className="text-[11px] font-semibold uppercase text-[#0F766E]">
          Sayfa yukleniyor
        </p>
        <h2 className="mt-4 text-3xl font-semibold text-[#111827]">
          {STOREFRONT_RUNTIME.name}
        </h2>
        <p className="mt-3 text-sm leading-7 text-[#526B66]">
          Vitrin ve alisveris bilgileri getiriliyor.
        </p>
      </div>
    </div>
  );
}
