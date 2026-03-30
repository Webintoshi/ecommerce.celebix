export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0F1626]/5 to-[#8A6B37]/10">
      <div className="text-center">
        <div className="mb-8 flex justify-center">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-[26px] border border-[#8A6B37]/20 bg-white shadow-[0_18px_45px_rgba(15,22,38,0.12)]">
            <div className="absolute inset-0 rounded-[26px] border-2 border-transparent border-t-[#8A6B37] animate-spin" />
            <span className="pl-1 text-2xl font-semibold tracking-[0.28em] text-[#0F1626]">
              DK
            </span>
          </div>
        </div>

        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-[#8A6B37]">
          Deri Kordon
        </p>
        <h2 className="mb-4 text-2xl font-bold text-[#0F1626]">Yükleniyor...</h2>
        <p className="text-sm text-[#0F1626]/60">Sayfa hazırlanıyor, lütfen bekleyin.</p>

        <div className="mt-8 flex justify-center">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#0F1626]/8">
            <div className="h-full w-1/2 rounded-full bg-[#8A6B37] animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
