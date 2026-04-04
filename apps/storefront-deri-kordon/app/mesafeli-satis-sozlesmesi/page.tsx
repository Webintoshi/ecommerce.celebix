"use client";

export default function MesafeliSatisSozlesmesiPage() {
  return (
    <div className="min-h-screen bg-[#F8F8F8] py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-12">
          <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900 mb-8">
            Mesafeli Satış Sözleşmesi
          </h1>

          <div className="prose prose-neutral max-w-none space-y-6 text-gray-700">
            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-3">1. TARAFLAR</h2>
              <p className="mb-4">
                <strong>SATICI:</strong><br />
                Ünvan: DeryCraft<br />
                Adres: İstanbul, Türkiye<br />
                Telefon: +90 (507) 559-7228<br />
                E-posta: bilgi@derycraft.com<br />
                Web: www.derycraft.com
              </p>
              <p>
                <strong>ALICI:</strong> www.derycraft.com internet sitesinden mal/hizmet satın alan kişi.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-3">2. SÖZLEŞME KONUSU</h2>
              <p>
                İş bu sözleşmenin konusu, ALICI'nın SATICI'ya ait www.derycraft.com internet sitesinden elektronik ortamda sipariş verdiği, sözleşmede belirtilen niteliklere sahip mal/hizmetin satışı ve teslimi ile ilgili olarak 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Uygulama Esas ve Usulleri Hakkında Yönetmelik hükümleri gereğince tarafların hak ve yükümlülüklerinin belirlenmesidir.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-3">3. SÖZLEŞME TARİHİ</h2>
              <p>
                Sözleşme, ALICI tarafından elektronik ortamda onaylandığı tarihte akdedilir.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-3">4. MAL/HİZMET BİLGİLERİ</h2>
              <p className="mb-2">Satın alınan ürünler şunlardır:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Ürünün cinsi ve türü, miktarı, marka/modeli</li>
                <li>Satış bedeli (vergiler dahil toplam tutar)</li>
                <li>Ödeme şekli ve teslimata ilişkin bilgiler</li>
              </ul>
              <p className="mt-3 text-sm text-gray-500">
                *Ürün bilgileri sipariş sırasında sepette ve sipariş onay ekranında gösterilir.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-3">5. ÖDEME</h2>
              <p>
                www.derycraft.com'dan kredi kartı (Visa, MasterCard) ve EFT/Havale ile alışveriş yapılabilir. Ödemeli gönderi, kapıda ödeme, posta çeki gibi ödeme yöntemleri kabul edilmez. Siparişlerin işleme alınma zamanı, siparişin verildiği an değil, kredi kartı hesabından gerekli tahsilatın yapıldığı andır.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-3">6. TESLİMAT</h2>
              <p>
                SATICI'nın stok ve/veya üretim durumunun uygun olması halinde; siparişi verilen ve ödemesi tamamlanan ürünler, anlaşmalı Kargo Şirketi aracılığıyla taahhüt edilen sürede ayıpsız ve hasarsız olarak ALICI'ya teslim edilir. Teslimat masrafları alıcıya aittir. SATICI, web sitesinde ilan ettiği rakamın üzerinde alışveriş yapanların teslimat ücretini karşılayabilir veya kampanya dahilinde ücretsiz teslimat yapabilir.
              </p>
              <p className="mt-2">
                SATICI, mal/hizmetin siparişinden itibaren 30 (otuz) gün içinde teslim eder. Herhangi bir nedenle mal/hizmet bedeli ödenmez veya banka kayıtlarında iptal edilir ise, SATICI mal/hizmetin teslimi yükümlülüğünden kurtulmuş kabul edilir.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-3">7. CAYMA HAKKI</h2>
              <p>
                ALICI, 14 (on dört) gün içinde herhangi bir gerekçe göstermeksizin ve cezai şart ödemeksizin sözleşmeden cayma hakkına sahiptir. Cayma hakkı süresi, malın teslim edildiği günden itibaren başlar.
              </p>
              <p className="mt-2">
                Cayma hakkının kullanılması için 14 günlük süre içinde SATICI'ya yazılı bildirimde bulunulması ve malın kullanılmamış, ambalajının bozulmamış olması gerekmektedir. Cayma hakkı kapsamında iade edilecek malın kargo ücreti ALICI'ya aittir.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-3">8. SORUMLULUK</h2>
              <p>
                İnternet sitesi üzerinden satışı gerçekleşen ve teslimat aşamasına geçilen ürünlerde taşıma şirketinden veya ALICI'nın kendisinden kaynaklanan nedenlerle teslimatın gecikmesi veya hiç yapılamamasından SATICI'nın sorumluluğu bulunmamaktadır.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-3">9. UYUŞMAZLIK</h2>
              <p>
                İş bu sözleşmenin uygulanmasından doğan uyuşmazlıklarda Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri yetkilidir.
              </p>
            </section>

            <div className="bg-gray-50 p-6 rounded-xl mt-8">
              <p className="text-sm text-gray-500">
                Son güncelleme: {new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
