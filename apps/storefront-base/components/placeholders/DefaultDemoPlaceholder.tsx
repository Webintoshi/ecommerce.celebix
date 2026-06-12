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
  "placeholder-01": "from-[#2F1D14] via-[#8A6847] to-[#F3D8B5]",
  "placeholder-02": "from-[#0B1120] via-[#475569] to-[#F6D7A7]",
  "placeholder-03": "from-[#B08968] via-[#E6CCB2] to-[#FFF9F2]",
  "placeholder-04": "from-[#2B211B] via-[#8A6847] to-[#C7A985]",
  "placeholder-05": "from-[#743E2B] via-[#C7A985] to-[#FFF4DF]",
  "placeholder-06": "from-[#1F2937] via-[#7C9082] to-[#F2E8D8]",
  "placeholder-07": "from-[#1C1917] via-[#8A6847] to-[#F4E4CF]",
  "placeholder-08": "from-[#3F2A22] via-[#B98D5E] to-[#FFE9C7]",
  "placeholder-09": "from-[#4B2E2A] via-[#C7A985] to-[#FFF9F2]",
  "placeholder-10": "from-[#111827] via-[#7C6F64] to-[#EAD7C0]",
  "placeholder-11": "from-[#140D08] via-[#8A6847] to-[#F4D4A8]",
  "placeholder-12": "from-[#F6F1EB] via-[#E7D9C7] to-[#C7A985]",
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
      <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_22%_18%,rgba(255,255,255,0.55),transparent_24%),radial-gradient(circle_at_78%_72%,rgba(20,13,8,0.22),transparent_28%)]" />
      <div className="absolute -left-10 top-1/4 h-36 w-36 rounded-full border border-white/35" />
      <div className="absolute -right-8 bottom-1/4 h-44 w-44 rounded-full border border-white/20" />
      <div className="absolute inset-x-6 bottom-6 top-6 rounded-[28px] border border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] backdrop-blur-[1px]" />
      <div className="relative z-10 flex h-full w-full flex-col justify-end p-5 text-white">
        <span className="w-fit rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/88 backdrop-blur">
          {id}
        </span>
        <p
          className={cn(
            "mt-3 max-w-[14rem] font-serif font-semibold leading-none tracking-[-0.04em]",
            compact ? "text-2xl" : "text-4xl sm:text-5xl",
          )}
        >
          {resolvedLabel}
        </p>
        <p className="mt-3 max-w-[14rem] text-xs font-medium leading-5 text-white/72">
          {DEFAULT_DEMO_THEME.name} placeholder
        </p>
      </div>
    </div>
  );
}
