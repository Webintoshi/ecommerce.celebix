# Mağaza araçları — Mira görünüm ve kullanım yenilemesi

Tarih: 2026-10-03. Onaylı HTML: yerel `store-tools-mira/index.html`. Kullanıcı uygulama ve tüm panellere yayın izni verdi; WhatsApp simgesinin Flaticon'dan alınmasını istedi.

## Kapsam ve işlev envanteri

Birincil görev: iletişim balonunu mağazaya göre ayarlayıp kaydetmeden önce cihaz, sayfa ve çalışma saati bağlamında önizlemek.

- Mevcut dokuz kanal, kanal sırası, etiket ve hedef bilgileri.
- Genel açma/kapama, başlık, karşılama ve buton metni.
- WhatsApp başlangıç mesajı ve ürün bağlantısı seçimi.
- Konum, simge, tema; masaüstü/mobil ve altı sayfa türü.
- Saat dilimi, günler, açılış/kapanış ve mesai dışı davranış/metin.
- Yükleme, boş kayıt, tekrar deneme, salt okunur izin, kayıt sırasında kilitlenme.
- Mevcut sürüm kontrolü ve aynı içerikte tekrar deneme işlem anahtarı.
- Kayıt hatasında korunmuş girişler; çakışmada açık yenileme işlemi.

Yeni görünüm açık çalışma alanı, kısa kanal listesi, tek kanal düzenleyicisi, isimle sayfa seçimi ve inert önizleme kullanır. Kapalı kanalların saklanan bilgileri korunur. URL adresleri normal arayüzde gösterilmez. Zemin ortak `#f8f7f5`, metin ve eylemler nötr, turuncu ölçülüdür. Backend, veri sözleşmesi, SQL ve yetki değişikliği: **NONE**.

## WhatsApp kaynağı

[Whatsapp — Magnific / Flaticon](https://www.flaticon.com/free-icon/whatsapp_3781677). Özgün PNG uygulama içinde yerel sunulur; harici görsel bağlantısı gerektirmez. Görünür kaynak atfı korunur. Lisans ayrıntıları `docs/licenses/whatsapp-flaticon.md` içindedir.

## Doğrulama

- Mevcut iletişim sözleşmesi: **8/8 geçti** (`.tmp/store-tools-mira-contracts.log`).
- Tasarım onayından önce HTML 1440/1024/390, klavye, sıra, hata ve salt okunur akışları incelendi. Bu kontroller uygulama veya canlı yayın kanıtı sayılmaz.

### Gerçek uygulama

- Uygulama davranış testleri **23/23**, izole tarayıcı taşıyıcı testleri **4/4**: ortak son koşum **27/27** (`.tmp/store-tools-mira-ui-tests.log`). Sürüm/idempotency, kayıt hatası ve çakışma, salt okunur görünüm, kapalı kanalların bilgileri, gizli saat doğrulaması, ana dil/yayın filtresi, dokuz inert önizleme, yükleme kilidi, dirty çıkış ve gerçek SettingsWorkspace navigasyon koruması kapsanır.
- Typecheck geçti; üretim build ve içindeki TypeScript kapısı geçti (`.tmp/store-tools-mira-typecheck.log`, `.tmp/store-tools-mira-build-final.log`). İlk build yerel disk cache yazımında ENOSPC ile durdu. Yalnız bu çalışma kopyasının yeniden üretilebilir `.next/cache` klasörü temizlenip son build tamamlandı; başarısız ilk kayıt korunur.
- Yerel gerçek React bileşeni, gerçek panel kabuğu ve SettingsWorkspace ile **1440/1024/390 px: yatay taşma 0**. Mobil metin alanları 16 px; kontroller en az 44 px. Mobil önizleme açıldığında bölüme odak ve kaydırma gider.
- Fareyle WhatsApp ilk sıradan sona taşındı: liste ve önizleme aynı Telefon/Instagram/WhatsApp sırasını gösterdi. Klavye sekme geçişi, satır odağı, native dialog Escape ve kanal ekleme odağı doğrulandı. Dirty uyarısında devam etmek hem taslağı hem çıkış düğmesinin odağını korur.
- Flaticon PNG doğal 512 px, görünen 20 px ve yüklendi. Kaynak SHA-256: `a2f0630f89e9f2d5984cbfa17fadab14b6a2277647d5b94138b755d8ede839fc`.
- Geliştirme sırasında Hot Refresh bağımlılık uyarısı ve geçici eski CSS gözlendi. Kaynaklar tamamlandıktan sonra tam yenileme yapıldı; son kontrollerde yeni konsol hatası yok. Tek korunan eski kayıt 13:56:53 UTC tarihli geliştirme uyarısıdır. Üretim build bu geliştirme mekanizmasını kullanmaz.
- Yerel taşıyıcı canlı repository çağırmaz; yabancı origin ve beklenmeyen API yolları kapalıdır. Bunlar canlı kayıt veya tenant kabulü olarak sunulmaz.
- Bağımsız Atlas: kaynak/CSS, davranış testleri ve tüm üç ekran boyutundaki görseller **PASS**. Son üretim derlemesinde altı contact UI belirteci aynı `/settings/store-tools` client chunk'ında bulundu.

Yerel görseller: [1440 düzenleyici](evidence/store-tools-mira/editor-1440.jpg), [1440 görünüm](evidence/store-tools-mira/appearance-1440.jpg), [1024 gösterim](evidence/store-tools-mira/visibility-1024.jpg), [390 düzenleyici](evidence/store-tools-mira/editor-390.jpg), [390 kanal seçimi](evidence/store-tools-mira/picker-390.jpg), [390 önizleme](evidence/store-tools-mira/preview-390.jpg). Bunlar canlı yayın kanıtı değildir.

## Yayın

Canlı ön kontrol 14:12:52 UTC'de iki panel ve iki storefront için `02611e0b`, healthy runtime, korunan ödeme profilleri ve eşleşen yetkiler verdi. Aktif yayın kuyruğu 0. Yeni panel sürümü ve tamamlanma kayıtları yayın sonrası eklenecek.

### Canlı yayın tamamlandı

İncelenen ve çalışan aday: `20002532fc664684e701e73fb1e63385019838fc`. Ortak panel NET ve SITE 3 Ekim 2026 günü tamamlandı; final kabul 14:45 UTC.

- NET yayın kimliği `hxp3pi3p0wogils22jha75am`, SITE `fh2sbdpj9pnujl8ug4042hwb`: ikisi de **finished**.
- Her iki image/SOURCE_COMMIT adayla tam aynı; **352 runtime kaynak dosyası**, **52 derlenmiş rota** ve **3 aynı parçada UI grubu** eşleşti. Kaynakta kalan 28 QA dosyası ayrı doğrulandı.
- Taze resmi ödeme kanıtı, SQL198/200/201, kredi enabled/v2 ve iki storefront tanığı geçti. Panel NET `noApproval`, SITE `reviewedTestLive` korundu. Storefront pinleri `02611e0b` olarak aynı kaldı.
- Snapshot/geri alma provası ve final ham ayar/ortam satırı karşılaştırması geçti; yalnız panel source pin/SOURCE_COMMIT ilerledi. Son global kuyruk boştu. Kanıt: `.tmp/store-tools-mira-release/root-final-verify.log`.
- Güzide, Butik Siora ve Alpler admin `/api/health` uçları 200, doğru tenant ve `ok`; üçünde özgün 20.610 bayt PNG hash'i aynı. Kanıt: `.tmp/store-tools-mira-release/public-acceptance.json`.
- Butik Siora gerçek Chrome mağaza sahibi oturumunda yeni genel görünüm, açık düzenleyici ve dokuz kanallı seçici açıldı. WhatsApp PNG doğal 512/görünen 20 px; 1680 px canlı ekranda yatay taşma 0 ve uyarı/hata konsol kaydı yok. Kanal seçiciyi açıp kapatmak ayar kaydı oluşturmadı; Uygula kullanılmadı.
- [Canlı Butik Siora kanal seçimi](evidence/store-tools-mira/live-siora-channel-picker.png) gerçek yayın ekranıdır. Önceki altı görsel yerel kabul olarak etiketli kalır.

İlk proof bağlama bitmeden başlatılan üç salt okunur hazırlık kontrolü `unavailable` verdi; korunmuş bu çıktılar yayın yetkisi olarak kullanılmadı. Bağlamadan sonra aynı kapılar taze kayıtlarla geçti. Atlas final artefakt incelemesi PASS sonrası root yalnız `DRAFT_LOCKED` açma ve helper fingerprint güncellemesi yaptı; retry yetkisi kapalı/null kaldı. Başka sohbetin yeni mağaza araçları sürümü için 200025 panel tabanı ve onaylı UI'nin entegre edilmesi bildirildi.
