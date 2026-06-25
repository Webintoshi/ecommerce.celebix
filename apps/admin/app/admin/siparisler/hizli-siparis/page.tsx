import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { QuickOrderLinksPanel } from "@/components/admin/QuickOrderLinksPanel";

export default function QuickOrderLinksPage() {
  return (
    <div className="min-h-screen bg-[#F9F9F9] px-0 py-3 md:py-5">
      <div className="flex w-full flex-col gap-4">
        <Link
          href="/admin/siparisler"
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#6B7280] transition hover:text-[#E85D04]"
        >
          <ChevronLeft className="h-4 w-4" />
          Siparişlere dön
        </Link>

        <QuickOrderLinksPanel />
      </div>
    </div>
  );
}
