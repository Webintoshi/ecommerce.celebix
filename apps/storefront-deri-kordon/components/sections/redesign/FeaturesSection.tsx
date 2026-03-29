"use client";

import { motion } from "framer-motion";
import { Truck, Shield, RotateCcw, HeadphonesIcon } from "lucide-react";

const features = [
  {
    icon: Truck,
    title: "Ücretsiz Kargo",
    description: "500 TL üzeri tüm siparişlerde ücretsiz kargo fırsatı",
  },
  {
    icon: Shield,
    title: "Güvenli Ödeme",
    description: "256-bit SSL şifreleme ile güvenli ödeme altyapısı",
  },
  {
    icon: RotateCcw,
    title: "Kolay İade",
    description: "14 gün içinde koşulsuz iade ve değişim garantisi",
  },
  {
    icon: HeadphonesIcon,
    title: "7/24 Destek",
    description: "Uzman müşteri hizmetleri ekibimiz her zaman yanınızda",
  },
];

export function FeaturesSection() {
  return (
    <section className="py-16 lg:py-20 bg-white border-y border-[#E5E2DE]">
      <div className="container-premium">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: { staggerChildren: 0.1 },
            },
          }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8"
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              className="flex items-start gap-4"
            >
              <div className="w-12 h-12 rounded-xl bg-[#8A6B37]/10 flex items-center justify-center flex-shrink-0">
                <feature.icon className="w-5 h-5 text-[#8A6B37]" />
              </div>
              <div>
                <h4 className="font-medium text-[#0F1626] mb-1">{feature.title}</h4>
                <p className="text-sm text-[#0F1626]/60 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
