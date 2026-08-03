# Starter Tema Ürün Satın Alma Yerleşimi Tasarımı

Durum: Kullanıcı tarafından yazılı olarak onaylandı

## Amaç

Ürün detayındaki gereksiz stok etiketini kaldırmak ve miktar seçiciyi satın alma eylemleriyle aynı görsel gruba taşımak. Sepete ekleme, hemen satın alma, stok yetkisi ve miktar sınırları değişmeyecek.

## Değerlendirilen Yaklaşımlar

1. **Önerilen ve onaylanan responsive eylem grubu:** Masaüstünde `miktar | sepete ekle | şimdi satın al` tek satır; mobilde miktar seçici solda, iki CTA'nın hemen üstünde ve CTA'lar yan yana. Okunabilirliği ve 48 px hedefleri korur.
2. **Her genişlikte tek satır:** Mobilde üç kontrolü aynı satıra sıkıştırır. CTA metinlerini ve dokunma hedeflerini gereksiz küçülttüğü için reddedildi.
3. **Miktarı CTA'ların altına taşıma:** Eylem sırasını tersine çevirir ve miktar seçimini satın alma kararından kopardığı için reddedildi.

## Bileşen Sözleşmesi

- `ProductPurchasePanel` içindeki görünür `Stokta` / `Tükendi` etiketi ve noktası tamamen kaldırılacak.
- Stok otoritesi korunacak: `available` ve seçili varyantın `available` değeri CTA disabled durumunu belirlemeye devam edecek.
- Miktar seçici mevcut erişilebilir sözleşmesini koruyacak:
  - `aria-label="Adet seçimi"`
  - `Adedi azalt` ve `Adedi artır` düğmeleri
  - 1–99 sınırı
  - pending sırasında kilitlenme
- Masaüstü eylem satırı üç sütun olacak:
  - sabit/bounded miktar seçici;
  - esnek `Sepete ekle`;
  - esnek `Şimdi satın al`.
- Dar ekranda miktar seçici eylem grubunun ilk satırında sola hizalanacak; iki CTA ikinci satırda eşit genişlikte kalacak.
- Sepete ekleme side-cart davranışı ve buy-now `/checkout` yönlendirmesi değişmeyecek.

## Görsel ve Responsive Kabul

- 390 px genişlikte yatay taşma `0` olmalı.
- Mobil CTA'lar yan yana ve eşit genişlikte kalmalı.
- Her miktar düğmesi en az 48×48 px olmalı.
- 1025 px ve üzerindeki masaüstünde miktar seçici iki CTA'nın solunda aynı satırda görünmeli.
- Ürün görselinin mevcut `object-fit: contain` davranışı korunmalı.

## Test Stratejisi

1. Kaynak testi görünür stok etiketinin kaldırıldığını ve stok yetkisinin `allowed` hesabında kaldığını kanıtlayacak.
2. CSS sözleşme testi masaüstü üç-sütun eylem grubunu ve mobil iki-satır yerleşimini kanıtlayacak.
3. Mevcut miktar sınır testleri, side-cart testi ve buy-now testi değişmeden geçecek.
4. Storefront workspace test, typecheck ve production build çalıştırılacak.
5. Staging'de masaüstü ve 390×844 mobil viewport ölçümleri alınacak.

## Kapsam

Beklenen uygulama dosyaları:

- `apps/storefront-shared/components/ProductPurchasePanel.tsx`
- `apps/storefront-shared/components/ProductPurchasePanel.test.ts`
- `apps/storefront-shared/components/ProductDetailExperience.test.ts`
- `apps/storefront-shared/app/globals.css`

Veritabanı, migration, sözleşme, sepet API'si, ödeme akışı, admin, Owner, customer-panel ve production kapsam dışıdır.
