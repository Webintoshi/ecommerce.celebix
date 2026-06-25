import { QuickOrderLinksPanel } from "@/components/admin/QuickOrderLinksPanel";

export default function QuickOrderLinksPage() {
  return (
    <div className="min-h-screen bg-[#F9F9F9] px-0 py-3 md:py-5">
      <div className="flex w-full flex-col gap-4">
        <QuickOrderLinksPanel />
      </div>
    </div>
  );
}
