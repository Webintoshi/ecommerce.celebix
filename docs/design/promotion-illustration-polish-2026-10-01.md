# İndirim ve içgörü cilası — 1 Ekim 2026

## Tamamlanan alanlar

- Yeni indirim: 12 mevcut şablon, şablon adına/açıklamasına Türkçe arama, sonuç adedi, temizleme ve boş sonuç.
- Oluşturma: mevcut üç adım, seçilen şablona uygun görsel, canlı özette sepet koşulu ve otomatik/kupon uygulaması. Zorunlu hedef seçilmediyse “Seçim bekleniyor”.
- Kontrol: kampanya adı yanında küçük şablon görseli; mevcut koşul, doğrulama ve yayın kararları.
- İndirim listesi: ilk kampanya ve filtreyle eşleşmeyen kampanya durumlarında ayrı görseller; mevcut oluştur/filtre temizle işlemleri.
- Analiz özeti: en büyük kayıp için huni, terk edilen sepet için geri dönüşlü sepet görseli. İçgörü kutusu komşu grafiğin yüksekliğine uzamıyor.

## İşlev envanteri ve korunan davranış

Şablonların onSelect kimlikleri ve başlangıç değerleri korunur. Avantaj, hedef/koşullar, kontrol/yayın adımları; tüm avantaj türleri, otomatik/kodlu uygulama, kapsam, müşteri, takvim ve kullanım sınırları yerinde kalır. Taslak kaydetme, kontrol ve yayınlama, sürüm, yetki, işlem kilidi, kirli form uyarısı, hata/yeniden deneme akışı değiştirilmez. Liste arşivleme/çoğaltma/devam ettirme ve sayfalama korunur.

Analiz rakamları, yüzde hesabı, aşama adları ve bağlantı sorguları mevcut veriden gelir. Ölçüm alınamaması sıfır olarak gösterilmez. Yeni görseller tamamen dekoratiftir.

Üretim API, veri sözleşmesi, SQL ve indirim hesaplama değişikliği yoktur. Yerel test fixture'ında boş listeyi göstermek için yalnız `fixture=empty` seçeneği eklendi.

## Görsel uygulama

Mevcut `--cp-*` renkleri, `#f8f7f5` zemin ve grafit menü korunur. Şablonlar ince çizgiyle ayrılan satırlardır; opak beyaz görsel şeritleri ve tekrar eden çağrılar kaldırıldı. Görseller normal akışta sabit oranlıdır. Neon/ışıltı ve sürekli animasyon yoktur. Mobilde tek sütun kullanılır.

## Görsel üretim kaydı

Yerleşik **image_gen** kullanıldı; CLI veya harici API anahtarı kullanılmadı. Kullanım sınıfı: `stylized-concept`. Gerçek alfa korunarak WebP'ye boyut/format dönüşümü yapıldı. Kaynak çıktılar Codex generated_images dizininde korunur.

Seçilen üretim yönergeleri:

1. İndirim görsel ailesi: sıcak fildişi, ölçülü turuncu ve grafit; mat, yuvarlatılmış 3B nesneler. Birbirinden ayrı silüetler: ilk alışveriş çantası, eşik sepeti, kargo kamyonu, kutular ve ödül, adet basamakları, kategori karoları, ürün paketi, açık hediye, geri dönüş sepeti, VIP kartları, kupon, ayar sürgüleri. Şeffaf arka plan ve kenarlarda boşluk; yazı, ortam, neon veya ışıklı efekt yok.
2. Dönüşüm içgörüsü: grafit tabanlı fildişi katmanlı huni, küçük turuncu saplı sepet ve üç kişi jetonu. Tamamen dekoratif, herhangi bir sayı/veri/grafik üretmez. Şeffaf arka plan, temiz mat malzeme.
3. Son adet görseli için kullanılan tam yönerge:

> Create a single premium matte 3D UI illustration for a Turkish ecommerce admin quantity discount template. Exactly three ivory cube pedestals of increasing height, left low, middle medium, right tall, with one small rich orange circular percentage token in front. Compact distinct stepped silhouette. Warm ivory (#eee6d7), subtle warm orange (#ff6b00), tiny graphite details if needed. Isolated object on fully transparent alpha background. All elements centered together, at least 18% clear transparent padding on all sides. No extra partial objects at edges, no fragments, no background, no floor, no cast shadow, no scenery, no words, no numerals, no neon, no glowing light, no grain or noise. Clean crisp antialiasing and polished rounded matte materials, visually coherent with ivory/orange 3D shopping bag and truck UI assets.

Üretim dosyaları:

```
apps/customer-panel/public/images/promotions/v2/first_paid_order_percentage.webp
apps/customer-panel/public/images/promotions/v2/basket_threshold_fixed_amount.webp
apps/customer-panel/public/images/promotions/v2/free_shipping.webp
apps/customer-panel/public/images/promotions/v2/buy_x_get_y.webp
apps/customer-panel/public/images/promotions/v2/quantity_tiers.webp
apps/customer-panel/public/images/promotions/v2/category_percentage.webp
apps/customer-panel/public/images/promotions/v2/bundle_price.webp
apps/customer-panel/public/images/promotions/v2/gift.webp
apps/customer-panel/public/images/promotions/v2/abandoned_cart.webp
apps/customer-panel/public/images/promotions/v2/vip.webp
apps/customer-panel/public/images/promotions/v2/influencer_code.webp
apps/customer-panel/public/images/promotions/v2/custom.webp
apps/customer-panel/public/images/analytics/conversion-insight.webp
```

12 şablon görseli 240×240, huni 360×360. Şablon paketi önceki 1.258.528 bayttan 129.488 bayta indi (%89,7 küçülme). İlk dört şablon erken, kalan görseller gecikmeli yüklenir; boyutlar ayrılmıştır ve çözümleme asenkron yapılır. Bu dosya boyutu karşılaştırmasıdır; sayfa hızında aynı oranda artış iddiası değildir.

## Doğrulama

- İndirim model/sunum/stüdyo/rota testleri: 48/48.
- Analiz çalışma alanı/içgörü/sunum ve gerçek şablon bileşeni testleri: 28/28 (3 şablon testi dahil).
- Son temizleme odağı değişikliği sonrası gerçek şablon testleri tekrar 3/3.
- Customer Panel typecheck başarılı.
- Customer Panel üretim derlemesi başarılı.
- Gerçek bileşenler yerel Next.js uygulamasında 1440, 1024 ve 390 px incelendi; sayfa yatay taşması 0.
- Türkçe arama, sıfır sonuç/temizleme, temizleme sonrası odağın arama alanına dönmesi, Enter ve Space ile şablon seçimi, adımlar arasında girilen adın korunması doğrulandı.
- Gerçek kayıp hesabı 252 oturum / %96,6; sepet durumunda 18 terk edilen / 4 geri kazanım. Ölçüm bekleniyor durumunda ziyaretçi ve oran “—”.
- Boş ve filtreli boş liste gerçek bileşende doğrulandı. Yerel özet servisinin kasıtlı 503 durumu hata mesajı/yeniden deneme kontrolünü gösterir.
- Son şablon sayfasında tarayıcı hata/uyarı kaydı yok; 12 görsel başarıyla yüklendi.
- Bağımsız son incelemede şablon kimliği, model, yetki veya finansal davranış kaybı bulunmadı. Bulunan görsel kenar artığı ve arama odağı düzeltildi.

Yerel ekran kanıtları: `/Users/Celebix/.codex/tmp/promotion-illustration-polish-20261001/`.

Bu teslimat uygulama kodu ve yerel doğrulamadır; canlı yayın yapıldığı iddiası değildir.
