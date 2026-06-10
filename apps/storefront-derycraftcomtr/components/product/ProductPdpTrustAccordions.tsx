"use client";

import type { ComponentType } from "react";
import { BadgeCheck, Clock, Hammer, Package, RotateCcw, Sparkles, Truck } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ProductFeatures } from "@/components/product/ProductFeatures";
import type { Product } from "@/types/product";

type ProductPdpTrustAccordionsProps = {
  product: Product;
};

export function ProductPdpTrustAccordions({ product }: ProductPdpTrustAccordionsProps) {
  return (
    <Accordion type="multiple" className="border-t border-neutral-200">
      <AccordionItem value="details" className="border-neutral-200">
        <AccordionTrigger className="py-4 text-sm font-medium uppercase tracking-wide text-neutral-900 hover:no-underline">
          Ürün Detayları
        </AccordionTrigger>
        <AccordionContent className="pb-5">
          <ProductFeatures product={product} />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="production-material" className="border-neutral-200">
        <AccordionTrigger className="py-4 text-sm font-medium uppercase tracking-wide text-neutral-900 hover:no-underline">
          Üretim ve Malzeme
        </AccordionTrigger>
        <AccordionContent className="pb-5">
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <SpecItem icon={Package} label="Malzeme" value="Hakiki full-grain deri" />
            <SpecItem icon={Hammer} label="İşçilik" value="El dikişi ve zanaatkar üretimi" />
            <SpecItem icon={Clock} label="Üretim Süresi" value="1-3 iş günü" />
            <SpecItem icon={BadgeCheck} label="Kalite" value="El yapımı DeryCraft standardı" />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="shipping-delivery" className="border-neutral-200">
        <AccordionTrigger className="py-4 text-sm font-medium uppercase tracking-wide text-neutral-900 hover:no-underline">
          Kargo ve Teslimat
        </AccordionTrigger>
        <AccordionContent className="pb-5">
          <InfoList
            icon={Truck}
            items={[
              "Teslimat adresine göre aktif kargo seçenekleri checkout ekranında gösterilir.",
              "Hazırlık süresi genellikle 1-3 iş günüdür.",
              "Kargo süresi bölgeye göre değişebilir.",
            ]}
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="returns" className="border-neutral-200">
        <AccordionTrigger className="py-4 text-sm font-medium uppercase tracking-wide text-neutral-900 hover:no-underline">
          İade ve Değişim
        </AccordionTrigger>
        <AccordionContent className="pb-5">
          <InfoList
            icon={RotateCcw}
            items={[
              "14 gün içinde kolay iade süreci başlatabilirsiniz.",
              "Kişiye özel üretilen ürünlerde iade koşulları ürün niteliğine göre değerlendirilir.",
              "Ürünü kullanılmamış ve orijinal ambalajında göndermeniz gerekir.",
            ]}
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="care" className="border-neutral-200">
        <AccordionTrigger className="py-4 text-sm font-medium uppercase tracking-wide text-neutral-900 hover:no-underline">
          Bakım Önerileri
        </AccordionTrigger>
        <AccordionContent className="pb-5">
          <InfoList
            icon={Sparkles}
            items={[
              "Deriyi uzun süre direkt güneş ışığında ve yoğun nemde bırakmayın.",
              "Yumuşak, kuru bir bezle nazikçe temizleyin.",
              "Gerektiğinde hakiki deri için uygun bakım ürünleri kullanın.",
            ]}
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

type IconComponent = ComponentType<{ className?: string }>;

function SpecItem({
  icon: Icon,
  label,
  value,
}: {
  icon: IconComponent;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
      <Icon className="h-5 w-5 stroke-[1.5] text-neutral-500" />
      <div>
        <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
        <p className="text-sm font-medium text-neutral-900">{value}</p>
      </div>
    </div>
  );
}

function InfoList({ icon: Icon, items }: { icon: IconComponent; items: string[] }) {
  return (
    <div className="space-y-3 text-sm text-neutral-600">
      {items.map((item) => (
        <div key={item} className="flex items-start gap-3">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 stroke-[1.5] text-[#8A6B37]" />
          <p>{item}</p>
        </div>
      ))}
    </div>
  );
}
