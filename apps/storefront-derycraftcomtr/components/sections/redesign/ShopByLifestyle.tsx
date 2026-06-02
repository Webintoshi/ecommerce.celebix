"use client";

import { Leaf, WheatOff, Sprout, Beef, Salad, ArrowRight } from "lucide-react";
import Link from "next/link";

interface LifestyleItem {
  name: string;
  icon: React.ElementType;
  desc: string;
  color: string;
  bgColor: string;
  link: string;
}

export default function ShopByLifestyle() {
  const lifestyles: LifestyleItem[] = [
    {
      name: "Vegan",
      icon: Leaf,
      desc: "Bitkisel beslenme",
      color: "text-emerald-600",
      bgColor: "bg-emerald-100",
      link: "/koleksiyon?vegan=true"
    },
    {
      name: "Glutensiz",
      icon: WheatOff,
      desc: "Gluten içermez",
      color: "text-amber-600",
      bgColor: "bg-amber-100",
      link: "/koleksiyon?glutenFree=true"
    },
    {
      name: "Paleo",
      icon: Sprout,
      desc: "Atalardan gelen",
      color: "text-lime-600",
      bgColor: "bg-lime-100",
      link: "/koleksiyon?paleo=true"
    },
    {
      name: "Keto",
      icon: Beef,
      desc: "Düşük karbonhidrat",
      color: "text-rose-600",
      bgColor: "bg-rose-100",
      link: "/koleksiyon?keto=true"
    },
    {
      name: "Bitkisel",
      icon: Salad,
      desc: "Doğal içerik",
      color: "text-sky-600",
      bgColor: "bg-sky-100",
      link: "/koleksiyon?plantBased=true"
    },
  ];

  return (
    <section className="py-10 md:py-20 bg-white overflow-hidden" id="shop-by-lifestyle">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8 md:mb-12 opacity-0 animate-[fadeIn_0.6s_ease-out_forwards]">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Yaşam Tarzına Göre
          </h2>
          <p className="text-gray-500 text-sm md:text-base">
            Size en uygun beslenme şeklini keşfedin
          </p>
        </div>

        {/* Desktop: Grid / Mobile: Scrollable */}
        <div className="hidden sm:grid sm:grid-cols-3 md:grid-cols-5 gap-4 lg:gap-6 xl:gap-8">
          {lifestyles.map((item, index) => (
            <div
              key={item.name}
              className="opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <Link
                href={item.link}
                className="group flex flex-col items-center text-center p-4 rounded-2xl hover:bg-gray-50 transition-colors"
              >
                {/* Icon Circle */}
                <div className={`
                  w-20 h-20 lg:w-24 lg:h-24 rounded-2xl ${item.bgColor} 
                  flex items-center justify-center mb-4
                  transform transition-all duration-300 
                  group-hover:scale-110 group-hover:shadow-lg group-hover:rotate-3
                `}>
                  <item.icon className={`w-8 h-8 lg:w-10 lg:h-10 ${item.color}`} strokeWidth={1.5} />
                </div>

                {/* Text */}
                <h3 className="font-semibold text-gray-900 text-base lg:text-lg mb-1 group-hover:text-primary transition-colors">
                  {item.name}
                </h3>
                <p className="text-sm text-gray-500">
                  {item.desc}
                </p>
              </Link>
            </div>
          ))}
        </div>

        {/* Mobile: Horizontal Scroll */}
        <div className="sm:hidden">
          <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 pb-4">
            {lifestyles.map((item, index) => (
              <div
                key={item.name}
                className="flex-shrink-0 w-[140px] snap-start opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <Link
                  href={item.link}
                  className="group flex flex-col items-center text-center"
                >
                  {/* Icon Circle - Mobile Optimized */}
                  <div className={`
                    w-24 h-24 rounded-2xl ${item.bgColor} 
                    flex items-center justify-center mb-3
                    transform transition-all duration-300 
                    active:scale-95
                  `}>
                    <item.icon className={`w-10 h-10 ${item.color}`} strokeWidth={1.5} />
                  </div>

                  {/* Text */}
                  <h3 className="font-semibold text-gray-900 text-sm mb-0.5">
                    {item.name}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {item.desc}
                  </p>
                </Link>
              </div>
            ))}
          </div>

          {/* Mobile Scroll Indicator */}
          <div className="flex justify-center gap-1.5 mt-4">
            {lifestyles.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all ${idx === 0 ? 'w-4 bg-primary' : 'w-1.5 bg-gray-300'
                  }`}
              />
            ))}
          </div>
        </div>

        {/* View All Link */}
        <div className="text-center mt-8 md:mt-12 opacity-0 animate-[fadeIn_0.6s_ease-out_forwards]" style={{ animationDelay: '0.3s' }}>
          <Link
            href="/koleksiyon"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-900 rounded-full font-medium text-sm hover:bg-gray-200 transition-colors"
          >
            Tüm Ürünleri Keşfet
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  );
}
