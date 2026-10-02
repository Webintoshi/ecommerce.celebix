# Güzide mobil menü — araştırma ve görsel tasarım

Tarih: 2 Ekim 2026. Görsel kullanıcı tarafından onaylandı; Güzide mobil menüsünün uygulaması bu onaya dayanır. Araştırma gözlemleri tasarımdan önce kaydedildi.

## Araştırma

| Referans | Doğrulanan gözlem | Güzide için karar |
| --- | --- | --- |
| [Cartier](https://www.cartier.com/en-us/jewelry/all-collections/) | 390×844 tarayıcı incelemesi: tam genişlik beyaz ana menü, sade kapatma kontrolü, ayrı yardımcı işlemler; gerçek alt kategoriler için geri dönüşlü katman; alt koleksiyonlarda ikili görseller. | Tam ekran yüzey ve tek katmanı gösteren geri dönüşlü kategori gezintisi. Cartier kırmızısı veya tipografisi aktarılmayacak. |
| [Mejuri](https://mejuri.com/) | 390×844 tarayıcı incelemesi: üstte altı çizgili arama, ana bağlantılar, ayrı keşif grupları; altta hesap ve favoriler. | Aramayı kategori listesinin üstünde, hesap/favorileri ayrı alanda sunmak. Daha rahat dokunma alanları kullanmak. |
| [EYYO](https://www.eyyo.com.tr/) | Mobil menüde arama, direkt kategori bağlantıları ve alt kategori grupları erişilebilirlik ağacında doğrulandı. Kampanya penceresi kapalı shadow root nedeniyle görsel incelemeyi sınırladı. Animasyon ve hız ölçülmedi. | Geri dönüşü belirgin, az adımlı gezinme hedefi. Kampanya pop-up'ları menü konseptine eklenmeyecek. |
| [Tiffany](https://www.tiffany.com/sitemap.html) | Resmî içerik hiyerarşisi: ürün kategorileri, koleksiyon ve malzeme grupları ayrı. Mobil görsel bu kaynaktan doğrulanmadı. | Önce kullanıcının aradığı ürün türünü göstermek. |
| [Van Cleef & Arpels](https://www.vancleefarpels.com/us/en/collections/jewelry.html) | Resmî içerikte takı türleri ve koleksiyonlar ayrı; hesap/arama gibi araçlar ayrı. Mobil animasyon doğrulanmadı. | Ürün kategorileri ile yardımcı işlemleri karıştırmamak. |
| [Hermès](https://www.hermes.com/us/en/) | Mobil inceleme denendi; site hata görünümü verdi. Menünün görünümü doğrulanamadı. | Bu tasarım için Hermès mobil menüsü hakkında görsel veya performans iddiası yapılmayacak. |

## Canlı Güzide doğrulaması

Kaynak: [canlı ürün sayfası](https://guzidekuyumcu.com/urun/14-ayar-altin-tasli-dugum-kolye-960), mobil menü DOM incelemesi.

- Güncel font: `Bai Jamjuree`, mevcut admin tipografi ayarı. Font değişmeyecek.
- Ana bağlantılar: Ana Sayfa, Ürünler, Kolyeler, Bileklikler, Yüzükler, Küpeler.
- Kolyeler alt kategorileri: Taşlı Kolyeler, Sade Kolyeler, Harf Kolye, Kolye Ucu, Zincir Kolyeler.
- Bileklikler alt kategorileri: Zincir Bileklikler, Göz Bileklikler, Taşlı Bileklik, Sade Bileklikler, Kelepçe Bileklik, Harf Bileklikler, Şahmeran.
- Yüzükler alt kategorileri: Taşlı Yüzükler, Baget Yüzükler, Sade Yüzükler, Tektaş Yüzükler, Beştaş Yüzükler, Özel Yüzükler, Harf Yüzükler, Dorikalı Yüzük.
- Küpeler alt kategorileri: Taşlı Küpeler, Vidalı Küpeler, Halka Küpeler, Sallantılı Küpeler.
- Mevcut gerçek araçlar: arama, hesap, favoriler, sepet.
- Gerçek destek e-postası: info@guzidekuyumcu.com. Doğrulanmış destek telefonu/WhatsApp numarası yok.
- Yerel test fixture'ının boş `children` dizileri canlı kategori hiyerarşisini temsil etmiyor; görsel canlı hiyerarşiye göre hazırlanıyor.

## Görsel kararları

1. Ana menü ve Kolyeler alt menüsü aynı görselde iki ayrı ekran olarak gösterilecek.
2. Beyaz tam ekran yüzey; orijinal logo; sade kapatma ve geri dönüş kontrolleri.
3. Üstte kompakt arama. Ana menüde dört ürün kategorisi, küçük gerçek kategori fotoğraflarıyla dikey satırlar; dört kutulu kategori galerisi yok.
4. Ana menüde Ana Sayfa/Tüm Ürünler bağlantıları ve hesap/favori/sepet araçları daha sakin bir ikincil alan. Yardımcı işlemler alt kategori görünümünde tekrarlanmaz.
5. Alt menü tek bir kategoriyi ve gerçek alt bağlantılarını gösterir; bütün alt listeler aynı anda açılmaz.
6. Tipografi mevcut Bai Jamjuree ailesini korur. İnce ayırıcılar, ölçülü siyah ve sıcak nötr fotoğraflar kullanılır.
7. Sonraki kodlama aşamasında admin menü sırası, bağlantıları ve gerçek alt dallar kaynak olarak korunur. Fotoğraflar küçük WebP olarak yüklenir; hareket kısa ve azaltılmış hareket tercihiyle uyumlu olur. Uygulama ve doğrulama ayrıntıları aşağıdaki uygulama notunda kayıtlıdır.

## Referans varlıkları

`mobile-menu-reference-assets/` klasöründeki dört kategori görseli mevcut fixture'dan yalnız byte-decode ile çıkarıldı; logo mevcut Güzide varlığının birebir kopyası. Kaynak byte eşitliği doğrulandı. Yapay ürün veya kampanya fotoğrafı kullanılmadı.

## Onay kapısı

Kullanıcı görseli “evet gördüğüm en iyi tasarım en modern tasarım” mesajıyla onayladı. Güzide'ye özel uygulama bu onay üzerine hazırlandı. [Uygulama ve doğrulama](mobile-menu-implementation-2026-10-02.md).

Görsel: [Ana menü ve Kolyeler alt menüsü](mobile-menu-concept-2026-10-02.png). Görsel üretiminde beş gerçek marka/kategori referansı kullanıldı. Tipografi görselde yaklaşık temsil edilir; uygulamada mevcut admin fontu birebir korunacak.
