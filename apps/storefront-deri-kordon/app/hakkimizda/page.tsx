"use client";

import { motion } from "framer-motion";
import { 
  Users, 
  Award, 
  Clock, 
  Heart, 
  Shield, 
  Target,
  Gem,
  Hammer
} from "lucide-react";
import Image from "next/image";

export default function HakkimizdaPage() {
  const stats = [
    { 
      icon: Clock, 
      value: "7+", 
      label: "Yıllık Tecrübe",
      description: "2018'den beri hizmetinizde"
    },
    { 
      icon: Users, 
      value: "50K+", 
      label: "Mutlu Müşteri",
      description: "Türkiye ve dünya genelinde"
    },
    { 
      icon: Award, 
      value: "25+", 
      label: "Usta Zanaatkar",
      description: "Deneyimli kadromuz"
    },
    { 
      icon: Gem, 
      value: "100%", 
      label: "El Yapımı",
      description: "Geleneksel tekniklerle"
    },
  ];

  const values = [
    {
      icon: Target,
      title: "Kalite",
      description: "Sadece en iyi full-grain derileri kullanıyor, her ürünü titizlikle kontrol ediyoruz."
    },
    {
      icon: Hammer,
      title: "Ustalık",
      description: "Her dikişte yılların tecrübesi, her üründe usta işçiliği."
    },
    {
      icon: Shield,
      title: "Şeffaflık",
      description: "Üretim sürecimiz hakkında her şeyi açıkça paylaşıyoruz."
    },
    {
      icon: Heart,
      title: "Müşteri Odaklılık",
      description: "Sizin memnuniyetiniz bizim en büyük önceliğimiz."
    },
  ];

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      {/* Hero Section */}
      <section className="relative py-24 lg:py-32 bg-[#0F1626] overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>
        
        <div className="container-premium relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-3 text-[#8A6B37] text-xs font-medium tracking-[0.3em] uppercase mb-6"
            >
              <span className="w-8 h-px bg-[#8A6B37]" />
              Hikayemiz
              <span className="w-8 h-px bg-[#8A6B37]" />
            </motion.span>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="font-serif text-4xl md:text-5xl lg:text-6xl text-white mb-6"
            >
              Deri Kordon
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-white/60 text-lg max-w-2xl mx-auto"
            >
              Geleneksel el sanatlarını modern tasarım anlayışıyla birleştirerek, 
              her bir ürünümüzde benzersiz bir hikaye yaratıyoruz.
            </motion.p>
            
            {/* Floating Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-[#8A6B37] px-8 py-4"
            >
              <span className="text-white text-sm font-medium tracking-wider uppercase">
                Est. 2018 — Ordu
              </span>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="pt-24 pb-16 lg:pt-32 lg:pb-24">
        <div className="container-premium">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="text-center p-6 bg-white border border-[#E5E2DE] hover:border-[#8A6B37]/50 transition-colors"
              >
                <div className="w-14 h-14 mx-auto mb-4 bg-[#8A6B37]/10 flex items-center justify-center">
                  <stat.icon className="w-7 h-7 text-[#8A6B37]" />
                </div>
                <div className="font-serif text-3xl lg:text-4xl text-[#0F1626] mb-1">
                  {stat.value}
                </div>
                <div className="text-sm font-medium text-[#0F1626] uppercase tracking-wider mb-1">
                  {stat.label}
                </div>
                <div className="text-xs text-[#0F1626]/50">
                  {stat.description}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="container-premium">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Image */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              <div className="aspect-[4/5] bg-[#E5E2DE] relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center text-[#0F1626]/20">
                  <span className="text-lg">Atölye Görseli</span>
                </div>
                {/* Decorative Frame */}
                <div className="absolute inset-4 border border-[#8A6B37]/30" />
              </div>
              {/* Floating Element */}
              <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-[#8A6B37] flex items-center justify-center">
                <div className="text-center">
                  <span className="block font-serif text-2xl text-white">7+</span>
                  <span className="block text-white/70 text-xs uppercase tracking-wider">Yıl</span>
                </div>
              </div>
            </motion.div>

            {/* Content */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <span className="text-[#8A6B37] text-xs font-medium tracking-[0.2em] uppercase block mb-4">
                Hikayemiz
              </span>
              <h2 className="font-serif text-3xl lg:text-4xl text-[#0F1626] mb-6">
                Gelenekten Geleceğe
              </h2>
              <div className="space-y-4 text-[#0F1626]/70 leading-relaxed">
                <p>
                  2018 yılında Ordu&apos;da küçük bir atölyede başlayan yolculuğumuz, 
                  geleneksel deri işçiliğine olan tutkumuzla şekillendi. Dedelerimizden 
                  öğrendiğimiz teknikleri, modern tasarım anlayışıyla harmanlayarak 
                  benzersiz ürünler yaratıyoruz.
                </p>
                <p>
                  Her bir ürünümüz, seçkin deri ustalarımızın ellerinde şekilleniyor. 
                  Saddle stitch tekniğiyle dikilen her dikişte, yılların tecrübesi ve 
                  özenli işçilik yatıyor.
                </p>
                <p>
                  Bugün Türkiye&apos;nin dört bir yanına ve dünyanın birçok ülkesine 
                  ulaşan ürünlerimizle, kalite ve estetiği bir arada sunmaya devam 
                  ediyoruz.
                </p>
              </div>
              
              {/* Signature */}
              <div className="mt-8 pt-8 border-t border-[#E5E2DE]">
                <p className="font-serif text-xl text-[#0F1626] italic">
                  &ldquo;Kalite tesadüf değil, tercihtir.&rdquo;
                </p>
                <p className="text-sm text-[#0F1626]/50 mt-2">
                  — Deri Kordon Kurucusu
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-16 lg:py-24 bg-[#0F1626]">
        <div className="container-premium">
          <div className="text-center mb-16">
            <span className="text-[#8A6B37] text-xs font-medium tracking-[0.2em] uppercase block mb-4">
              Değerlerimiz
            </span>
            <h2 className="font-serif text-3xl lg:text-4xl text-white">
              Bizi Biz Yapanlar
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 bg-[#1A2332] border border-[#8A6B37]/20 hover:border-[#8A6B37]/40 transition-colors"
              >
                <div className="w-12 h-12 bg-[#8A6B37]/10 flex items-center justify-center mb-4">
                  <value.icon className="w-6 h-6 text-[#8A6B37]" />
                </div>
                <h3 className="font-serif text-xl text-white mb-2">{value.title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Craftsmanship Section */}
      <section className="py-16 lg:py-24">
        <div className="container-premium">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="order-2 lg:order-1"
            >
              <span className="text-[#8A6B37] text-xs font-medium tracking-[0.2em] uppercase block mb-4">
                İşçilik
              </span>
              <h2 className="font-serif text-3xl lg:text-4xl text-[#0F1626] mb-6">
                Ustalık Her Aşamada
              </h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-[#8A6B37]/10 flex items-center justify-center flex-shrink-0">
                    <span className="font-serif text-lg text-[#8A6B37]">01</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-[#0F1626] mb-1">Malzeme Seçimi</h3>
                    <p className="text-sm text-[#0F1626]/60">
                      Sadece en kaliteli full-grain derileri kullanıyoruz.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-[#8A6B37]/10 flex items-center justify-center flex-shrink-0">
                    <span className="font-serif text-lg text-[#8A6B37]">02</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-[#0F1626] mb-1">El İşçiliği</h3>
                    <p className="text-sm text-[#0F1626]/60">
                      Her ürün deneyimli ustalarımızın ellerinden geçiyor.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-[#8A6B37]/10 flex items-center justify-center flex-shrink-0">
                    <span className="font-serif text-lg text-[#8A6B37]">03</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-[#0F1626] mb-1">Kalite Kontrol</h3>
                    <p className="text-sm text-[#0F1626]/60">
                      Her ürün gönderimden önce titizlikle kontrol ediliyor.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Image */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="order-1 lg:order-2"
            >
              <div className="aspect-square bg-[#E5E2DE] relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center text-[#0F1626]/20">
                  <span className="text-lg">İşçilik Detayı</span>
                </div>
                {/* Decorative Frame */}
                <div className="absolute inset-4 border border-[#8A6B37]/30" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 bg-[#8A6B37]">
        <div className="container-premium">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="font-serif text-3xl lg:text-4xl text-white mb-4">
              Koleksiyonumuzu Keşfedin
            </h2>
            <p className="text-white/80 mb-8">
              Her bir ürünümüzde ustalık ve tutkuyu bulacaksınız. 
              Siz de kaliteye adım atın.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/urunler"
                className="px-8 py-4 bg-white text-[#0F1626] font-medium uppercase tracking-wider text-sm hover:bg-[#0F1626] hover:text-white transition-colors"
              >
                Ürünleri İncele
              </a>
              <a
                href="/iletisim"
                className="px-8 py-4 border border-white text-white font-medium uppercase tracking-wider text-sm hover:bg-white hover:text-[#8A6B37] transition-colors"
              >
                Bize Ulaşın
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
