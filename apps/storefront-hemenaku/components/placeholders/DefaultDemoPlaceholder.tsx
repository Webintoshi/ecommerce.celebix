import type { DefaultPlaceholderId } from "@/lib/default-demo-theme";
import { DEFAULT_DEMO_THEME } from "@/lib/default-demo-theme";
import { cn } from "@/lib/utils";

const placeholderCopy: Record<DefaultPlaceholderId, string> = {
  "placeholder-01": "Akü ve enerji vitrini",
  "placeholder-02": "Araç uyumluluğu",
  "placeholder-03": "Aküler",
  "placeholder-04": "Oto elektrik",
  "placeholder-05": "Şarj ve bakım",
  "placeholder-06": "Aksesuarlar",
  "placeholder-07": "Akü görseli hazırlanıyor",
  "placeholder-08": "Elektrik ürünü hazırlanıyor",
  "placeholder-09": "Şarj ürünü hazırlanıyor",
  "placeholder-10": "Aksesuar görseli hazırlanıyor",
  "placeholder-11": "Hemenaku rehberi",
  "placeholder-12": "Sepetiniz hazır",
};

const accentById: Record<DefaultPlaceholderId, string> = {
  "placeholder-01": "from-[#07111F] via-[#0F172A] to-[#22412F]",
  "placeholder-02": "from-[#0B1220] via-[#123A55] to-[#1F9D55]",
  "placeholder-03": "from-[#0F172A] via-[#1E293B] to-[#FACC15]",
  "placeholder-04": "from-[#111827] via-[#164E63] to-[#22C55E]",
  "placeholder-05": "from-[#0B1220] via-[#334155] to-[#FDE047]",
  "placeholder-06": "from-[#182033] via-[#14532D] to-[#86EFAC]",
  "placeholder-07": "from-[#0F172A] via-[#1F2937] to-[#FACC15]",
  "placeholder-08": "from-[#111827] via-[#0E7490] to-[#22C55E]",
  "placeholder-09": "from-[#0B1220] via-[#475569] to-[#FDE047]",
  "placeholder-10": "from-[#1E293B] via-[#0F766E] to-[#BBF7D0]",
  "placeholder-11": "from-[#111827] via-[#1E293B] to-[#FACC15]",
  "placeholder-12": "from-[#F8FAFC] via-[#D9F99D] to-[#FACC15]",
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
      <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(135deg,rgba(255,255,255,0.2)_0%,transparent_34%),linear-gradient(315deg,rgba(34,197,94,0.18)_0%,transparent_38%)]" />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="absolute right-5 top-5 flex h-16 w-24 items-center justify-center rounded-md border border-white/30 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
        <div className="h-8 w-14 rounded-sm border border-white/55 bg-white/10">
          <div className="h-full w-3/5 bg-white/22" />
        </div>
        <div className="ml-1 h-4 w-1.5 rounded-r-sm bg-white/55" />
      </div>
      <div className="absolute bottom-7 right-6 h-20 w-28 rounded-lg border border-white/20 bg-white/10" />
      <div className="absolute bottom-11 right-12 h-1 w-24 bg-[#FACC15]/75 shadow-[0_0_22px_rgba(250,204,21,0.42)]" />
      <div className="absolute bottom-16 right-16 h-1 w-16 bg-[#22C55E]/75 shadow-[0_0_22px_rgba(34,197,94,0.38)]" />
      <div className="relative z-10 flex h-full w-full flex-col justify-end p-5 text-white">
        <span className="w-fit border border-white/25 bg-white/12 px-3 py-1 text-[10px] font-semibold uppercase text-white/88 backdrop-blur">
          Hemenaku enerji
        </span>
        <p
          className={cn(
            "mt-3 max-w-[14rem] font-semibold leading-tight",
            compact ? "text-lg" : "text-2xl sm:text-3xl",
          )}
        >
          {resolvedLabel}
        </p>
        <p className="mt-3 max-w-[14rem] text-xs font-medium leading-5 text-white/74">
          {DEFAULT_DEMO_THEME.heroEyebrow}
        </p>
      </div>
    </div>
  );
}
