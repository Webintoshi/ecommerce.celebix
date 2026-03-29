"use client";

import { Mail, MapPin, Phone } from "lucide-react";

export default function IletisimPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-white rounded-xl shadow-sm p-8 md:p-12">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">
            İletişim Bilgileri
          </h1>

          <div className="space-y-8">
            {/* Türkiye Ofisi */}
            <div className="border-l-4 border-primary pl-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Türkiye Ofisi
              </h2>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Marka</p>
                  <p className="text-lg font-semibold text-gray-900">Ornek Magaza</p>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Adres</p>
                    <p className="text-gray-900">
                      Akyazı Mahallesi 873. Sokak No:2 Daire:4<br />
                      Altınordu / Ordu, Türkiye
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-500 mb-1">E-posta</p>
                    <a 
                      href="mailto:ornek-magazashopify@proton.me"
                      className="text-primary hover:underline font-medium"
                    >
                      ornek-magazashopify@proton.me
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Telefon</p>
                    <a 
                      href="tel:+905551234567"
                      className="text-primary hover:underline font-medium"
                    >
                      +90 555 123 4567
                    </a>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-500 mb-1">Vergi Kimlik Numarası</p>
                  <p className="text-gray-900 font-mono">2340684642</p>
                </div>
              </div>
            </div>

            {/* ABD Ofisi */}
            <div className="border-l-4 border-gray-300 pl-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                ABD Ofisi
              </h2>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Şirket Adı</p>
                  <p className="text-lg font-semibold text-gray-900">WEBINTOSH LLC</p>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-gray-600 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Adres</p>
                    <p className="text-gray-900">
                      1209 Mountain Road Pl NE Ste N<br />
                      Albuquerque, NM 87110, USA
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-500 mb-1">EIN</p>
                  <p className="text-gray-900 font-mono">37-2197807</p>
                </div>
              </div>
            </div>

            {/* İletişim Formu Bilgisi */}
            <div className="bg-primary/5 rounded-lg p-6 mt-8">
              <h3 className="font-semibold text-gray-900 mb-2">
                Bize Ulaşın
              </h3>
              <p className="text-gray-700 mb-4">
                Sorularınız, önerileriniz veya geri bildirimleriniz için bizimle iletişime geçmekten çekinmeyin. Size en kısa sürede dönüş yapacağız.
              </p>
              <a
                href="mailto:ornek-magazashopify@proton.me"
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                <Mail className="w-5 h-5" />
                E-posta Gönder
              </a>
            </div>

            {/* Çalışma Saatleri */}
            <div className="border-t pt-8">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Müşteri Hizmetleri Çalışma Saatleri
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="font-semibold text-gray-900 mb-2">Hafta İçi</p>
                  <p className="text-gray-700">Pazartesi - Cuma: 09:00 - 18:00</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="font-semibold text-gray-900 mb-2">Hafta Sonu</p>
                  <p className="text-gray-700">Cumartesi - Pazar: Kapalı</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
