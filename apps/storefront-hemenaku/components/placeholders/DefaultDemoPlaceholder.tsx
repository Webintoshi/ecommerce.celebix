import type { DefaultPlaceholderId } from "@/lib/default-demo-theme";
import { DEFAULT_DEMO_THEME } from "@/lib/default-demo-theme";
import { cn } from "@/lib/utils";

const placeholderCopy: Record<DefaultPlaceholderId, string> = {
  "placeholder-01": "Hero vitrin",
  "placeholder-02": "Koleksiyon detayi",
  "placeholder-03": "Yeni gelenler",
  "placeholder-04": "Cok satanlar",
  "placeholder-05": "Hediye fikirleri",
  "placeholder-06": "Gunluk seckiler",
  "placeholder-07": "Signature urun",
  "placeholder-08": "Gunluk favori",
  "placeholder-09": "Hediye secimi",
  "placeholder-10": "Sezon parcasi",
  "placeholder-11": "Blog kapagi",
  "placeholder-12": "Bos durum",
};

const accentById: Record<DefaultPlaceholderId, string> = {
  "placeholder-01": "from-[#102A43] via-[#0F766E] to-[#FDE68A]",
  "placeholder-02": "from-[#111827] via-[#2563EB] to-[#99F6E4]",
  "placeholder-03": "from-[#0F766E] via-[#99F6E4] to-[#FFF7ED]",
  "placeholder-04": "from-[#16213E] via-[#0F766E] to-[#FDBA74]",
  "placeholder-05": "from-[#7C2D12] via-[#EA580C] to-[#FEF3C7]",
  "placeholder-06": "from-[#134E4A] via-[#64748B] to-[#E0F2FE]",
  "placeholder-07": "from-[#111827] via-[#0F766E] to-[#FDE68A]",
  "placeholder-08": "from-[#1E293B] via-[#2563EB] to-[#CFFAFE]",
  "placeholder-09": "from-[#7C2D12] via-[#0F766E] to-[#FFEDD5]",
  "placeholder-10": "from-[#16213E] via-[#64748B] to-[#E2E8F0]",
  "placeholder-11": "from-[#111827] via-[#0F766E] to-[#FDBA74]",
  "placeholder-12": "from-[#F7FAF9] via-[#CCFBF1] to-[#FDBA74]",
};

type DefaultDemoPlaceholderProps = {
  id: DefaultPlaceholderId;
  label?: string;
  className?: string;
  compact?: boolean;
};

export function DefaultDemoPlaceholder({
  id,
  label,
  className,
  compact = false,
}: DefaultDemoPlaceholderProps) {
  const resolvedLabel = label || placeholderCopy[id];

  return (
    <div
      className={cn(
        "relative isolate flex h-full w-full overflow-hidden bg-gradient-to-br",
        accentById[id],
        className,
      )}
      aria-label={resolvedLabel}
      role="img"
    >
      <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(135deg,rgba(255,255,255,0.42)_0%,transparent_34%),linear-gradient(315deg,rgba(17,24,39,0.2)_0%,transparent_42%)]" />
      <div className="absolute left-5 top-5 h-16 w-24 border border-white/35" />
      <div className="absolute bottom-5 right-5 h-20 w-28 border border-white/20" />
      <div className="absolute inset-x-6 bottom-6 top-6 rounded-lg border border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] backdrop-blur-[1px]" />
      <div className="relative z-10 flex h-full w-full flex-col justify-end p-5 text-white">
        <span className="w-fit rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[10px] font-semibold uppercase text-white/88 backdrop-blur">
          Hemenaku
        </span>
        <p
          className={cn(
            "mt-3 max-w-[14rem] font-serif font-semibold leading-none",
            compact ? "text-xl" : "text-3xl sm:text-4xl",
          )}
        >
          {resolvedLabel}
        </p>
        <p className="mt-3 max-w-[14rem] text-xs font-medium leading-5 text-white/72">
          {DEFAULT_DEMO_THEME.heroEyebrow}
        </p>
      </div>
    </div>
  );
}
