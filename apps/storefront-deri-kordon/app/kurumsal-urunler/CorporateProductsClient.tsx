"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Award, ChevronDown, Headphones, Leaf, Palette, Sparkles, Truck } from "lucide-react";

const FAQS = [
  {
    q: "Teslimat süresi ne kadar?",
    a: "Ürünlerimizin üretim süresi, seçtiğiniz ürün türü ve kişiselleştirme taleplerinize göre değişiklik gösterir. Net teslimat süresi için bizimle iletişime geçebilirsiniz.",
  },
  {
    q: "Numune gönderiyor musunuz?",
    a: "Evet. Numune talebiniz üzerine örnek ürünler gönderebiliriz. Dilerseniz atölyemize davet ederek ürünleri yerinde incelemenizi de sağlayabiliriz.",
  },
  {
    q: "Minimum sipariş miktarı var mı?",
    a: "Talep edilen ürün türüne göre minimum adet değişebilir. Kurumsal talebinizi ilettiğinizde sizin için en uygun adet ve teklif yapısını birlikte netleştiririz.",
  },
  {
    q: "Ürünleri kişiselleştirmek için hangi seçenekleri sunuyorsunuz?",
    a: "Logo baskısı, isim, özel mesaj, kutulama ve kurumsal renklere uygun detaylar gibi farklı kişiselleştirme seçenekleri sunuyoruz.",
  },
  {
    q: "Toplu siparişlerde indirim var mı?",
    a: "Evet. Sipariş miktarınıza göre özel fiyatlandırma hazırlıyoruz. Detaylı teklif için bizimle iletişime geçebilirsiniz.",
  },
  {
    q: "Kişiselleştirilmiş siparişlerde iade veya değişim yapabilir miyiz?",
    a: "Kişiselleştirilmiş ürünlerde standart iade ve değişim uygulanmaz. Ancak üretim kaynaklı bir sorun yaşanırsa sizin için en doğru çözümü birlikte planlarız.",
  },
];

const WHY_US = [
  { icon: Award, title: "Yüksek kalite" },
  { icon: Palette, title: "Kişiselleştirme" },
  { icon: Truck, title: "Zamanında teslimat" },
  { icon: Leaf, title: "Özenli üretim süreci" },
  { icon: Headphones, title: "Güvenilir müşteri desteği" },
  { icon: Sparkles, title: "Özgün tasarımlar" },
];

export default function CorporateProductsClient() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex((current) => (current === index ? null : index));
  };

  return (
    <>
      <section className="py-16 lg:py-20">
        <div className="container-premium">
          <div className="mb-10 text-center">
            <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              Avantajlar
            </span>
            <h2 className="text-2xl tracking-tight text-neutral-900 sm:text-3xl">
              Neden bizi tercih etmelisiniz?
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
            {WHY_US.map(({ icon: Icon, title }, index) => (
              <div
                key={index}
                className="flex items-start gap-4 rounded-2xl border border-neutral-200 bg-white p-6"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-neutral-100">
                  <Icon className="h-5 w-5 stroke-[1.5] text-[#8A6B37]" />
                </div>
                <p className="pt-2 text-sm font-medium leading-snug text-neutral-900">{title}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-neutral-200 bg-white py-16 lg:py-20">
        <div className="container-premium mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              Yardım
            </span>
            <h2 className="text-2xl tracking-tight text-neutral-900 sm:text-3xl">
              Sıkça sorulan sorular
            </h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, index) => {
              const isOpen = openIndex === index;

              return (
                <div
                  key={index}
                  className="overflow-hidden rounded-xl border border-neutral-200 bg-[#F8F8F8]"
                >
                  <button
                    type="button"
                    onClick={() => toggle(index)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left"
                  >
                    <span className="pr-4 text-sm font-medium text-neutral-900">{faq.q}</span>
                    <ChevronDown
                      className={`h-5 w-5 flex-shrink-0 text-neutral-500 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
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
                        <div className="px-5 pb-4 text-sm leading-relaxed text-neutral-600">
                          {faq.a}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20">
        <div className="container-premium">
          <div className="rounded-2xl bg-neutral-900 px-6 py-12 text-center lg:py-16">
            <h2 className="mb-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Kurumsal Teklif Alın
            </h2>
            <p className="mx-auto mb-6 max-w-xl text-neutral-400">
              Size özel çözümler ve fiyatlandırma için hemen iletişime geçin.
            </p>
            <Link
              href="/iletisim"
              className="inline-flex items-center justify-center rounded-full bg-[#8A6B37] px-8 py-3.5 text-sm font-medium uppercase tracking-wide text-white transition-colors hover:bg-[#755a2d]"
            >
              Teklif al
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
