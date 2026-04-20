import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#7B1113]/7">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#7B1113]/18 border-t-[#7B1113]" />
        </div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-[#222222]/62">
          {STOREFRONT_RUNTIME.name}
        </p>
      </div>
    </div>
  );
}
