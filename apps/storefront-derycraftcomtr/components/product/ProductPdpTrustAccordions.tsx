"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

type AccordionItem = {
  id: string;
  label: string;
  content: ReactNode;
};

type ProductPdpTrustAccordionsProps = {
  openIds: Set<string>;
  onToggle: (id: string) => void;
  hasCustomization?: boolean;
};

export function ProductPdpTrustAccordions({
  openIds,
  onToggle,
  hasCustomization = false,
}: ProductPdpTrustAccordionsProps) {
  const items: AccordionItem[] = [
    {
      id: "trust-shipping",
      label: "Ödeme ve Kargo",
      content: (
        <div className="space-y-2 text-sm text-neutral-600">
          <p>3D Secure ile kredi / banka kartı ve havale / EFT ile ödeme yapabilirsiniz.</p>
          <p>
            <strong className="text-neutral-800">Teslimat:</strong> 1–3 iş günü hazırlık + 2–4 iş
            günü kargo süresi.
          </p>
          <p>Kargo partneri teslimat adresine göre değişebilir.</p>
        </div>
      ),
    },
    {
      id: "trust-returns",
      label: "Garanti ve İade",
      content: (
        <div className="space-y-2 text-sm text-neutral-600">
          <p>
            <strong className="text-neutral-800">14 gün içinde iade hakkı</strong> — kişiselleştirilmiş
            ürünlerde iade yapılamaz.
          </p>
          <p>El işçiliği kalitesi garantisi sunuyoruz.</p>
          <p>İade kargo ücreti alıcı tarafından karşılanır.</p>
        </div>
      ),
    },
    {
      id: "trust-gift",
      label: hasCustomization ? "Hediye ve Kişiselleştirme" : "Hediye Paketleme",
      content: (
        <div className="space-y-2 text-sm text-neutral-600">
          {hasCustomization ? (
            <p>
              Kişiselleştirme seçenekleri ürün sayfasından yönetilir. Ön izleme temsilidir; metin
              baskı alanına okunaklı şekilde uygulanır.
            </p>
          ) : null}
          <p>Özenli paketleme ile gönderim yapılır. Kurumsal hediye talepleri için iletişime geçebilirsiniz.</p>
        </div>
      ),
    },
  ];

  return (
    <div className="divide-y divide-[#E8DFD3] rounded-2xl border border-[#E8DFD3] bg-white">
      {items.map((item) => {
        const isOpen = openIds.has(item.id);
        return (
          <div key={item.id}>
            <button
              type="button"
              onClick={() => onToggle(item.id)}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left text-[0.72rem] font-medium uppercase tracking-[0.12em] text-[#12100D]"
            >
              {item.label}
              <ChevronDown
                className={`h-4 w-4 text-[#6B5F54] transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4">{item.content}</div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
