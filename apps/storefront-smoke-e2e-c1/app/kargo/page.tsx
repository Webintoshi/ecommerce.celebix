"use client";

export default function KargoPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-white rounded-xl shadow-sm p-8 md:p-12">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">
            Kargo ve Teslimat Politikası
          </h1>

          <div className="prose prose-gray max-w-none space-y-6 text-gray-700">
            <p className="text-lg">
              Ornek Magaza olarak siparişlerinizi en kısa sürede ve en taze şekilde ulaştırmak için çalışıyoruz. Aksi belirtilmedikçe, tüm siparişleriniz ödeme onayı alındıktan sonra <strong>3–4 iş günü</strong> içerisinde kargoya verilir.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">
              Teslimat Süreleri
            </h2>

            <p>
              Kargo firmalarının yoğunluk durumuna, resmi tatillere ve bulunduğunuz şehre göre teslimat süreleri değişiklik gösterebilir. Genellikle kargo firmasının operasyonuna bağlı olarak, paketiniz kargoya verildikten sonra birkaç iş günü içinde adresinize teslim edilir.
            </p>

            <div className="bg-amber-50 border-l-4 border-amber-500 p-6 rounded-r-lg my-6">
              <p className="text-amber-900">
                <strong>Önemli:</strong> Resmî tatiller, hafta sonları, olumsuz hava koşulları ve kargo firmasının kendi operasyonel aksaklıkları teslimat süresini uzatabilir; bu durumlarda Ornek Magaza'nun teslimat süresine doğrudan müdahale imkânı bulunmamaktadır.
              </p>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">
              Kargo Ücretleri
            </h2>

            <p>
              Kargo ücreti, sepet tutarı ve teslimat adresinize göre değişiklik gösterebilir. Güncel kargo ücretleri ve varsa ücretsiz kargo kampanyaları, ödeme sayfasında ve/veya sepet adımında görüntülenir.
            </p>

            <div className="bg-primary/5 border-l-4 border-primary p-6 rounded-r-lg my-6">
              <p className="text-primary font-semibold">
                🚚 500 ₺ üzeri siparişlerde kargo ücretsiz!
              </p>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">
              Kargo Takibi
            </h2>

            <p>
              Siparişiniz kargoya verildiğinde, kayıtlı e‑posta adresinize veya telefon numaranıza kargo takip numaranız iletilir. Bu numara üzerinden kargo firmasının web sitesi veya uygulaması aracılığıyla gönderinizi takip edebilirsiniz.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">
              Adres ve Teslimat Problemleri
            </h2>

            <p>
              Sipariş oluştururken teslimat adresinizi eksiksiz ve doğru girdiğinizden emin olun. Eksik veya hatalı adres nedeniyle gerçekleşmeyen teslimatlardan doğabilecek gecikmelerden Ornek Magaza sorumlu tutulamaz.
            </p>

            <p>
              Kargo görevlisi adreste size ulaşamazsa, kargo firması politikalarına göre tekrar dağıtıma çıkabilir veya en yakın şubeden teslim almanız istenebilir.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">
              Hasarlı Paketler ve Kargo Esnasında Oluşan Sorunlar
            </h2>

            <p>
              Paketinizi teslim alırken dış ambalajda yırtılma, açılma veya ezilme gibi bir hasar fark ederseniz, lütfen kargo görevlisinin yanında tutanak tutturarak ürünü teslim almayın ve durumu en kısa sürede bize bildirin.
            </p>

            <div className="bg-gray-50 p-6 rounded-lg mt-8">
              <p className="font-semibold text-gray-900 mb-2">
                Herhangi bir kargo veya teslimat sorununda bizimle iletişime geçin:
              </p>
              <p className="text-primary font-semibold">ornek-magazashopify@proton.me</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
