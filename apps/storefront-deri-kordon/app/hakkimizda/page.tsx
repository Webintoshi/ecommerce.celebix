"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  Target,
  Eye,
  Check,
  ArrowRight,
} from "lucide-react";

const whyUsItems = [
  {
    title: "Kaliteli Malzemeler",
    description: "%100 hakiki sığır derisi (full-grain)",
  },
  {
    title: "El İşçiliği",
    description:
      "Ürünlerimiz, el yapımı olmaları nedeniyle benzersizdir ve her birinde ustalığın izlerini taşır.",
  },
  {
    title: "Özgün Tasarımlar",
    description:
      "Ürünlerimizi kişiselleştirme imkânı sunuyoruz. İster monogram ekleyin, ister özel renkler seçin, tarzınıza uygun bir ürün yaratmanıza yardımcı oluyoruz.",
  },
  {
    title: "Sürdürülebilirlik",
    description:
      "Kullandığımız deri malzemeler, çevre dostu ve uzun ömürlüdür. Ürünlerimiz, hem doğaya saygılı hem de kaliteli bir seçenektir.",
  },
  {
    title: "Müşteri Memnuniyeti",
    description:
      "Kaliteli ürünlerimiz, hızlı teslimat ve 7/24 destek ekibimizle her zaman yanınızdayız. Sizi mutlu etmek için buradayız!",
  },
];

export default function HakkimizdaPage() {
  return (
    <main className="min-h-screen bg-[#F8F8F8]">
      {/* ── Hero ── */}
      <section className="pt-20 pb-12 sm:pt-28 sm:pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-block text-xs text-neutral-400 uppercase tracking-[0.2em] mb-6"
          >
            Hakkımızda
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-medium text-neutral-900 mb-6 tracking-tight"
          >
            DeryCraft Stil Dünyasına Hoş Geldiniz
          </motion.h1>
        </div>
      </section>

      {/* ── Story ── */}
      <section className="pb-16 sm:pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-10"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-900">
                <BookOpen className="w-5 h-5 stroke-[1.5]" />
              </div>
              <h2 className="text-xl sm:text-2xl font-medium text-neutral-900">
                Markamızın Hikâyesi
              </h2>
            </div>
            <div className="space-y-5 text-neutral-600 leading-relaxed">
              <p>
                <strong className="text-neutral-900">DERYCRAFT</strong>, deri
                ürünlerde kalite, şıklık ve dayanıklılığı bir araya getirme
                tutkusuyla kuruldu. Sektördeki{" "}
                <strong className="text-neutral-900">8 yıllık</strong>{" "}
                deneyimiyle geleneksel el işçiliği ile modern tasarımları
                birleştirerek, her bir ürünümüzde özen ve titizlikle
                çalışıyoruz.
              </p>
              <p>
                Amacımız, sadece bir ürün değil, bir hikâye sunmak; günlük
                yaşantınıza eşlik edecek, özel anılarınıza değer katacak deri
                ürünler yapmaktır.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Mission & Vision ── */}
      <section className="pb-16 sm:pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-10"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-900">
                  <Target className="w-5 h-5 stroke-[1.5]" />
                </div>
                <h2 className="text-xl sm:text-2xl font-medium text-neutral-900">
                  Misyonumuz
                </h2>
              </div>
              <p className="text-neutral-600 leading-relaxed">
                Misyonumuz, doğanın bize sunduğu en değerli malzemelerden biri
                olan deriyi özenle işleyerek sizlere ulaştırmaktır. Her bir
                ürünümüz, uzun yıllar kullanılabilecek şekilde tasarlanır ve
                üretilir. Müşteri memnuniyetini her zaman ön planda tutarak,
                kaliteli hizmet ve özgün tasarımlarla fark yaratmayı
                hedefliyoruz. Kalite, güven ve özgünlük her adımımızın
                temelini oluşturur.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-10"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-900">
                  <Eye className="w-5 h-5 stroke-[1.5]" />
                </div>
                <h2 className="text-xl sm:text-2xl font-medium text-neutral-900">
                  Vizyonumuz
                </h2>
              </div>
              <p className="text-neutral-600 leading-relaxed">
                Vizyonumuz, deri ürünler sektöründe sadece bir marka değil, bir
                yaşam tarzı yaratmaktır. Yerel değerlerimizi evrensel bir
                bakışla birleştirerek, dünya çapında tanınan ve güvenilen bir
                marka olmayı amaçlıyoruz. Sürdürülebilir üretim yöntemleriyle
                doğaya saygı duyarak, gelecek nesillere daha yaşanılabilir bir
                dünya bırakmayı hedefliyoruz.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Why Choose Us ── */}
      <section className="pb-16 sm:pb-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-medium text-neutral-900 mb-3">
              Neden Bizi Tercih Etmelisiniz?
            </h2>
            <p className="text-neutral-500">
              Kalite, ustalık ve sürdürülebilirlik bir arada.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {whyUsItems.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="bg-white border border-neutral-200 rounded-2xl p-6 transition-all hover:shadow-md hover:-translate-y-1"
              >
                <div className="w-8 h-8 mb-4 flex items-center justify-center rounded-full bg-neutral-900 text-white">
                  <Check className="w-4 h-4 stroke-[2]" />
                </div>
                <h3 className="text-base font-medium text-neutral-900 mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-neutral-600 leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="pb-20 sm:pb-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden rounded-3xl bg-neutral-900 p-8 sm:p-12 text-center"
          >
            {/* Decorative blur orbs */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full blur-2xl transform -translate-x-1/2 translate-y-1/2" />

            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl font-medium text-white mb-4">
                Koleksiyonumuzu Keşfedin
              </h2>
              <p className="text-neutral-400 mb-8 max-w-md mx-auto">
                Her ürünümüzde ustalık ve tutkuyu bulacaksınız.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/urunler"
                  className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-neutral-900 rounded-xl font-medium hover:bg-neutral-100 transition-colors"
                >
                  Ürünleri İncele
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/iletisim"
                  className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-transparent text-white border border-white/20 rounded-xl font-medium hover:bg-white/10 transition-colors"
                >
                  Bize Ulaşın
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
