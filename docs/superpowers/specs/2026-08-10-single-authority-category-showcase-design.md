# Tek Yetkili Kategori Vitrini Tasarımı

**Tarih:** 2026-08-10  
**Durum:** Kullanıcı tarafından yazılı olarak onaylandı

## Amaç

Starter storefront ana sayfasındaki kategori vitrini tek bir yönetim alanından ve tek bir kalıcı içerik yetkisinden beslenecek. Header menüsü, kategori vitrini içeriği üretmeyecek; eksik görseller için otomatik `PLACEHOLDER` kartları gösterilmeyecek.

## Mevcut sorun

Kategori vitrini bugün üç farklı kaynağın birleşiminden oluşuyor:

- `starter_theme_composition.navigation` kategori adlarını ve hedeflerini dolaylı olarak fallback vitrine taşıyor;
- `starter_theme_composition.sections[].category_grid` başlık, görünürlük ve yerleşim bilgisi taşıyor;
- `category_showcase` kategori ile mağaza görseli eşleşmesini taşıyor.

Bu bölünme, admin panelinde bir ayarın değiştirilmesine rağmen storefront'ta başka kaynaktan gelen placeholder içeriğin görünmesine neden oluyor.

## Tek yetki kararı

`category_showcase` kategori vitrininin tek içerik yetkisi olacaktır. Bu kayıt aşağıdaki alanların tamamını taşıyacaktır:

- `heading`: vitrinin başlığı;
- `enabled`: vitrinin görünürlüğü;
- `layout`: `duo` veya `grid`;
- `items`: sıralı ve benzersiz `{ categoryId, assetId }` eşleşmeleri.

`starter_theme_composition` yalnız ana sayfa bölüm sırasını yönetmeye devam eder. `category_grid` burada içerik üretmez; yalnız kategori vitrininin ana sayfadaki yerini belirleyen bir slot olarak değerlendirilir. Menüdeki `rootCategoryIds` yalnız header navigasyonu içindir.

## Admin deneyimi

Kullanıcı tüm işlemleri şu tek ekrandan yapar:

`Tasarım → Ana sayfa → Bölümler → Kategori vitrini`

Bu ekranda kullanıcı:

- başlığı değiştirir;
- bölümü açar veya kapatır;
- iki büyük görsel ya da dört kartlı ızgara düzenini seçer;
- her satırda kategori ve kategori görselini birlikte seçer;
- kartları yukarı/aşağı taşıyarak sıralar;
- kart ekler veya kaldırır;
- tek bir yayınlama akışıyla sonucu storefront'a gönderir.

Kategori görsellerinin yükleme arşivi aynı çalışma alanında açılabilir; ancak vitrinde kullanılan görsel seçimi yalnız kategori vitrini kaydında tutulur.

## Storefront davranışı

- Storefront yalnız etkin ve doğrulanmış `category_showcase` projeksiyonunu render eder.
- Menü kategorilerinden kategori kartı veya placeholder türetilmez.
- `JewelryCategoryPlaceholders` ve `deriveJewelryCategoryPlaceholders` storefront akışından kaldırılır.
- Etkin vitrinde yalnız tam çözülen kategori ve görsel çiftleri bulunur.
- Vitrin kapalıysa veya geçerli kartı yoksa bölüm hiç render edilmez.
- Boş veya kapalı vitrin storefront'u 500/503 durumuna düşürmez.
- Kategori hedefleri sunucu tarafından doğrulanmış canonical slug üzerinden `/categories/<slug>` biçiminde üretilir.
- Tenant, store, asset veya category kimlikleri browser HTML'ine yetki olarak sızdırılmaz.

## Geçiş ve uyumluluk

- Mevcut `category_showcase` kayıtları `layout: "grid"` varsayılanıyla okunabilir.
- İlk başarılı yönetim kaydı mevcut başlık, görünürlük ve eşleşmeleri koruyarak `layout` alanını kalıcılaştırır.
- Mevcut `category_grid` slotunun ana sayfa sırası korunur.
- Eski `category_grid.heading`, `category_grid.categoryIds` ve menü fallback'i storefront içerik yetkisi olarak kullanılmaz.
- Mevcut Güzide kategori-görsel eşleşmeleri yeniden görsel yüklemeyi gerektirmeden korunur.

## Hata davranışı

- Eksik kategori veya görsel seçilmiş satır kaydedilemez.
- Aynı kategori veya görsel birden fazla kartta kullanılamaz.
- Yabancı mağazaya ait, arşivlenmiş ya da çözülemeyen görsel reddedilir.
- Geçersiz yeni taslak son geçerli yayını değiştirmez.
- Projeksiyon sırasında eksik kayıt görülürse bölüm fail-closed olarak gizlenir; placeholder veya sahte içerik üretilmez.

## Test kapsamı

- Menü kategorilerinin kategori vitrini üretmediği kanıtlanır.
- Placeholder metni ve bileşeninin storefront çıktısında bulunmadığı kanıtlanır.
- Başlık, görünürlük, düzen, sıra, kategori ve görselin aynı `category_showcase` kaydından geldiği kanıtlanır.
- `duo` ve `grid` yerleşimleri masaüstü/mobilde doğrulanır.
- Boş ve kapalı vitrin 200 döndürür ve kategori bölümü üretmez.
- Eksik/yanlış/çift kategori-görsel eşleşmeleri reddedilir.
- Güzide'nin mevcut eşleşmeleri geriye uyumlu okunur.
- Customer-panel testleri, typecheck ve build çalıştırılır.
- Storefront testleri, typecheck ve build çalıştırılır.
- `git diff --check`, gizli bilgi taraması ve değişen dosya kapsamı doğrulanır.

## Kapsam dışı

- Header menüsü davranışının yeniden tasarlanması;
- kategori kataloğu veya ürün-kategori ilişkilerinin değiştirilmesi;
- yeni medya depolama sistemi;
- production deploy veya production verisi;
- tema dışındaki admin modüllerinin değiştirilmesi.

## Başarı ölçütü

Admin panelindeki tek kategori vitrini alanından yayımlanan başlık, düzen, sıra, kategori ve görseller storefront'ta birebir görünür. Menü değişiklikleri vitrini etkilemez; eksik yapılandırmada placeholder veya storefront hatası oluşmaz.
