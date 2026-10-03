# Güzide mobil menü uygulaması — 2 Ekim 2026

Kullanıcının onayladığı [ana menü ve Kolyeler alt menüsü](mobile-menu-concept-2026-10-02.png) uygulanır. Canlı yayın baseline: `926bbb571545cff52bba8d632601c325b05e106a`.

## Sınır ve veri kaynakları

Yalnız tam Güzide storefront UUID’si yeni menüyü alır. Mevcut CampaignHeader, tema client sınırını sunucuda seçer. Masaüstü nav/StoreUtilities aynı kalır. Yeni bağımlılık, font dosyası, admin ayarı veya veri sözleşmesi eklenmez.

Logo mevcut publication önceliğiyle; sıra, isimler, yollar ve alt dallar `presentation.navigation` üzerinden gelir. Görseller admin kategori gridinden, legacy showcase veya yalnız aynı slug’a ait featured alanından alınır. Yayımlanmış kategori fotoğrafı olmayan dört gerçek ana kategori, kullanıcının onayladığı yerel tema görsellerini kullanır. Başka kategoriye veya koleksiyona bu görseller atanmaz. Yüklenemeyen görselli kategorinin gerçek bağlantısı kullanılabilir kalır. Koleksiyon yolları korunur. Destek adresi yalnız gerçek `supportEmail` üzerinden gösterilir.

## Bileşen ve tasarım envanteri

| Parça | Uygulama |
| --- | --- |
| Tenant seçimi | CampaignHeader → GuzideHeaderClient → mevcut CampaignHeaderClient mobil slotu |
| Veri eşleştirme | `guzide-menu.ts`; yayımlanan category_grid görselleri öncelikli |
| Katmanlar | GuzideMobileMenu; indeks yolu, üç seviyeli gezinti, geri odak ve scroll sıfırlama |
| Görsel dil | Tam ekran beyaz; 24px kenar boşluğu; 80px kategori satırı; 60×64px küçük görsel |
| Alt kategori | Geri butonu, 28px başlık, 156px hero, Tüm kategori bağlantısı, 54px alt satırlar |
| Renk ve tipografi | CSS tokenları `#20201e`, `#777775`, `#e9e5e0`; canlı Bai Jamjuree miras alınır |
| İkonlar | Mevcut lucide-react; 1.35 stroke; 44px veya daha büyük aksiyon alanları |
| Hareket | 140ms katman girişi; reduced-motion tercihiyle kapanır |
| Arama | Yerel React submit; trim, katalog limitleri, kontrol karakteri reddi; mevcut `/search?q=` |
| Erişilebilirlik | Etiketli arama, modal/focus trap, Escape, tetikleyiciye odak dönüşü, body lock cleanup |

Arama inputu 16px: iOS’ta odak sırasında otomatik yakınlaştırmayı önler. Ana ekranın Hesabım/Favorilerim/Sepetim araçları alt kategorilerde tekrarlanmaz. Görseller menü açılınca yüklenir; yeni arama servisi/istek döngüsü yoktur.

## Görsel sadakat kontrolü

Onaylı görsel ve 390×844 tarayıcı ekranları aynı incelemede karşılaştırıldı.

| Karşılaştırma | Sonuç |
| --- | --- |
| Yüzey, logo ve kapatma | Tam genişlik beyaz yüzey, gerçek logo, ince çerçevesiz X |
| Arama ve hiyerarşi | İnce alt çizgi, KEŞFET ve dört dikey fotoğraflı kategori |
| Satır ölçeği ve aralık | Büyük, regular ağırlık başlıklar; ince ayırıcılar; dört kutulu galeri yok |
| Yardımcı alan | Tüm Ürünler/Ana Sayfa, üç yardımcı araç ve gerçek destek adresi |
| Kolyeler ekranı | Aynı üst alan, geri dönüş, gerçek fotoğraf, çerçeveli tüm bağlantısı, beş gerçek alt kategori |

Kopya farkı: yok. İsimler ve destek adresi canlı admin içeriğinden gelir. Görseldeki font yaklaşık AI temsiliydi; kullanıcı talebiyle gerçek mevcut Bai Jamjuree korunur. İkonlar mevcut kütüphanenin eşdeğer ince çizimleri; kategori fotoğrafları ve logo özgün varlıklardır. Responsive yerleşim kısa ekranlarda iç kaydırma kullanır. Kalan görsel uyumsuzluk yok.

## Doğrulama

- Yeni anlamlı testler: 13 mobil menü etkileşimi +4 veri eşleştirme; eksik bileşen ile RED, uygulama ile GREEN.
- Full storefront suite: 770 server +96 browser testi geçti, toplam866, sıfır başarısız.
- Önceden Güzide PDP’yi tanımayan SEO test harness’i düzeltildi; mevcut canonical/indexing kontrolleri korunup5tenant izolasyonu ve gerçek JSON-LD fiyatı güçlendirildi. PDP üretim kaynağı bu taskta değişmedi.
- Typecheck ve production build başarılı.
- Tarayıcı: 390×844 ana/alt ekran; 320×640 içinde kaydırma, yatay taşma yok; Escape/body lock/geri odak; encoded arama sonucu ve menü kapanışı; 1280×900 desktop nav; diğer tenantın351px generic drawer’ı doğrulandı.
- Client’a geçen server nav düğümüne sabit key eklenerek header React key uyarısı giderildi.
- Read-only ikinci inceleme: gerçek/benzer/başka tenant seçimi, admin sıra ve logo önceliği, arama/focus/route temizliği doğrulandı; kritik bulgu yok.

Canlı yayın kanıtı ayrıca release sonrası kayıt edilir; bu belge yerel uygulama doğrulamasını özetler.


## Canlı veri koşulu için görsel düzeltmesi

İlk yayın `e89019ffaa576c42f3b3e6fcade96bd99560d210` NET/SITE finished ve strict final doğrulamasını geçti. Canlı Güzide ana sayfası yalnız dört ürün rayı yayımlıyor; `category_grid` veya `categoryShowcase` fotoğrafları yayımlanmamış. Bu yüzden görseller dolu fixture tek başına canlı veri durumunu temsil etmiyordu.

Onaylı konseptteki dört özgün kategori WebP görseli, byte eşitliğiyle `public/themes/guzide/mobile-menu/` içine alındı (toplam177120byte). Öncelik: admin category_grid → categoryShowcase → aynı kategori featured → yalnız gerçek dört kök kategori için onaylı tema görseli. Admin ayarı veya API değiştirilmedi; yeni ağır projection/ürün sorgusu eklenmedi.

Aynı veri boşluğu yeni `/product-guzide-no-menu-photos` fixture senaryosunda doğrulandı: dört fotoğraf ve alt kategori hero’su yükleniyor; mevcut Bai Jamjuree korunuyor. Onaylı konsept, ana menü ve alt menü ekran görüntüleri aynı karşılaştırmada yeniden incelendi. Admin fotoğrafının önceliği, koleksiyon/unknown çakışmalarında tema fotoğrafı kullanılmaması ve gerçek nav sınırlaması anlamlı testlerle doğrulandı. Yeni RED testi eksik fotoğrafı yeniden üretti, ardından17/17 odaklı ve866/866 full test GREEN oldu.
