"use client";

import { motion } from "framer-motion";
import { Check, Hammer, Leaf, Shield, Award, Users } from "lucide-react";

const craftsmanshipPoints = [
  {
    icon: Hammer,
    title: "El İşçiliği",
    description: "Her ürün deneyimli ustaların ellerinden tek tek işlenir",
  },
  {
    icon: Leaf,
    title: "Doğal Malzemeler",
    description: "Sadece %100 hakiki deri ve doğal boyalar kullanılır",
  },
  {
    icon: Shield,
    title: "Ömür Boyu Dayanıklılık",
    description: "Zamanla güzelleşen, nesiller boyu kullanılabilen ürünler",
  },
];

const materialFeatures = [
  "Tam Tahıl Deri (Full Grain)",
  "El Dikişi (Saddle Stitch)",
  "Bitkisel Tabaklama",
  "Doğal Mumlu İplik",
];

export function CraftsmanshipSection() {
  return (
    <section className="py-16 lg:py-24 bg-white overflow-hidden">
      <div className="container-premium">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left Side - Icon Placeholder */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
            className="relative flex items-center justify-center"
          >
            {/* Main Icon Display */}
            <div className="relative w-full max-w-md">
              {/* Background Circle */}
              <div className="w-80 h-80 mx-auto rounded-full bg-[#F5F3F0] flex items-center justify-center">
                <div className="w-60 h-60 rounded-full bg-[#0F1626] flex items-center justify-center">
                  <Award className="w-32 h-32 text-[#8A6B37]" />
                </div>
              </div>
              
              {/* Floating Badge */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="absolute -bottom-4 right-10 bg-[#8A6B37] text-white p-6 rounded-2xl shadow-xl"
              >
                <div className="text-4xl font-serif font-semibold mb-2">
                  50.000+
                </div>
                <p className="text-white/80 text-sm">
                  Mutlu müşteri
                </p>
              </motion.div>

              {/* Decorative Elements */}
              <div className="absolute -top-4 -left-4 w-24 h-24 border-2 border-[#8A6B37]/20 rounded-full" />
              <div className="absolute top-1/2 -right-8 w-16 h-16 bg-[#8A6B37]/10 rounded-full" />
            </div>
          </motion.div>

          {/* Content Side */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* Section Label */}
            <span className="inline-block text-[#8A6B37] text-xs font-medium tracking-widest uppercase mb-4">
              Ustalık
            </span>

            {/* Title */}
            <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-[#0F1626] mb-6 leading-tight">
              Her Dikişte Bir {" "}
              <span className="text-[#8A6B37]">Hikaye</span>
            </h2>

            {/* Description */}
            <p className="text-[#0F1626]/70 text-lg leading-relaxed mb-8">
              2018&apos;den beri deri tutkusunu ustalıkla birleştiriyoruz. Her ürünümüz, 
              yılların deneyimine sahip ustaların ellerinden çıkarak sizlere ulaşıyor. 
              Modern tasarım anlayışını geleneksel el işçiliğiyle harmanlayarak, 
              zamansız ve özgün parçalar yaratıyoruz.
            </p>

            {/* Craftsmanship Points */}
            <div className="space-y-6 mb-8">
              {craftsmanshipPoints.map((point, index) => (
                <motion.div
                  key={point.title}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.1 * index }}
                  className="flex items-start gap-4"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#8A6B37]/10 flex items-center justify-center flex-shrink-0">
                    <point.icon className="w-5 h-5 text-[#8A6B37]" />
                  </div>
                  <div>
                    <h4 className="font-medium text-[#0F1626] mb-1">{point.title}</h4>
                    <p className="text-[#0F1626]/60 text-sm">{point.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Material Features */}
            <div className="p-6 bg-[#F8F8F8] rounded-2xl">
              <h4 className="font-medium text-[#0F1626] mb-4">Kullanılan Malzemeler</h4>
              <div className="grid grid-cols-2 gap-3">
                {materialFeatures.map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-[#8A6B37]/10 flex items-center justify-center">
                      <Check className="w-3 h-3 text-[#8A6B37]" />
                    </div>
                    <span className="text-sm text-[#0F1626]/70">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
