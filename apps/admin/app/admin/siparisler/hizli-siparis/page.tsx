import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { QuickOrderLinksPanel } from "@/components/admin/QuickOrderLinksPanel";

export default function QuickOrderLinksPage() {
  return (
    <div className="min-h-screen bg-[#faf8f5] p-6 md:p-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
        <Link
          href="/admin/siparisler"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Siparişlere dön
        </Link>

        <QuickOrderLinksPanel />
      </div>
    </div>
  );
}
