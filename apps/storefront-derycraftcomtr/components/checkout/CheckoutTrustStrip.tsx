import { Lock, Scissors, Truck } from "lucide-react";

const TRUST_ITEMS = [
  {
    icon: Lock,
    title: "Güvenli ödeme",
    description: "256-bit SSL ve 3D Secure",
  },
  {
    icon: Truck,
    title: "Hızlı kargo",
    description: "1–3 iş günü içinde hazırlık",
  },
  {
    icon: Scissors,
    title: "El yapımı üretim",
    description: "Atölyemizde özenle hazırlanır",
  },
] as const;

export function CheckoutTrustStrip() {
  return (
    <div className="border-b border-[#E8DFD3] bg-[#FBF8F4]">
      <div className="container-premium grid gap-4 py-4 sm:grid-cols-3 sm:gap-6 sm:py-5">
        {TRUST_ITEMS.map((item) => (
          <div key={item.title} className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E8DFD3] bg-white text-[#8A6B37]">
              <item.icon className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#12100D]">
                {item.title}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-neutral-600">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
