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

## Canlı yayın

Ortak panel kaynak adayı `6024e1b66f511883e33f863f9f3af3cd341eae04`, normal push ile `codex/shared-catalog-search` üzerine yayımlandı.

- NET: `gvs27ivb4nnbsbwrqtprg7z2` finished; SITE: `aqqxz1atop1cd49j3jjhdcw0` finished.
- İlk NET denemesi `aweinyrheyubm348una53or6` uygulama derlemesinden önce Docker frontend deposu TLS handshake timeout nedeniyle başarısız oldu. Eski iki runtime333 sağlıklı kaldı; registry metadata probe geçti. Bilinen başarısız denemeye bağlı, ayrı create-only kayıtlı tek retry uygulandı; özgün snapshot/prepared/receipt/spec/ödeme kanıtı korundu. 202 guard ve bağımsız Atlas retry incelemesi PASS.
- Final ortak panel runtime görüntüsü/kaynak SHA/ödeme derleme metaverisi/profile/DB authority PASS. İki panelde 334 kaynak dosyası, 51 derlenmiş route ve gerekli istemci feature group PASS; 17 fixture/test yolu source-only proof içinde.
- SQL198 + finans SQL200/201 read-only readiness ve ENABLED credit v2 PASS. Mevcut ödeme/env/preview/hook/config kayıtları aynen; yalnız iki panel kaynak pini ilerledi. Sağlıklı storefront witness `1f0844912e90e32b95599ac6a52be47d1064a70f` korundu. Final raw config/queue audit verified, global idle.
- Butik Siora ve Güzide `/orders/quick-links` public read-only HTTP probe:200, beklenen login sınırı; sunucu hatası yok. Oturum gerektiren gerçek müşteri ekranında yeni satış/ödeme işlemi yapılmadı. Görsel/etkileşim QA gerçek Console bileşeninin izole fixture örneğinde yapıldı.
- Son üretim kaynakları için yerel production build PASS; 87/87 odaklı test PASS.

Ödeme sağlayıcısı çağrılmadı; muhasebe/satış verisi ya da şema değiştirilmedi. Özel kanıtlar ve ham şifreli snapshot canlı sunucuda/private yerel yayın paketinde tutulur; bu kayda dahil edilmez.
