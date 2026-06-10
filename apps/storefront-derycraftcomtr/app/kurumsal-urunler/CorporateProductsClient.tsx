"use client";

import Link from "next/link";
import {
  Award,
  Headphones,
  Leaf,
  Palette,
  Sparkles,
  Truck,
  ArrowUpRight,
} from "lucide-react";
import { FaqAccordion } from "@/components/faq/FaqAccordion";
import { DEFAULT_FLOATING_FAQ_ITEMS } from "@/lib/floating-faq";
import { CORPORATE_WHY_US_ITEMS } from "@/lib/corporate-products";

const WHY_US_ICONS = [Award, Palette, Truck, Leaf, Headphones, Sparkles] as const;

type CorporateProductsClientProps = {
  contactHref: string;
};

export default function CorporateProductsClient({
  contactHref,
}: CorporateProductsClientProps) {
  return (
    <>
      <section className="bg-[#FAF7F2] py-14 sm:py-16 lg:py-20">
        <div className="container-premium">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B6914]">
              Avantajlar
            </p>
            <h2 className="mt-3 font-serif text-2xl text-[#12100D] sm:text-3xl">
              Neden bizi tercih etmelisiniz?
            </h2>
          </div>

          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {CORPORATE_WHY_US_ITEMS.map((item, index) => {
              const Icon = WHY_US_ICONS[index] ?? Award;

              return (
                <div
                  key={item.key}
                  className="flex items-center gap-4 rounded-[1.25rem] border border-[#E8DFD3] bg-white px-5 py-5"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E8DFD3] bg-[#FBF8F4] text-[#8A6B37]">
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <p className="text-sm font-medium leading-snug text-[#12100D]">
                    {item.title}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-[#E8DFD3] bg-white py-14 sm:py-16 lg:py-20">
        <div className="container-premium">
          <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B6914]">
              Yardım
            </p>
            <h2 className="mt-3 font-serif text-2xl text-[#12100D] sm:text-3xl">
              Sıkça sorulan sorular
            </h2>
            <p className="mt-4 text-sm leading-7 text-neutral-600">
              Sipariş, teslimat, kişiselleştirme ve kurumsal talepler hakkında en sık sorulan
              soruları derledik.
            </p>
          </div>

          <div className="mx-auto max-w-3xl overflow-hidden rounded-[1.5rem] border border-[#E8DFD3] bg-[#FAF7F2] shadow-[0_24px_60px_-40px_rgba(18,16,13,0.18)]">
            <div className="h-px bg-gradient-to-r from-transparent via-[#C4A062] to-transparent" />
            <FaqAccordion items={DEFAULT_FLOATING_FAQ_ITEMS} />
          </div>
        </div>
      </section>

      <section className="bg-[#FAF7F2] py-14 sm:py-16 lg:py-20">
        <div className="container-premium">
          <div className="mx-auto max-w-3xl rounded-[1.75rem] border border-[#E8DFD3] bg-[#12100D] px-6 py-10 text-center sm:px-10 sm:py-12">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#C4A062]">
              Kurumsal teklif
            </p>
            <h2 className="mt-3 font-serif text-2xl text-white sm:text-[1.75rem]">
              Markanıza özel çözümler için bize ulaşın
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-neutral-400">
              Size özel fiyatlandırma, kişiselleştirme ve toplu sipariş planlaması için ekibimiz
              yanınızda.
            </p>
            <Link
              href={contactHref}
              className="mt-7 inline-flex items-center gap-2 border border-[#8A6B37] bg-[#8A6B37] px-8 py-3.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition-colors hover:border-[#755a2d] hover:bg-[#755a2d]"
            >
              Teklif al
              <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
