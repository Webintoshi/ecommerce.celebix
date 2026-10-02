# Mağaza satışı — arayüz QA

Kullanıcının onayladığı HTML, gerçek `/orders/quick-links` bileşenine uygulandı. Yalnız Console TSX ve yerel CSS üretim değişikliği; satış controller/istemci/API/SQL/ödeme kaynağı baseline ile aynı.

## Doğrulamalar

- 87/87 odaklı bileşen, istemci ve controller testi PASS. Üç yeni regresyon: kısmi sıfır/fazla tutar ve tam moda dönüş, fiyat düşüşünde fazla kısmi tahsilat, tamamlanmış satışın güncel finans tahsilatı.
- İzole fixture transport 4/4 PASS: dış origin/yazı kaçışı reddi, V3 durumlar, idempotent tamamlama/örnek stok, veresiye/borç tahsilatı, hata/cursor. Tüm örnek işlemler yerel bellekte; canlı satış veya ödeme oluşturulmadı.
- 1440×1000, 1024×1000, 390×844: document scrollWidth = viewportWidth, görünür taşma yok. Mobil tek checkout CTA aynı footer içinde panel alt navigasyonunun üzerinde.
- Adet artırma ve arama sonucunda mevcut varyantı ekleme adedi artırdı.
- Kısmi tutar toplamdan büyükken ödeme düğmesi devre dışı; Tamamı gizli hatayı temizledi.
- Birim fiyat dialog açılış odağı; son düğmeden Tab ilk kapatma düğmesine döndü; Vazgeç sonrası tetikleyiciye odak döndü.
- Mobil müşteri dialogu görünüm ve kapatma kontrolü PASS.
- Bekleyen ödeme: barkod, adet, fiyat/indirim ve depo kilitli; yeniden tahsilat uyarısı görünür.
- Alınmış ödeme: ödenmedi iptal düğmesi yok; yerel örnek tamamlamada fiş ve sipariş numarası görünür.
- Boş sepet: çizgisel SVG, Ürün ara ve kapalı ödeme düğmesi. Yükleme: iskelet. Başlangıç 503: görünür hata + yeniden dene ile gerçek console açıldı.
- Tarayıcı error/warn log 0.
- Atlas bağımsız kaynak ve 1440/1024/390 görsel incelemesi PASS; P1/P2 kalmadı.

## Kanıtlar

`evidence/in-store-sales-approved-ui/`: masaüstü/tablet/telefon dolu sepet, fiyat/müşteri penceresi, boş sepet, bekleyen ödeme ve tamamlanan fiş ekran görüntüleri.

IAB sentetik Enter varsayılan tarayıcı form submit davranışını tam taklit etmediği için gerçek fiziksel barkod okuyucusu iddiası yapılmadı; mevcut Enter submit/arama davranışı bileşen testleriyle korunuyor. Veritabanı otoritesi fixture testiyle ikame edilmedi; canlı sürümün kaynak/şema/ödeme sürüm kontrolleri yayın sırasında ayrıca uygulanır.
