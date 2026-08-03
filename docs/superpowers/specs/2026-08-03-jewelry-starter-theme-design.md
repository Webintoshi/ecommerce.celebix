# Jewelry Starter Theme Design

**Status:** Kullanıcının kuyumculuk referansı ve “bana sormadan uygulamaya geç” talimatıyla uygulama için onaylıdır.

## Amaç

Mevcut çok kiracılı Starter vitrini, referansın sessiz lüks kuyumculuk ritmine taşıyacağız. Donor HTML, logo, fotoğraf, ürün metni veya eski e-ticaret altyapısı kopyalanmayacak. Ürün, kategori, favori, sepet, checkout, footer ve tenant seçimi yalnız mevcut public PostgreSQL presentation/projection verileriyle çalışmaya devam edecek.

## Onaylı görsel kaynaklar

- Kullanıcı tarafından sağlanan canlı kuyumculuk referansı yalnız read-only görsel inceleme kaynağıdır.
- Uygulama için özgün masaüstü ve mobil uyarlama konseptleri üretildi; donor varlıkları kaynak koda alınmadı.

## Görsel sistem

- Zemin gerçek beyaz `#fff`; ana metin `#171717`; ikincil metin soğuk gri; vurgu yalnız ince sıcak altın çizgi ve focus durumunda kullanılır.
- Büyük başlıklar ve ürün adları ölçülü editorial serif, gezinme ve kontroller sıkı harf aralıklı sans-serif kullanır.
- Köşeler kare veya en fazla 2px; kart kutuları, cam efekti, glow ve dekoratif gradient kullanılmaz.
- Masaüstü içerik genişliği 1440px’e kadar açılır; ürünler beşli rail, kategoriler dörtlü grid olur. Mobilde ürün rail’i yatay kayar, kampanyalar tek kolon, kategoriler iki kolon olur.
- Tüm etkileşim hedefleri en az 48×48px, focus-visible belirgin, reduced-motion süreleri yaklaşık `.01ms` olur.

## Sayfa sırası

1. Siyah duyuru bandı.
2. Ortalanmış mağaza adı/logosu, solda kategori navigasyonu ve sağda mevcut arama/favori/hesap/sepet araçları.
3. İnce uppercase kategori rail’i ve mevcut mega menü davranışı.
4. Public hero asset’i varsa tam genişlik editorial hero; yoksa güvenli media yüzeyi.
5. Public product projection kullanan yatay ürün vitrini. Ürün adı/görseli detail linki, `Sepete ekle` gerçek cart mutation ve side cart davranışı olarak kalır.
6. Mevcut split campaign panelleri.
7. Public `category_grid` medyaları. Public navigation’da bulunup görsel eşlemesi olmayan kök kategoriler `PLACEHOLDER 1…4` media blokları olarak eklenir.
8. Mevcut ve doğrulanmış value proposition öğeleri; hiçbir iddia runtime dışında uydurulmaz.
9. Config etkinse siyah newsletter bandı; ardından admin-yönetimli footer grupları, sosyal bağlantılar ve sabit yasal sayfalar.

## Placeholder sözleşmesi

`deriveJewelryCategoryPlaceholders(navigation, sections, limit)` yalnız public navigation köklerini okur. `category_grid` içinde zaten görseli bulunan slug’ları çıkarır, kalanları sıralarını bozmadan en fazla dört öğe olarak döndürür. Etiketler yalnız görünüm amaçlı `PLACEHOLDER 1`, `PLACEHOLDER 2`, … biçimindedir; tenant/store kimliği, asset kimliği veya browser otoritesi taşımaz. Her placeholder gerçek `/categories/<slug>` adresine gider ve kategori adını da gösterir.

## Bileşen sınırları

- `jewelry-category-placeholders.ts`: saf ve immutable public görünüm modeli.
- `JewelryCategoryPlaceholders.tsx`: yalnız model çıktısını semantic link/grid olarak render eder.
- `CampaignHome.tsx`: mevcut section union’ını korur ve yalnız eksik public kategori medyaları için fallback bölümü ekler.
- `campaign-home.module.css`: hero, rail, kampanya, placeholder, değer öğeleri ve responsive ritmi yönetir.
- `campaign-header.module.css`: ortalanmış wordmark, ince navigasyon ve mobil drawer görünümünü yönetir.
- `globals.css`: ürün kartları ve retail footer’ın ortak jewelry tokenlarını yönetir.

## Güvenlik ve doğruluk

- Donor URL’leri, marka varlıkları ve API’leri kaynak koda girmez.
- Product/category/store verisi browser header, query, cookie veya local storage’dan türetilmez.
- Placeholder hiçbir satış iddiası, fiyat, stok veya medya URL’si üretmez.
- Mevcut cart, favorites, checkout, session ve exact-host resolution kodu değiştirilmez.
- `apps/admin/**`, migration, SQL ve production config kapsam dışındadır.

## Kabul kriterleri

- Masaüstü ve mobil render, iki onaylı konsepte göre header, hero, product rail, campaign, category placeholders, values, newsletter ve footer ritmini taşır.
- Eksik kategori medyalarında sıralı `PLACEHOLDER 1…N` görünür; görseli bulunan kategoriler placeholder olmaz.
- Ürün görselleri, ürün detay linkleri, favoriler ve side cart işlevleri çalışır.
- 320px genişlikte yatay sayfa taşması yoktur; 1024/1025 header sınırı korunur.
- Focus, Escape/drawer ve reduced-motion regresyonları geçer.
- Storefront test, typecheck ve production build sıfır hata ile tamamlanır.
