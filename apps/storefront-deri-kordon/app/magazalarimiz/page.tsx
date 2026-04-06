"use client";

import Image from "next/image";
import { Clock, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import {
  resolveStorefrontAssetUrl,
  resolveStorefrontDirectAssetUrl,
} from "@/lib/asset-url";
import { STORE_LOCATIONS } from "@/lib/store-locations";

function StoreImage({ src, alt }: { src: string; alt: string }) {
  const proxiedSource = resolveStorefrontAssetUrl(src);
  const directSource = resolveStorefrontDirectAssetUrl(src);
  const imageSource = proxiedSource || directSource;

  if (!imageSource) {
    return <div className="h-full w-full bg-gray-100" />;
  }

  return (
    <Image
      src={imageSource}
      alt={alt}
      fill
      className="object-cover"
      unoptimized
    />
  );
}

export default function StoresPage() {
  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="mb-4 text-3xl font-semibold text-neutral-900 lg:text-4xl">
              Şubelerimiz
            </h1>
            <p className="leading-relaxed text-gray-500">
              Fiziksel mağazalarımızda 09:00-19:00 saatleri arasında hizmet vermekteyiz.
              El işçiliği deri ürünlerimizi yakından inceleyebilir, uzman kadromuzdan
              destek alabilirsiniz.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
        <div className="space-y-16">
          {STORE_LOCATIONS.map((store, index) => (
            <div
              key={store.id}
              className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12"
            >
              <div className={index % 2 === 1 ? "lg:order-2" : undefined}>
                <div className="grid grid-cols-2 gap-3">
                  {store.images.slice(0, 3).map((image, imgIndex) => (
                    <div
                      key={imgIndex}
                      className={`relative overflow-hidden rounded-2xl bg-gray-100 ${
                        imgIndex === 0 && store.images.length >= 3
                          ? "col-span-2 aspect-[16/9]"
                          : "aspect-square"
                      } ${store.images.length === 1 ? "col-span-2 aspect-[16/10]" : ""}`}
                    >
                      <StoreImage
                        src={image}
                        alt={`${store.name} - Görsel ${imgIndex + 1}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className={index % 2 === 1 ? "lg:order-1" : undefined}>
                <div className="space-y-6">
                  <div>
                    <h2 className="mb-2 text-2xl font-semibold text-neutral-900">
                      {store.name}
                    </h2>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Clock className="h-4 w-4" />
                      <span>{store.hours}</span>
                    </div>
                  </div>

                  <p className="max-w-xl leading-relaxed text-gray-600">{store.summary}</p>

                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#D4A574]" />
                      <span className="text-gray-600">{store.address}</span>
                    </div>

                    <a
                      href={`tel:${store.phone.replace(/\s/g, "")}`}
                      className="flex items-center gap-3 text-gray-600 transition-colors hover:text-neutral-900"
                    >
                      <Phone className="h-5 w-5 flex-shrink-0 text-[#D4A574]" />
                      <span>{store.phone}</span>
                    </a>

                    <a
                      href={`mailto:${store.email}`}
                      className="flex items-center gap-3 text-gray-600 transition-colors hover:text-neutral-900"
                    >
                      <Mail className="h-5 w-5 flex-shrink-0 text-[#D4A574]" />
                      <span>{store.email}</span>
                    </a>
                  </div>

                  <a
                    href={store.mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-6 py-3 font-medium text-white transition-colors hover:bg-neutral-800"
                  >
                    <MapPin className="h-4 w-4" />
                    <span>Haritada Gör</span>
                    <ExternalLink className="h-4 w-4" />
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
