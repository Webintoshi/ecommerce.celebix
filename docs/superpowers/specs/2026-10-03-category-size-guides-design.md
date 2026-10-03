# Ekstralar: kategoriye bağlı ölçü rehberleri

## Amaç ve yetki

Kullanıcı, Ekstralar'da işletmenin hazırladığı ölçü rehberlerinin kategorilere atanmasını, o kategorideki bütün ürünlerde görünmesini ve bu alanın ileride başka ekstra türlerini barındırmasını istedi. Araştırma, planlama ve özelliğin eklenmesini bu sohbette yetkilendirdi. Çalışma ortak müşteri paneli ve storefront içindir; yalnız Güzide'ye özgü değildir.

## İşletme deneyimi

- `/products/extras` rehberler ve mevcut fiyatlı ürün seçeneklerini türlerine göre gösterir. Mevcut seçenekler, düzenleme, önizleme ve arşivleme işlemleri korunur. Ekstra türleri küçük bir kayıt/katalog yapısıyla genişletilir; henüz uygulanmayan türler için çalışmayan düğme eklenmez.
- Yeni ölçü rehberi: ad, müşterinin göreceği bağlantı başlığı, biçimlendirilmiş içerik, bir veya daha fazla kategori, alt kategorileri dahil etme ve gösterimi açma/kapatma.
- İçerik mevcut güvenli editörü kullanır: paragraflar, başlıklar, listeler, bağlantılar ve ölçü tabloları. İlk sürüm rehbere görsel/video yüklemeyi kapsamaz; ürün görsel sınırları değişmez.
- İçerik en fazla 10.000 karakter; kategori listesi 1–64 benzersiz kimlik. Başlık 1–120 karakter. Varsayılan başlık `Ölçü rehberi`, alt kategoriler dahil ve gösterim açık.
- **Uygula** kaydeder ve mağazaya yansıtır; **Vazgeç** kayıt yapmaz. Hata/bağlantı kopmasında metin ve seçimler korunur; aynı içerikle tekrar denemede aynı işlem anahtarı kullanılır. Sürüm çakışması sessizce ezilmez.
- Aynı aktif kategoriye iki açık rehber atanamaz; kullanıcı mevcut atamayı kaldırmalı veya rehberi kapatmalıdır. Kapatılmış/arşivlenmiş rehber mağazada görünmez.
- Rehberler mevcut fiyatlı seçenek editöründe düzenlenemez; sunucu rehber türünün yanlışlıkla fiyatlı seçeneğe dönüşmesini de engeller.

## Müşteri deneyimi

- Ürün sayfasında varyant seçimine yakın, işletmenin belirlediği başlıkla bir rehber bağlantısı görünür; içerik orta pencerede açılır. Telefonda pencere ekranı doldurur; kapatma erişilebilir kalır.
- Otomatik kategori eşleşmesi kayıt anında ürünlere kopyalanmaz. Yeni eklenen veya kategori değiştirilen ürünlerin rehberi okuma anında belirlenir.
- Ürünün doğrudan/alt kategori eşleşmeleri içinde en yakın kategori kazanır. Birden fazla doğrudan kategori varsa mevcut kategori sırası kullanılır; kalan eşitlikler kimlikle kararlı biçimde çözülür. Alt kategorideki özel rehber üst kategorideki rehberden önceliklidir.
- Aynı rehber birden fazla yoldan eşleşse bile bir kez gösterilir. Uygun aktif kategori rehberi yoksa eski ürüne doğrudan bağlanan `definition/size_guide` rehberi korunur.
- Mevcut tasarımın `showSizeGuide` anahtarı korunur. Rehber bir satın alma seçeneği, beden varyantı veya fiyat farkı değildir; sepet ve stok davranışına dokunmaz.
- Escape ile kapatma, odak kilidi ve kapanınca bağlantıya odak dönüşü; klavye, 1440/1024/390 px ve uzun tablo kullanımı doğrulanır.

## Ortak veri sözleşmesi

- Mevcut `catalog_admin_resources` içinde `resource_kind=extra` korunur. Rehber config ayracı: `{ schemaVersion: 1, type: "size_guide", heading, body, categoryIds, includeDescendants, enabled }`. Fiyatlı seçeneklerin mevcut config'i değişmez. Rehberin doğrudan `productIds` listesi boş olmalıdır.
- `parseCatalogSizeGuideConfig` ortak sözleşmesi yalnız rehber config'inde uzun biçimlendirilmiş içeriğe izin verir; diğer config'lerin mevcut kısıtları genişletilmez. İçerik sunucuda mevcut güvenli normalizer ile temizlenir; script/iframe/olay işleyicileri korunmaz.
- Kategori sahipliği ve aktiflik veritabanındaki dar yetkili işlemde doğrulanır. Aktif kategori atamalarının çakışması eşzamanlı işlemlerde de engellenir; mağaza sınırları/RLS ve mevcut oturum/yetki kontrolleri korunur.
- Mevcut `/api/catalog/admin/resources/extra` okuma/kayıt/arşivleme uçları, beklenen sürüm ve `Idempotency-Key` kullanılır. İzin mevcut `catalog_admin.manage` olur; yeni bir geniş yönetim izni verilmez.
- Mevcut public `merchandising.sizeGuide={heading,body}` çıktısı korunur. `public_starter_product_merchandising` kategori eşleşmesini ve eski fallback'i çözer; bütün mağazalar ortak renderer'ı kullanır.
- Kayıt, kapatma, arşivleme ve kategori değişimi sonrası mevcut mağaza katalog önbelleği yenilenir. Her ürüne ayrı katalog isteği veya kayıt eklenmez.
- Additive migration, mevcut fonksiyon/ACL/search_path/sahiplik ve rollback korumalarıyla hazırlanır. Aktif rehber kaydı bulunan veritabanında veriyi kaybettiren rollback engellenir.

## Kabul

Bir rehber yüzük kategorisine atanır; mevcut ve sonra eklenen yüzükte görünür, kolyede görünmez. Alt kategori kuralı açılıp kapatılır; alt kategori özel rehberi öncelik kazanır. Uygula/Vazgeç, değiştirme, pasifleştirme, arşivleme, fiyatlı seçeneklerin korunması, kategori değişimi, çapraz mağaza erişimi, aynı kategoriye eşzamanlı kayıt, sürüm çakışması ve aynı işlem tekrarı test edilir. Biçimlendirilmiş metin/tablo gerçek ürün penceresinde doğrulanır. Veri desteği ve storefront okuyucu uyumu önce; iki ortak admin sonra yayımlanır. Canlı mağazaya işletmenin yazmadığı örnek ölçü tablosu yayımlanmaz.

## Araştırma

- Shopify, tekrar kullanılan içeriği metaobject referansıyla ürünlere bağlar: https://help.shopify.com/en/manual/custom-data/metaobjects/referencing-metaobjects
- Shopify kategori verileri kategoriye özgü nitelikleri destekler: https://help.shopify.com/en/manual/custom-data/metafields/category-metafields
- GIA ölçüm tekniği ve farklı yüzük şekilleri/ölçü tablolarını ayırır. Bu nedenle ilk sürüm içerik yayınlar; evrensel yüzük ölçüsü hesaplayıcısı veya standart dönüşümü üretmez: https://www.gia.edu/quality-assurance-benchmark/accurate-determination-finger-ring-size
