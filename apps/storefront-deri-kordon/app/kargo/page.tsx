"use client";

export default function KargoPage() {
  return (
    <div className="min-h-screen bg-[#F8F8F8] py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-12">
          <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900 mb-8">
            Teslimat Politikası
          </h1>

          <div className="prose prose-neutral max-w-none space-y-6 text-gray-700">
            <p className="text-sm uppercase tracking-wide font-medium text-neutral-900 mb-4">
              SATICI'NIN stok ve/veya üretim durumunun uygun olması halinde; siparişi verilen ve ödemesi tamamlanan ürünler, anlaşmalı Kargo Şirketi aracılığıyla taahhüt edilen sürede ayıpsız ve hasarsız olarak ALICI' ya teslim edilir.
            </p>

            <p>
              www.derycraft.com'dan kredi kartı (Visa, MasterCard) ve EFT/Havale ile alışveriş yapılabilir. Ödemeli gönderi, kapıda ödeme, posta çeki gibi ödeme yöntemleri kabul edilmez. Ödemesi banka tarafından onaylanmayan siparişler iptal edilir. Satın alınan ürünün teslimat süreci bankadan gerekli onayın gelmesi ile ödemenin tamamlandığı anda başlayacaktır.
            </p>

            <p>
              Siparişlerin işleme alınma zamanı, siparişin verildiği an değil, kredi kartı hesabından gerekli tahsilatın yapıldığı andır.
            </p>

            <p>
              İnternet sitesi üzerinden satışı gerçekleşen ve teslimat aşamasına geçilen ürünlerde taşıma şirketinden veya ALICI'NIN kendisinden kaynaklanan nedenlerle teslimatın gecikmesi veya hiç yapılamamasından SATICI'NIN sorumluluğu bulunmamaktadır. Kargo Şirketinin haftada bir gün teslimat yaptığı bölgelerde, sevk bilgilerindeki yanlışlık ve eksiklik olduğu hallerde, bazı sosyal olaylar ve doğal afetler gibi durumlarda belirtilen gün süresinde sarkma olabilir. Ürün, ALICI'dan başka bir kişi/kuruluşa teslim edilecek ise, teslim edilecek kişi/kuruluşun teslimatı kabul etmemesinden, sevk bilgilerindeki yanlışlık ve/veya alıcının yerinde olmamasından doğabilecek ekstra kargo bedellerinden SATICI sorumlu tutulamaz.
            </p>

            <div className="bg-amber-50 border-l-4 border-[#D4A574] p-6 rounded-r-lg my-6">
              <p className="text-amber-900 text-sm font-medium">
                SEVKİYAT BİLGİLERİNİ TAM VE EKSİKSİZ DOLDURMANIZ, TESLİMAT YAPILACAK ADRESTE BULUNMANIZ ÖNEMLE RİCA OLUNUR.
              </p>
            </div>

            <p>
              Teslimat masrafları alıcıya aittir. Satıcı, web sitesinde, ilan ettiği rakamın üzerinde alışveriş yapanların teslimat ücretinin kendisince karşılanacağını ya da kampanya dahilinde ücretsiz teslimat yapacağını beyan etmişse, teslimat masrafı satıcıya aittir. Her zaman iade kargo ücreti Alıcı'ya aittir. Teslimat, stokun müsait olması ve mal bedelinin satıcının hesabına geçmesinden sonra en kısa sürede yapılır. Satıcı, mal/hizmetin siparişinden itibaren 30 (Otuz) gün içinde teslim eder ve bu süre içinde yazılı bildirimle ek 10 (on) günlük süre uzatım hakkını saklı tutar. Herhangi bir nedenle mal/hizmet bedeli ödenmez veya banka kayıtlarında iptal edilir ise, satıcı mal/hizmetin teslimi yükümlülüğünden kurtulmuş kabul edilir. Anlaşmalı Kargo şirketleri dışındaki kargo firmaları ile gönderim isteyen Alıcı, tüm sorumlulukları ve tüm kargo masraflarını ödemeyi kabul eder.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
