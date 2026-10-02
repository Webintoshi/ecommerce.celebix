# Tasarım ayarları: görsel yükleme ve sade akış

## Kapsam ve işlev envanteri

Ortak Customer Panel'in `settings/design` düzenleyicisi. Mağaza verileri, sunucu uçları, sözleşmeler ve yayın yetkileri değiştirilmedi.

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
- Gerçek bileşenler Chromium tabanlı in-app browser'da **1440 × 1000**, **1024 × 900**, **390 × 844** boyutlarında incelendi. Yatay taşma yok. 390 px'de modal tam ekran, görseller tek sütun, alan yazısı 16 px ve işlem düğmeleri 44 px.
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

Bu görevde canlı yayın başlatılmadı. Çalışma dalı `codex/design-settings-ux-refresh`, başlangıç `4978e88e6e1cf89692c9dfede769bdbc1638d1fa`. Eş zamanlı fiyatlandırma yayınına yarım değişiklik dahil edilmez.
