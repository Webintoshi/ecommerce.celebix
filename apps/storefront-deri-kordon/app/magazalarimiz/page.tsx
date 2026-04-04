"use client";

import Image from "next/image";
import { MapPin, Phone, Mail, Clock, ExternalLink } from "lucide-react";

const stores = [
  {
    id: "giresun",
    name: "Giresun Şube",
    address: "Bulancak Mahallesi, Fatih Caddesi 29/A, Giresun",
    phone: "+90 (507) 559-7228",
    email: "bilgi@derycraft.com",
    hours: "09:00 - 19:00",
    mapUrl: "https://www.google.com/maps/place/DeryCraft/@40.9678798,37.9051515,12z/data=!4m7!3m6!1s0x4063157ce489eef5:0xf933e5195fdfbf2a!8m2!3d40.9394346!4d38.2332595!15sChFEZXJ5Q3JhZnQgTUFSxLBOT0",
    images: [
      "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ma%C4%9Fazalar/ana-sayfa-magazalarimiz.webp",
      "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ma%C4%9Fazalar/atolye.webp",
      "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ma%C4%9Fazalar/giresun.webp",
    ],
  },
  {
    id: "ordu",
    name: "Ordu Şube",
    address: "Bulancak Mahallesi, Fatih Caddesi 29/A, Ordu",
    phone: "+90 (507) 559-7228",
    email: "bilgi@derycraft.com",
    hours: "09:00 - 19:00",
    mapUrl: "https://www.google.com/maps/place/DeryCraft+Marinoport/@40.9394052,38.1534343,12z/data=!4m7!3m6!1s0x406319df7dc533f3:0x883042e872d75b52!8m2!3d40.9678798!4d38.0575868!15sChFEZXJ5Q3JhZnQgTUFSxLBOT5IBE2xlYXRoZXJfZ29vZHNfc3RvcmWqAVQKDS9nLzExeTRrd2I3NnQQASoKIgZtYXJpbm8oITIfEAEiG8nsL1AhMVfVyZGXb_49VvEBNZFCETTh7OsNRTIUEAIiEGRlcnljcmFmdCBtYXJpbm_gAQA",
    images: [
      "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ma%C4%9Fazalar/ordu-2048x2048.webp",
    ],
  },
];

export default function StoresPage() {
  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      {/* Hero */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-16 lg:py-20">
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-3xl lg:text-4xl font-semibold text-neutral-900 mb-4">
              Şubelerimiz
            </h1>
            <p className="text-gray-500 leading-relaxed">
              Fiziksel mağazalarımızda 09:00-19:00 saatleri arasında hizmet vermekteyiz. 
              El işçiliği deri ürünlerimizi yakından inceleyebilir, uzman kadromuzdan 
              destek alabilirsiniz.
            </p>
          </div>
        </div>
      </div>

      {/* Stores */}
      <div className="max-w-6xl mx-auto px-6 py-12 lg:py-16">
        <div className="space-y-16">
          {stores.map((store, index) => (
            <div
              key={store.id}
              className={`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center ${
                index % 2 === 1 ? "lg:flex-row-reverse" : ""
              }`}
            >
              {/* Images */}
              <div className={index % 2 === 1 ? "lg:order-2" : ""}>
                <div
                  className={`grid gap-3 ${
                    store.images.length === 1
                      ? "grid-cols-1"
                      : store.images.length === 2
                      ? "grid-cols-2"
                      : "grid-cols-2"
                  }`}
                >
                  {store.images.slice(0, 3).map((image, imgIndex) => (
                    <div
                      key={imgIndex}
                      className={`relative overflow-hidden rounded-2xl bg-gray-100 ${
                        imgIndex === 0 && store.images.length >= 3
                          ? "col-span-2 aspect-[16/9]"
                          : "aspect-square"
                      }`}
                    >
                      <Image
                        src={image}
                        alt={`${store.name} - Görsel ${imgIndex + 1}`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Info */}
              <div className={index % 2 === 1 ? "lg:order-1" : ""}>
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-semibold text-neutral-900 mb-2">
                      {store.name}
                    </h2>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Clock className="w-4 h-4" />
                      <span>{store.hours}</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-[#D4A574] mt-0.5 flex-shrink-0" />
                      <span className="text-gray-600">{store.address}</span>
                    </div>

                    <a
                      href={`tel:${store.phone.replace(/\s/g, "")}`}
                      className="flex items-center gap-3 text-gray-600 hover:text-neutral-900 transition-colors"
                    >
                      <Phone className="w-5 h-5 text-[#D4A574] flex-shrink-0" />
                      <span>{store.phone}</span>
                    </a>

                    <a
                      href={`mailto:${store.email}`}
                      className="flex items-center gap-3 text-gray-600 hover:text-neutral-900 transition-colors"
                    >
                      <Mail className="w-5 h-5 text-[#D4A574] flex-shrink-0" />
                      <span>{store.email}</span>
                    </a>
                  </div>

                  <a
                    href={store.mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-900 text-white rounded-xl font-medium hover:bg-neutral-800 transition-colors"
                  >
                    <MapPin className="w-4 h-4" />
                    <span>Haritada Gör</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
