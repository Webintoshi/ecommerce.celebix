# Tasarım ayarları: görsel yükleme ve sade akış

## Kapsam ve işlev envanteri

Ortak Customer Panel'in `settings/design` düzenleyicisi. Mağaza verileri, API uçları, sözleşme şekilleri ve yayın yetkileri değiştirilmedi. Canlı doğrulamada ortaya çıkan sorgu zaman aşımı, yalnız mevcut editor SQL fonksiyonunun aynı veriyi bir kez hesaplamasıyla giderildi; ayrıntılar yayın kaydında.

| Alan | Korunan işlemler | İyileştirme |
| --- | --- | --- |
| Logo ve simge | Seçim, yükleme, kaldırma, eski HTTPS logo, paylaşım arşivi | Küçük önizleme, doğrudan dosya seçme/sürükleme, görselli kütüphane |
| Üst alan ve menü | Üç yerleşim, zemin/genişlik, kategori ve koleksiyon hedefleri, ekleme/çıkarma, öne çıkan kategori | Kısa gruplar, sıkı satırlar, klavye ve sürükleme ile sıralama, öne çıkan görsel yükleme |
| Duyuru | Görünürlük, çoklu mesaj, bağlantı, simge/hız/yön/hareket | Tek içerik akışı; hareket seçenekleri kapalı ayrıntıda |
| Banner | Tek/slayt/alt alta, sunum, otomatik geçiş, slayt sırası/görünürlüğü, metin ve bağlantı | Görseller metinlerden önce, masaüstü/mobil yükleme yan yana, mobil fallback |
| Kategori kartları | Düzen, seçilen kategori sırası, kart görseli değişimi | Her kartta doğrudan yükleme |
| Kampanya ve hikâye | Başlık, üst başlık, açıklama, bağlantılar, görselsiz hikâye | Yerinde yükleme; yükleme sürerken yazılan metin korunur |
| Diğer tasarım alanları | Renk/font, ürün seçimi, ürün detay/sepet/alt alan, kampanya zamanlaması, tüm bölüm ekleme/çoğaltma/gizleme/kaldırma/geri alma | Mevcut alanlar ve yetki sınırları korunur |
| Kaydetme | Uygula/Vazgeç, sürüm çakışması, tekrar deneme, salt okunur, odak geri dönüşü | Bekleyen veya başarısız görsel seçimi çözülmeden Uygula kilitli; sayfadan ayrılma uyarısı |

## Görsel sözleşmeleri

- Logo/simge ve doğrudan banner yükleme mevcut `storefront-design/media` callback'ini kullanır; sonuç `mediaId` olarak kalır.
- Kategori, kampanya, hikâye ve menü görseli mevcut `storefront-assets` yüklemesini kullanır; sonuç `assetId` olarak kalır.
- Asset cevapları sözleşme, işlem kimliği, tür ve aktif durum bakımından doğrulanır. Yeniden denemede dosya, işlem kimliği ve açıklama korunur.
- Dosya sınırı JPG/PNG/WebP, 5 MB. Eski görsel yükleme hatasında değiştirilmez. Seçilen dosyanın önizlemesi yeniden deneme için korunur.
- Görsel dosyasının arşive yüklenmesi tasarımı kendiliğinden yayınlamaz. Tasarım değişimi mevcut Uygula işlemini gerektirir.

## Doğrulama

- Customer Panel tür kontrolü başarılı. Son üretim derlemesi başarılı (`next build --webpack`, 93 statik sayfa).
- Tasarım modeli, gerçek bağlı bileşenler, menü/duyuru, media/asset adaptörleri, yükleme istemcisi ve Workspace yaşam döngüsü: **117/117 test geçti**. Mevcut hata sınırı testi ayrı tutuldu; yeni duyuru yüzey testleri eklendi.
- Atlas son kod incelemesi: yeni engelleyici risk veya işlev kaybı bulunmadı.
- Gerçek bileşenler Chromium tabanlı in-app browser'da **1440 × 1000**, **1024 × 900**, **390 × 844** boyutlarında incelendi. Belge ve görünür kontroller viewport'a sığıyor. 390 px'de modal tam ekran, görseller tek sütun, alan yazısı 16 px ve işlem düğmeleri 44 px.
- Menü klavye oklarıyla sıralandı, odak aynı bağlantıda kaldı. Kütüphane Escape ile kapanıp açan düğmeye döndü; modal açık kaldı. Shift+Tab/Tab modal içinde döndü ve kapalı ayrıntılara gitmedi. Vazgeç ve yerel Uygula sonrası odak açan düğmeye döndü.
- Salt okunur örnekte tüm görsel yüklemeleri ve Uygula kapalı. Boş kütüphane ve eksik görsel durumları doğrulandı.
- Dosya seçici ile yerel WebP seçildi: yükleme sırasında önizleme görünür ve Uygula kapalı; ilk deneme hatası dosyayı korudu; Tekrar dene başarılı ve Uygula açıldı. Kategori görselinin beklenen yerel 405 cevabında eski tasarım seçimi/başlığı korundu; dosya Vazgeç ile bırakılınca önceki görsel geri geldi.
- UX örneğinde tarayıcı console warn/error kaydı yok. Kaynak yüklemede yalnız ilgili katalog/asset okumaları yapılır; ürün/ödeme/sepet için gereksiz başlangıç okumaları eklenmedi.

### Ekran kanıtları

- [Banner, 1440 px](evidence/design-settings-ux-2026-10-02/banner-1440.jpg)
- [Banner, 1024 px](evidence/design-settings-ux-2026-10-02/banner-1024.jpg)
- [Banner, 390 px](evidence/design-settings-ux-2026-10-02/banner-390.jpg)
- [Menü, 1440 px](evidence/design-settings-ux-2026-10-02/navigation-1440.jpg)
- [Menü, 390 px](evidence/design-settings-ux-2026-10-02/navigation-390.jpg)
- [Duyuru, 1024 px](evidence/design-settings-ux-2026-10-02/announcement-1024.jpg)
- [Kampanya, 1024 px](evidence/design-settings-ux-2026-10-02/campaign-1024.jpg)
- [Salt okunur logo, 390 px](evidence/design-settings-ux-2026-10-02/logo-readonly-390.jpg)
- [Korunan dosya ve tekrar deneme](evidence/design-settings-ux-2026-10-02/upload-failure-1440.jpg)

### Yerel test sınırı

`/design-settings-fix?ux=1` mevcut gerçek editörleri yerel görsel ve kontrollü state ile açar; yalnız localhost'ta etkinleşir. Media başarı/hata yanıtı burada simüle edilir. Asset API'nın başarılı cevabı/kimliği/türü/aktifliği ve abort davranışı mounted adaptör testlerinde doğrulandı; gerçek arşive yükleme, canlı mağaza üzerinde bu görevde denenmedi. Mevcut kalıcı fixture ve sunucu sözleşmeleri değiştirilmedi.

## Yayın

**Tamamlandı.** Mevcut ortak fiyatlandırma sürümü korunarak `codex/shared-catalog-search` üzerinden NET → SITE sırasıyla yayımlandı. İki panelin uygulama/image pini `4a4cd61319dd41b21d95ddb1b7af39ea2856273c`.

| Hedef | Sahipli dağıtım | Sonuç |
| --- | --- | --- |
| NET ortak panel | `f7fr6mb37kxtvuex01dcgpp6` | Finished; uygulama healthy |
| SITE ortak panel | `ri9p8e231mfejxpfzxk66wgh` | Finished; uygulama healthy |

- **160 test**, üretim derlemesi ve **139 yayın koruma kontrolü PASS**. İki panelde **181 runtime dosyası, 27 derlenmiş rota ve 12 zorunlu istemci işareti** exact adayla doğrulandı; iki source-only test dosyası ayrıca kaynak kontrolüne dahil edildi.
- Yedi panel hostunda sağlık ve yetkisiz erişimde beklenen giriş yönlendirmesi doğrulandı. Ödeme yapılandırması, mevcut onay kapsamları ve ortam satırları korundu; sağlayıcı çağrısı yapılmadı.
- Son kuyruk gözlemi: 2026-10-02 **17:14 UTC**, global aktif kuyruk **0**; iki sahipli dağıtım exact 4a4cd613 sürümünde finished. Yedi host HTTP kontrolü yeniden PASS. [Sanitize edilmiş yayın kanıtı](evidence/design-settings-ux-2026-10-02/release-verification.json).
- Mağazalar salt okunur yayın tanıkları olarak `6853d51b7afbadccf2b8f45312d16095602aa16b` pininde kaldı. Tasarım görevi mağaza deployment'ı başlatmadı; yedi checkout bağımlılığı önceki tanık sürümüyle birebir aynı.

### Güzide sorgu performansı düzeltmesi

Canlı oturumda Güzide'nin tasarım yüklemesi mevcut 5 saniyelik sorgu sınırını aşarak `StorefrontDesignRepositoryError: unavailable` verdi. Kök neden, editor sorgusunun aynı workspace verisini `store` ve `destinations` için tekrar hesaplamasıydı.

- SQL199 kaynağı: `498b3d02652b1ea0b66caf9dd09aef627c63f5be`. Yalnız özel `saas.storefront_design_editor_payload(uuid)` gövdesine `WITH workspace AS MATERIALIZED` eklendi ve lateral join ortak CTE'ye çevrildi. Eski kaynak için exact hash ön koşulu, ters yönde exact kaynak geri dönüşü ve tüm fonksiyon metadata eşitliği korunuyor.
- Eski sorgu 5 saniyede zaman aşımına uğradı; 20 saniyelik **tanılama bütçesinde** 5,502 saniyede tamamlandı. Aday, mevcut **5 saniyelik sınırla** 2,746 saniyede tamamlandı. Tam Güzide JSON çıktısının MD5 değeri iki sorguda da `992f68ada8986dae661d1a0f3b42bcc7`; ürün bilgileri, hedefler ve dinamik fiyat sonuçları değişmedi. Uygulama timeout'u artırılmadı.
- İzole PostgreSQL harness'ında **31 senaryo PASS**, yeni dört senaryo dahil: dolu katalog/görsellerle tekrar okuma, tek workspace çağrısı ve tam çıktı eşitliği, exact down geri dönüşü, tekrar up reddi. İki statik migration testi de PASS.
- Canlı up/assertions/down turu **ROLLBACK** provasından geçti. Ardından tek up ve doğrulama başarılı oldu. Owner, SECURITY DEFINER, STABLE, search_path ve özel ACL aynı kaldı. Üç mağazada editor okuması 5 saniyelik sınırla PASS; mağaza kayıtlarına yazma yapılmadı.
- SQL199 performans düzeltmesi veritabanındaki mevcut fonksiyona uygulandı. Uygulama pini **4a4cd613** kaldı; bu düzeltme için image yeniden yayımlanmadı. Yeni API, tablo/kolon veya mağaza sözleşme şekli eklenmedi; fiyat otoritesi değiştirilmedi.

### Canlı kullanıcı arayüzü ve sınırlar

- Yetkili mevcut Chrome oturumlarında **Butik Siora ve Güzide PASS**: tasarım açılışı, banner düzenleyicisi, gerçek görsellerle kütüphane ve isimli hedef seçimi incelendi. Görünür alanlarda ham adres/teknik kimlik yok. Canlı tasarım kaydı, yayınlama veya görsel yükleme yapılmadı.
- Alpler için mevcut yetkili oturum olmadığı için giriş sonrası GUI incelenmedi. Ortak NET runtime/cohort, host sağlığı ve mağazaya scoped editor veritabanı okuması doğrulandı; bunlar ayrı GUI kabulü sayılmıyor.
- Belge ve görünür kontroller viewport'a sığıyor. Kırpılmış 1 px gizli dosya input'u modalın ham `scrollWidth` ölçümünü etkiliyor; modal için koşulsuz “ham ölçümde taşma yok” sonucu verilmiyor.
- [Canlı Butik Siora banner](evidence/design-settings-ux-2026-10-02/live-siora-banner.jpg)
- [Canlı Güzide banner](evidence/design-settings-ux-2026-10-02/live-guzide-banner.jpg)
- [Sadeleştirilmiş yayın doğrulama kaydı](evidence/design-settings-ux-2026-10-02/release-verification.json)

## Düzeltme: adresleri kullanıcıdan gizleme

Kullanıcının son düzeltmesi: adres/URL/teknik kimlik gösterilmemesi. Ana görev, görsel veya duyuruya isimle bir hedef seçmek.

- Banner, kampanya, hikâye, duyuru ve eski tema editörlerinde ortak isimli bağlantı seçicisi. Mağaza sayfaları, ürünler, kategoriler, koleksiyonlar ve sayfalar grupları ayrılır.
- Mevcut bilinmeyen hedef “Mevcut bağlantı” etiketiyle seçili kalır. Açılışta veya başka bir alan değişirken özgün path/resourceId yeniden yazılmaz; yalnız açık hedef seçimi değiştirir.
- Sosyal profiller ağ ve hesap adıyla eklenir. Geçerli bağlantı yapıştırılınca hesap adı gösterilir; özgün URL içeride korunur. Aynı ağ/HTTPS/host/sorgu kontrolü devam eder.
- Önizleme ve çakışma tablosu ham adresleri/görsel kimliklerini göstermez. Mevcut seçenekler adlarıyla çözülür; çözülemeyen farklı seçimler çalışma/sürüm ayrımıyla belirtilir. Kaydetme/geri yükleme verisi değişmez.
- Adres gizleme tesliminde API, sunucu, veri sözleşmesi ve mağaza kodu değişiklikleri: **NONE**. Sonraki SQL199 yalnız mevcut sorgunun tekrar hesaplanmasını giderir; yukarıdaki yayın kaydında ayrıca belirtilmiştir.

### Doğrulama

- İlgili tasarım, yükleme, footer ve bağlantı akışlarında **132/132 test geçti**. Bilinmeyen hedefin metin düzenlenirken korunması; typed kaynak seçimi; adres gizleme; eski sosyal URL'nin korunması; salt okunur ve karşılaştırma durumları dahil.
- Customer Panel üretim derlemesi başarılı. Bağımsız Atlas bağlantı seçicisi incelemesinde materyal risk bulunmadı; footer ve önizleme değişiklikleri de kök ajan tarafından incelendi.
- Gerçek tarayıcıda 1440 × 1024, 1024 × 900 ve 390 × 844: belge ve görünür kontroller viewport'a sığıyor; görünür adres yok; kategori → Favoriler seçimi doğru hedefi tuttu; Tab odağı sonraki düğmeye gitti. Mobil alan yazısı 16 px. Salt okunur bağlantı alanı/Uygula kapalı.
- Duyuru ve kampanya hedefleri adla; sosyal hesap ekleme Instagram/hesap adıyla doğrulandı. Tarayıcı warn/error kaydı boş. Yeni sunucu okumaları eklenmedi; doğrulama yalnız yerel fixture üzerinden yapıldı.
- [Son banner görünümü](evidence/design-settings-ux-2026-10-02/named-links-final-1440.jpg)
- [Banner 1024 px](evidence/design-settings-ux-2026-10-02/named-links-banner-1024.jpg)
- [Banner 390 px](evidence/design-settings-ux-2026-10-02/named-links-banner-390.jpg)
- [Duyuru 390 px](evidence/design-settings-ux-2026-10-02/named-links-announcement-390.jpg)
- [Kampanya 1024 px](evidence/design-settings-ux-2026-10-02/named-links-campaign-1024.jpg)
- [Sosyal hesap 390 px](evidence/design-settings-ux-2026-10-02/named-links-footer-390.jpg)

Bu bölümdeki 132 test ve fixture sonuçları adres gizleme değişikliğinin yerel kabulünü kaydeder. Birleştirilmiş adayın 160 test, canlı panel doğrulaması ve SQL199 sonuçları yukarıdaki yayın kaydındadır. Başlangıçtaki `709fd01d497452f407f22deab721b878062b6271` fiyatlandırma sürümü ve güncel ortak dal değişiklikleri yeni adayda korunmuştur.
