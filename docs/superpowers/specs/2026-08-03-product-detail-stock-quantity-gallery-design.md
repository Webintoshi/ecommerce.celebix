# Ürün Detayı Stok, Adet ve Galeri İyileştirmesi

Durum: Kullanıcı tarafından yazılı olarak onaylandı

## Amaç

Starter storefront tekil ürün sayfasındaki satın alma alanını daha modern ve dengeli hâle getirmek; ürünün birinci görselini kırpmadan göstermek.

## Onaylanan görünüm

- Bağımsız stok satırı fiyatın altından kaldırılır.
- Stok durumu, satın alma panelindeki adet satırının solunda küçük durum noktası ve `Stokta` / `Tükendi` metni olarak gösterilir.
- Adet alanı, sağ tarafta `−`, mevcut değer ve `+` kontrollerinden oluşan tek parça minimalist sayaç olur.
- Sayaç 1–99 sınırını korur. Eksiltme 1 değerinde, artırma 99 değerinde devre dışı kalır.
- Ekran okuyucu için eksiltme ve artırma düğmelerinin açık Türkçe etiketleri bulunur; güncel değer erişilebilir kalır.
- `Sepete ekle` ve `Şimdi satın al` butonlarının mevcut eşit, yan yana düzeni korunur.
- Ana galeri görseli `object-fit: contain` ile kırpılmadan ve merkezlenmiş olarak gösterilir.
- Thumbnail ve ürün kartı kırpma davranışları değişmez; yalnız tekil ürün sayfasının ana görseli ve mobil ana galeri kareleri etkilenir.
- Zoom modalı mevcut `contain` davranışını korur.

## Bileşen sınırları

### `ProductDetailExperience`

Stok yetkisini `PublicProduct.available` üzerinden okumaya devam eder ve bu değeri satın alma paneline taşır. Ayrı stok sunumu kaldırılır; veri kaynağı değişmez.

### `ProductPurchasePanel`

Mevcut canonical cart işlemleri, varyant seçimi, pending durumları ve 1–99 validasyonu korunur. Yalnız miktar kontrolünün görünümü ve stok göstergesinin konumu değişir. Yeni browser, tenant veya store authority eklenmez.

### `ProductGallery`

Görsel seçimi, klavye kullanımı, focus restore ve zoom akışı değişmez. CSS ana görseli kırpmak yerine bütün olarak sunar.

## Test yaklaşımı

TDD kapsamında önce focused kaynak sözleşmesi testleri şu davranışlar için kırmızıya çevrilir:

1. Stok metni yalnız satın alma panelinde bulunur.
2. Sayaçta erişilebilir eksiltme ve artırma düğmeleri vardır.
3. Sayaç 1–99 sınırlarını uygular.
4. Ana ve mobil galeri görselleri `contain` kullanır; ürün kartları etkilenmez.
5. İki CTA eşit ve yan yana kalır.

Ardından focused test, storefront workspace testleri, typecheck, build ve canlı masaüstü/mobil görsel doğrulama çalıştırılır.

## Kapsam

Beklenen uygulama dosyaları:

- `apps/storefront-shared/components/ProductDetailExperience.tsx`
- `apps/storefront-shared/components/ProductPurchasePanel.tsx`
- `apps/storefront-shared/components/ProductDetailExperience.test.ts`
- `apps/storefront-shared/components/ProductPurchasePanel.test.ts`
- `apps/storefront-shared/app/globals.css`

Veritabanı, migration, admin paneli, Owner, ödeme akışı, storefront veri authority’si ve production kapsam dışıdır.
