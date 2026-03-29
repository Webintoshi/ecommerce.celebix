import { Metadata } from "next";
import { Award, Users, Clock, Heart, Hammer, Leaf, Shield, Check } from "lucide-react";

export const metadata: Metadata = {
  title: "Hakkımızda | Deri Kordon",
  description: "2018'den beri el yapımı hakiki deri kordonlar üretiyoruz. Ustalık, kalite ve müşteri memnuniyeti odaklı çalışma anlayışımız.",
};

const stats = [
  { icon: Award, value: "50.000+", label: "Mutlu Müşteri" },
  { icon: Users, value: "25+", label: "Usta Çalışan" },
  { icon: Clock, value: "7+", label: "Yıllık Tecrübe" },
  { icon: Heart, value: "100%", label: "El Yapımı" },
];

const values = [
  {
    title: "Kalite",
    description: "Sadece en kaliteli tam tahıl hakiki deri kullanıyoruz. Her ürünümüz yıllarca dayanacak şekilde üretilir.",
  },
  {
    title: "Ustalık",
    description: "Her ürün deneyimli ustaların ellerinden çıkar. Geleneksel el işçiliği tekniklerini modern tasarımla birleştiriyoruz.",
  },
  {
    title: "Şeffaflık",
    description: "Üretim sürecimizin her aşamasında şeffafız. Kullandığımız malzemelerin kaynağını ve üretim koşullarını biliyoruz.",
  },
  {
    title: "Müşteri Odaklılık",
    description: "Müşterilerimizin memnuniyeti bizim için en önemli öncelik. 7/24 destek ve kolay iade garantisi sunuyoruz.",
  },
];

const materialFeatures = [
  "Tam Tahıl Deri (Full Grain)",
  "El Dikişi (Saddle Stitch)",
  "Bitkisel Tabaklama",
  "Doğal Mumlu İplik",
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#F8F8F8]">
      {/* Hero Section */}
      <section className="relative py-24 lg:py-32 bg-[#0F1626] overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>
        
        <div className="container-premium relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-block text-[#8A6B37] text-sm font-medium tracking-widest uppercase mb-4">
              Est. 2018
            </span>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-semibold text-white mb-6">
              Hikayemiz
            </h1>
            <p className="text-white/70 text-lg leading-relaxed">
              2018&apos;den beri tutkuyla üretiyoruz. Her dikişte bir hikaye, her üründe bir emek var.
            </p>
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-16 lg:py-24">
        <div className="container-premium">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left Side - Icon Placeholder */}
            <div className="relative flex items-center justify-center">
              <div className="relative w-full max-w-md">
                {/* Background Circle */}
                <div className="w-80 h-80 mx-auto rounded-full bg-[#F5F3F0] flex items-center justify-center">
                  <div className="w-60 h-60 rounded-full bg-[#0F1626] flex items-center justify-center">
                    <Hammer className="w-32 h-32 text-[#8A6B37]" />
                  </div>
                </div>
                
                {/* Floating Badge */}
                <div className="absolute -bottom-4 right-10 bg-[#8A6B37] text-white p-6 rounded-2xl shadow-xl">
                  <div className="text-4xl font-serif font-semibold mb-1">7+</div>
                  <div className="text-white/80 text-sm">Yıllık Tecrübe</div>
                </div>

                {/* Decorative Elements */}
                <div className="absolute -top-4 -left-4 w-24 h-24 border-2 border-[#8A6B37]/20 rounded-full" />
                <div className="absolute top-1/2 -right-8 w-16 h-16 bg-[#8A6B37]/10 rounded-full" />
              </div>
            </div>

            {/* Content Side */}
            <div>
              <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-[#0F1626] mb-6">
                Tutkuyla Üretiyoruz
              </h2>
              <div className="space-y-4 text-[#0F1626]/70 leading-relaxed">
                <p>
                  Deri Kordon olarak yolculuğumuza 2018 yılında, küçük bir atölyede başladık. 
                  Amacımız sadece deri ürünler üretmek değil, her bir parçada bir hikaye 
                  anlatmak ve müşterilerimize özel bir deneyim sunmaktı.
                </p>
                <p>
                  Bugün, 25&apos;den fazla usta çalışanımızla birlikte, geleneksel el işçiliği 
                  tekniklerini modern tasarım anlayışıyla birleştirerek, Roarcraft kalitesinde 
                  ürünler üretiyoruz.
                </p>
                <p>
                  Her bir ürünümüz, deneyimli ustalarımızın ellerinden tek tek geçer. 
                  Sadece %100 hakiki deri kullanıyor, doğal boyalar ve geleneksel 
                  bitkisel tabaklama yöntemleriyle işliyoruz.
                </p>
              </div>

              {/* Material Features */}
              <div className="mt-8 p-6 bg-white rounded-2xl border border-[#E5E2DE]">
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
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white border-y border-[#E5E2DE]">
        <div className="container-premium">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-[#8A6B37]/10 flex items-center justify-center">
                  <stat.icon className="w-6 h-6 text-[#8A6B37]" />
                </div>
                <div className="font-serif text-3xl lg:text-4xl font-semibold text-[#0F1626] mb-1">
                  {stat.value}
                </div>
                <div className="text-[#0F1626]/60 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-16 lg:py-24">
        <div className="container-premium">
          <div className="text-center mb-12">
            <span className="inline-block text-[#8A6B37] text-sm font-medium tracking-widest uppercase mb-3">
              Değerlerimiz
            </span>
            <h2 className="font-serif text-3xl md:text-4xl font-semibold text-[#0F1626]">
              Bizi Biz Yapanlar
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {values.map((value, index) => (
              <div
                key={index}
                className="p-8 bg-white rounded-2xl border border-[#E5E2DE] hover:border-[#8A6B37]/30 transition-colors"
              >
                <h3 className="font-serif text-xl font-semibold text-[#0F1626] mb-3">
                  {value.title}
                </h3>
                <p className="text-[#0F1626]/70 leading-relaxed">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Craftsmanship Points */}
      <section className="py-16 lg:py-24 bg-[#0F1626]">
        <div className="container-premium">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-[#8A6B37]/20 flex items-center justify-center">
                <Hammer className="w-8 h-8 text-[#8A6B37]" />
              </div>
              <h3 className="font-serif text-xl font-semibold text-white mb-2">El İşçiliği</h3>
              <p className="text-white/60">Her ürün deneyimli ustaların ellerinden tek tek işlenir</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-[#8A6B37]/20 flex items-center justify-center">
                <Leaf className="w-8 h-8 text-[#8A6B37]" />
              </div>
              <h3 className="font-serif text-xl font-semibold text-white mb-2">Doğal Malzemeler</h3>
              <p className="text-white/60">Sadece %100 hakiki deri ve doğal boyalar kullanılır</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-[#8A6B37]/20 flex items-center justify-center">
                <Shield className="w-8 h-8 text-[#8A6B37]" />
              </div>
              <h3 className="font-serif text-xl font-semibold text-white mb-2">Dayanıklılık</h3>
              <p className="text-white/60">Zamanla güzelleşen, nesiller boyu kullanılabilen ürünler</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24">
        <div className="container-premium">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="font-serif text-3xl md:text-4xl font-semibold text-[#0F1626] mb-4">
              Bize Katılın
            </h2>
            <p className="text-[#0F1626]/70 mb-8">
              50.000&apos;den fazla mutlu müşterimiz arasına katılın ve el yapımı 
              deri ürünlerin ayrıcalığını keşfedin.
            </p>
            <a
              href="/urunler"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#8A6B37] text-white font-medium rounded-lg hover:bg-[#8A6B37]/90 transition-colors"
            >
              Koleksiyonu Keşfet
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
