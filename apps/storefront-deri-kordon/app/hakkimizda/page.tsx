"use client";

import Link from "next/link";
import { Watch, Heart, Award, Shield } from "lucide-react";

export default function HakkimizdaPage() {
  return (
    <main className="min-h-screen bg-[#F8F8F8]">
      {/* Hero Section */}
      <section className="py-20 sm:py-28 lg:py-36">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          {/* Small Label */}
          <span className="text-xs text-neutral-400 uppercase tracking-[0.2em] mb-6 block">
            Hakkımızda
          </span>
          
          {/* Main Title */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-medium text-neutral-900 mb-6 tracking-tight">
            Deri Kordon
          </h1>
          
          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-neutral-500 leading-relaxed max-w-2xl mx-auto">
            El yapımı hakiki deri kordonlar ve Apple Watch kayışları üretiyoruz. 
            Geleneksel el sanatını modern tasarımla buluşturuyoruz.
          </p>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-16 sm:py-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-medium text-neutral-900 mb-4">
              Hikayemiz
            </h2>
          </div>
          
          <div className="space-y-6 text-neutral-600 leading-relaxed text-center">
            <p>
              2018 yılında Ordu&apos;da küçük bir atölyede başladık. Dedelerimizden 
              öğrendiğimiz geleneksel deri işçiliğini, modern tasarım anlayışıyla 
              birleştirerek benzersiz ürünler yaratıyoruz.
            </p>
            <p>
              Her bir ürünümüz deneyimli ustalarımızın ellerinde şekilleniyor. 
              Sadece en kaliteli full-grain derileri kullanıyor, saddle stitch 
              tekniğiyle dikiyoruz. Bugün Türkiye&apos;nin ve dünyanın birçok noktasına 
              ulaşıyoruz.
            </p>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-medium text-neutral-900 mb-4">
              Değerlerimiz
            </h2>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                <Award className="w-6 h-6 text-neutral-900 stroke-[1.5]" />
              </div>
              <h3 className="text-sm font-medium text-neutral-900 mb-2">Kalite</h3>
              <p className="text-sm text-neutral-500">En iyi malzemeler, kusursuz işçilik</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                <Watch className="w-6 h-6 text-neutral-900 stroke-[1.5]" />
              </div>
              <h3 className="text-sm font-medium text-neutral-900 mb-2">Ustalık</h3>
              <p className="text-sm text-neutral-500">Yılların tecrübesi, el işçiliği</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                <Shield className="w-6 h-6 text-neutral-900 stroke-[1.5]" />
              </div>
              <h3 className="text-sm font-medium text-neutral-900 mb-2">Şeffaflık</h3>
              <p className="text-sm text-neutral-500">Açık üretim süreci</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                <Heart className="w-6 h-6 text-neutral-900 stroke-[1.5]" />
              </div>
              <h3 className="text-sm font-medium text-neutral-900 mb-2">Tutku</h3>
              <p className="text-sm text-neutral-500">İşimizi seviyoruz</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl sm:text-4xl font-medium text-neutral-900 mb-1">7+</div>
              <div className="text-sm text-neutral-500">Yıllık Tecrübe</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-medium text-neutral-900 mb-1">50K+</div>
              <div className="text-sm text-neutral-500">Mutlu Müşteri</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-medium text-neutral-900 mb-1">25+</div>
              <div className="text-sm text-neutral-500">Usta Zanaatkar</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-medium text-neutral-900 mb-1">100%</div>
              <div className="text-sm text-neutral-500">El Yapımı</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-20 bg-neutral-900">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-medium text-white mb-4">
            Koleksiyonumuzu Keşfedin
          </h2>
          <p className="text-neutral-400 mb-8">
            Her ürünümüzde ustalık ve tutkuyu bulacaksınız.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/urunler"
              className="inline-flex items-center justify-center px-8 py-3.5 bg-white text-neutral-900 rounded-lg font-medium hover:bg-neutral-100 transition-colors"
            >
              Ürünleri İncele
            </Link>
            <Link
              href="/iletisim"
              className="inline-flex items-center justify-center px-8 py-3.5 bg-transparent text-white border border-white/30 rounded-lg font-medium hover:bg-white/10 transition-colors"
            >
              Bize Ulaşın
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
