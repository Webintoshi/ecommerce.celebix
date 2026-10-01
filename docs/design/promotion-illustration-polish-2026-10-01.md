# İndirim ve içgörü cilası — 1 Ekim 2026

## Kullanıcı düzeltmesi ve görsel yön

İlk revizyonda kullanılan 3B görsel ailesi kullanıcı tarafından reddedildi. Bu belge ve uygulama son çizgisel revizyonu anlatır. Referans, mevcut dashboard ProductsEmptyArtwork/SalesEmptyArtwork ve analitikteki EmptyIllustration ailesidir: düz beyaz/soluk yüzey, yuvarlak koyu çizgiler, küçük turuncu vurgu ve basit nötr zemin. 3B render ailesi uygulamadan kaldırıldı. Daha önce üretilen kaynaklar Codex generated_images dizininde tarihçe olarak kalır; uygulama onları yüklemez.

## İşlev envanteri

Ana görev, indirim şablonunu bulup mevcut üç adımda yapılandırmaktır. 12 şablonun kimliği, varsayılanları ve seçim callbackleri; avantaj, hedef/koşullar, kontrol/yayın adımları; otomatik/kupon, kapsam, müşteri, takvim, kullanım sınırları; taslak kaydetme, kontrol ve yayınlama, sürüm, yetki, kilit, kirli form ve hata/yeniden deneme davranışı korunur. Liste işlemleri ve sayfalama korunur.

Analizler gerçek kayıp/sepet rakamlarını, aşama adlarını ve mevcut bağlantı sorgularını kullanır. Ölçüm alınamaması sıfır olarak gösterilmez. Görseller dekoratiftir, veri üretmez.

Üretim API, veri sözleşmesi, SQL ve indirim hesaplama değişikliği: NONE. Önceki yerel boş liste fixture seçeneği korunur.

## Tamamlanan ekranlar

- Yeni indirim: 12 ayrı çizgisel sahne, Türkçe arama, sonuç adedi, temizleme ve görselli boş sonuç.
- Oluşturma ve kontrol: seçilen şablona uygun aynı SVG ailesi, canlı özette sepet ve uygulama koşulları.
- Liste: ilk kampanya ve filtreli boş durumda aynı çizgisel aile.
- Analiz özeti: düz huni kartı ve geri dönüşlü sepet. Komşu grafiğin yüksekliğine uzamayan içgörü alanı.

Zemin #f8f7f5, mevcut grafit menü ve operasyonel tipografi korunur. Görseller normal akışta, sabit oranla; mobilde tek sütun. Başlık veya açıklama eklenmedi.

## Kaynaklar ve kalıcı kural

- apps/customer-panel/components/promotions/PromotionIllustration.tsx: 12 sahne ve güvenli özel kampanya fallbacki.
- apps/customer-panel/components/promotions/promotion-illustration.module.css: çizgisel stil.
- apps/customer-panel/components/analytics/CommerceAnalyticsWorkspace.tsx: InsightIllustration, huni/sepet sahneleri.
- apps/customer-panel/app/globals.css: mevcut onaylı dashboard renklerinden ortak --cp-art-* paleti.
- apps/customer-panel/AGENTS.md ve Mira component-rules.md: operasyonel illüstrasyon ailesi kuralı.

Bu düzeltme kod tabanlı SVG'dir; yeni bitmap/image_gen üretimi yok. Önceki 13 yeni WebP dosyası kaldırıldı. Bu görseller için ek dosya isteği, görsel çözümleme veya animasyon kütüphanesi yok. Bu, ölçülmüş sayfa hız artışı iddiası değildir.

## Doğrulama

- Önceki işlev testleri: indirim model/sunum/stüdyo/rota 48/48; analiz/içgörü/sunum/şablon 28/28.
- Son native SVG değişikliği sonrası ilgili analiz çalışma alanı ve gerçek şablon bileşeni testleri 14/14.
- Customer Panel typecheck başarılı. İlk revizyonun üretim derlemesi başarılı; son çizgisel bileşenler gerçek Next.js uygulamasında derlenip incelendi.
- 1440, 1024 ve 390 px: sayfa yatay taşması 0; yeni şablon SVG'leri doğru kimlik ve ölçekle gösterildi.
- Türkçe KARGO araması, temizleme sonrası odağın aramaya dönmesi ve Enter ile şablon seçimi tekrar doğrulandı.
- 12 callback, Türkçe arama/boş sonuç/temizleme odağı, dekoratif ve odaklanmayan SVG nitelikleri gerçek bileşen testinde korundu.
- Kayıp içgörüsü 252 oturum / %96,6; sepet içgörüsü 18 terk edilen / 4 geri kazanım. Rakamlar ve CTA adresleri korunur.
- Son şablon/oluşturma tarayıcı kontrolünde hata/uyarı kaydı yok; eski raster illüstrasyon isteği yok.
- Bağımsız Atlas incelemesi ve yeni baskı testi 8: PASS. Üç kullanıcı referansıyla karşılaştırılan masaüstü/mobil kanıtlarda stil kayması, kırpılma veya metin/görsel çakışması bulunmadı.

Ekran kanıtları: /Users/Celebix/.codex/tmp/promotion-illustration-polish-20261001/outline-*.png.

Bu teslimat uygulama kodu ve yerel doğrulamadır. Canlı yayın yapılmadı.
