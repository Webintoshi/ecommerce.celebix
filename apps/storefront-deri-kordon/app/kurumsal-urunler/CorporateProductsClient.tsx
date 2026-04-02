"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Award,
  Palette,
  Truck,
  Leaf,
  Headphones,
  Sparkles,
  ChevronDown,
} from "lucide-react";

const FAQS = [
  {
    q: "Teslimat Süresi Ne Kadar?",
    a: "Ürünlerimizin üretim süresi, seçtiğiniz ürün türü ve kişiselleştirme taleplerinize bağlı olarak değişiklik göstermektedir. Tam teslimat süresi hakkında bilgi almak için bizimle iletişime geçebilirsiniz.",
  },
  {
    q: "Numune Gönderiyor Musunuz?",
    a: "Evet, numune talebiniz üzerine size örnek ürünler gönderebiliriz. Ayrıca, atölyemize davet ederek ürünleri yerinde incelemeniz de mümkündür.",
  },
  {
    q: "Minimum sipariş miktarı var mı?",
    a: "Evet, ihtiyacınıza özel ürünler geliştirebiliriz. Kurumsal talepleriniz doğrultusunda sizinle birlikte AR-GE süreci yürütmekten memnuniyet duyarız.",
  },
  {
    q: "Ürünleri kişiselleştirmek için hangi seçenekleri sunuyorsunuz?",
    a: "Markanızın logosu, çalışan isimleri, özel mesajlar veya sloganlar gibi özelleştirmeleri ürünlerimize işleyebiliriz. Kişiselleştirme seçeneklerimiz hakkında daha fazla bilgi için bizimle iletişime geçebilirsiniz.",
  },
  {
    q: "Toplu siparişlerde indirim var mı?",
    a: "Evet, toplu siparişlerde daha uygun fiyat seçenekleri sunuyoruz. Sipariş sayınıza göre size özel bir teklif hazırlayabiliriz. Detaylar için bizimle iletişime geçin!",
  },
  {
    q: "Kişiselleştirilmiş siparişlerde iade veya değişim yapabilir miyiz?",
    a: "Kişiselleştirilmiş ürünlerde iade veya değişim yapılmamaktadır. Ancak, ürününüzle ilgili herhangi bir sorun yaşamanız durumunda, en iyi çözümü bulmak için bizimle iletişime geçebilirsiniz.",
  },
];

const WHY_US = [
  { icon: Award, title: "Yüksek Kalite" },
  { icon: Palette, title: "Kişiselleştirme" },
  { icon: Truck, title: "Zamanında ve Hızlı Teslimat" },
  { icon: Leaf, title: "Çevre Dostu Üretim Süreci" },
  { icon: Headphones, title: "Güvenilir Müşteri Desteği" },
  { icon: Sparkles, title: "Benzersiz Tasarımlar" },
];

export default function CorporateProductsClient() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <>
      {/* Why Us */}
      <section className="py-16 lg:py-20">
        <div className="container-premium">
          <div className="text-center mb-10">
            <span className="text-neutral-500 text-xs font-medium tracking-[0.2em] uppercase block mb-2">
              Avantajlar
            </span>
            <h2 className="text-2xl sm:text-3xl text-neutral-900 tracking-tight">
              NEDEN BİZİ TERCİH ETMELİSİNİZ?
            </h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
            {WHY_US.map(({ icon: Icon, title }, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-neutral-200 p-6 flex items-start gap-4"
              >
                <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-[#8A6B37] stroke-[1.5]" />
                </div>
                <p className="text-sm font-medium text-neutral-900 leading-snug pt-2">
                  {title}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 lg:py-20 bg-white border-y border-neutral-200">
        <div className="container-premium max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-neutral-500 text-xs font-medium tracking-[0.2em] uppercase block mb-2">
              Yardım
            </span>
            <h2 className="text-2xl sm:text-3xl text-neutral-900 tracking-tight">
              SIKÇA SORULAN SORULAR
            </h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, idx) => {
              const isOpen = openIndex === idx;
              return (
                <div
                  key={idx}
                  className="bg-[#F8F8F8] rounded-xl border border-neutral-200 overflow-hidden"
                >
                  <button
                    onClick={() => toggle(idx)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left"
                  >
                    <span className="text-sm font-medium text-neutral-900 pr-4">
                      {faq.q}
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 text-neutral-500 flex-shrink-0 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-4 text-sm text-neutral-600 leading-relaxed">
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 lg:py-20">
        <div className="container-premium">
          <div className="bg-neutral-900 rounded-2xl px-6 py-12 lg:py-16 text-center">
            <h2 className="text-2xl sm:text-3xl text-white tracking-tight mb-3">
              Kurumsal Teklif Alın
            </h2>
            <p className="text-neutral-400 max-w-xl mx-auto mb-6">
              Size özel çözümler ve fiyatlandırma için hemen iletişime geçin.
            </p>
            <Link
              href="/iletisim"
              className="inline-flex items-center justify-center px-8 py-3.5 bg-[#8A6B37] text-white text-sm font-medium uppercase tracking-wide rounded-full hover:bg-[#755a2d] transition-colors"
            >
              TEKLİF AL
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
