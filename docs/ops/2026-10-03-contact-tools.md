# Mağaza araçları — 3 Ekim 2026

**Durum:** Veritabanı 204, dört ortak uygulama yayını ve canlı kabul tamamlandı. Mağazalarda araç başlangıçta kapalıdır.

**İncelenen aday:** `02611e0b9e9cbce2cc18ca563efc3509cdc6596a`. Aday, onaylı Mira sidebar değişikliğini (`810e7c44`) ve güncel Lilyum footer değişikliğini (`a639409f`) içerir.

## Kullanıcıya açılan özellik

Ayarlar / Görünüm altında **Mağaza araçları** ve ilk araç **İletişim balonu** bulunur. WhatsApp, telefon, SMS, e-posta, Instagram, Telegram, Messenger, yol tarifi ve yayımlanmış iletişim sayfası ayrı ayrı açılıp sıralanabilir. Araç başlangıçta kapalıdır.

Ortadaki düzenleme penceresi İçerik, Görünüm ve Gösterim sekmeleri ile Uygula / Vazgeç sunar. Konum, tema, simge, cihaz ve sayfa seçimi, ürün bağlantılı WhatsApp mesajı ve saat dilimine göre çalışma saatleri ayarlanabilir. Önizlemedeki düğmeler sayfadan ayrılmaz. Telefonda düzenleme tam ekran açılır.

Kayıt mevcut tenant izinlerini, sürüm kontrolünü (CAS) ve idempotency altyapısını kullanır. Başarısız kayıt girişleri korur; aynı içeriğin tekrarı aynı işlem anahtarını kullanır. Çakışmada güncel ayarları yüklemek ayrı ve açık bir işlemdir. Public okuyucu yalnız doğrulanmış hostname'in geçerli, etkin aracını verir; hesap ve ödeme yollarında balon görünmez.

## Doğrulama kayıtları

Kanıt yolları depo kökündeki `.tmp/` dizinine göredir. Satırlar ayrı koşumlardır; test sayıları bir toplam olarak toplanmamalıdır.

| Kontrol | Sonuç | Kanıt |
| --- | --- | --- |
| Shared contracts test paketi | 536/536 geçti | `contact-contracts-tests-final.log` |
| Merchant veri sınırı ve okuyucu | 24/24 geçti; iletişim odaklı grup 4/4 | `contact-tools-focused-data.log`, `contact-tools-data.log` |
| PostgreSQL 16 iletişim kabulü | 14/14 geçti | `contact-tools-native.log` |
| Atomik SQL yayın kapısı, izole PostgreSQL | 8/8 geçti | `contact-tools-release/db204-native-check.log` |
| Panel formu, istemci, navigasyon ve presentation | 65/65 geçti | `contact-ui-owned-focused-final.log` |
| Gerçek sunucu rotaları ve izinler | 3/3 geçti | `contact-ui-owned-routes-green.log` |
| Mira sidebar ile form bütünleşmesi / branding | 16/16 ve 7/7 geçti | `contact-sidebar-integration-tests.log`, `contact-sidebar-branding-integration-tests.log` |
| Panel React server test fazı | 301/301 geçti | `contact-panel-react-server-final.log` |
| Storefront test paketi | 790 server ve 146 browser testi geçti | `contact-storefront-tests.log` |
| Lilyum ve iletişim aracı bütünleşmesi | 13/13 geçti | `contact-lilyum-integration-tests.log` |
| Son bütünleşik panel / storefront build | Başarılı; TypeScript tamamlandı | `contact-panel-build-integrated.log`, `contact-storefront-build-final-candidate.log` |

Form testleri Vazgeç ve odak dönüşünü, hata sonrası aynı anahtarla tekrarı, başarılı kaydın döndürdüğü sürümü, açık çakışma çözümünü, salt okunur izinleri, kayıt sırasında kilitlenmeyi, kanal sırasını ve saat/cihaz/sayfa seçimlerini kapsar. Gerçek `SettingsWorkspace` ile önizleme tıklamalarının kayıt bırakma penceresi veya navigasyon başlatmadığı da doğrulanmıştır.

### Geniş paketlerin sınırı

Panelin önceki tam koşumu **2050 test: 1995 geçti, 54 başarısız, 1 atlandı** sonucunu verdi. Orijinal `/tmp` ham raporu executor sıfırlamasında kayboldu; `contact-ui-owned-panel-full-tests.log` korunmuş 54 test adının yeniden oluşturulmuş listesidir. Ham tam koşum raporu olarak sunulmaz.

- Yeni tür ve rota nedeniyle oluşan **4 beklenti/fixture hatası** düzeltildi: typed settings sayısı, finite-kind istemci fixture'ı, generic rota matrisi ve Settings hub bağlantıları. Odaklı kayıtlar yeşildir.
- **49 hata**, uygulama ve paketleri ayrı arşivlenmiş temiz `290ac57f` tabanında aynı test adlarıyla tekrarlandı. Ham stack kayıtları `contact-ui-owned-baseline-failures.log`, seçim listesi `contact-ui-owned-baseline-test-selection.json` içindedir. Bunlar mevcut eski hatalar olarak sınıflandırılmıştır.
- **1 signed-out catalog/inventory Next runtime zaman aşımı**, eşzamanlı geniş koşumlarda görüldü. Eski hata olarak sınıflandırılmadı ve yeniden koşulmadı.

Bu ilk koşum başarısız olduğu için zincirdeki React server fazı o sırada çalışmadı; sonradan ayrı koşulan 301/301 kayıt yukarıdadır. Geniş panel paketinin tamamı yeşil olarak ilan edilmez. Ayrıntılı sınıflama: `contact-ui-owned-classification.md`.

Veri paketinin geniş koşumu **835 test: 832 geçti, 1 başarısız, 2 atlandı** idi (`contact-data-tests.log`). Tek başarısız maksimum gift miktarı testi izole tekrarında geçti (`contact-data-timeout-recheck.log`, 1/1); tüm veri paketi tekrar çalıştırılmış gibi raporlanmaz.

## Veritabanı 204 atomik uygulama

Sonuç belgesi: `.tmp/contact-tools-release/db204-02611e0b9e9c-v3-apply-receipt.log`. Son satır `db204=committed`, aday SHA yukarıdakiyle aynı ve tamamlanma zamanı **2026-10-03 11:46:25 UTC** (14:46:25 İstanbul).

Tek `REPEATABLE READ` işleminde kapalı singleton kayıt, aynı işlemin tekrar okunması ve public null sonucu prova edildi. Savepoint geri alındıktan sonra şema ve satırlar aynen geri döndü; ardından aynı incelenmiş SQL uygulandı. Son kontrol, **288 mevcut tablonun 291483 satırını** işlem içindeki önce/sonra karşılaştırmasıyla değişmemiş olarak doğruladı.

- Migration SHA-256: `b811fb5d4bd063b82befb36907d90ad252eac942543a881a9c8007ab8f29d9d0`.
- İşlem içi veri digest'i: `cd9f4e00310668d3c52fc7566e399049b9da14752dc9a6e253db0f7e15377ad4`.
- Aday/SQL bağı: `contact-tools-release/db204-02611e0b9e9c-v3-binding.json`.
- Dış snapshot karşılaştırması: `contact-tools-release/db204-compare-v3.json`. Yirmi tabloda iki snapshot arasında veri hareketi raporlar; function authority drift veya eksik fonksiyon raporlamaz. Bu dış karşılaştırma sıfır drift sonucu değildir. Migration'ın mevcut iş verilerini değiştirmediğine ilişkin kanıt, atomik işlem içindeki karşılaştırmadır.

Geri dönüş envelope'i aynı adayın `db204-02611e0b9e9c-v3-rollback.sql` dosyasıdır. Herhangi bir iletişim aracı kaydı veya olayı varsa down işlemi `CONTACT_WIDGET_ROLLBACK_REQUIRES_DATA_RECOVERY` ile durur; merchant verileri silinerek bu koşul aşılmaz.

## Dağıtım ve canlı kabul

Ödeme kaynakları ve resmi kanıt üreticisi iki mevcut tabana göre değişmemiştir. Adaya bağlı yayın hazırlık kontrolü 598 guard kontrolünü geçti; sağlayıcı çağırmadı (`.tmp/contact-tools-release-v3/checks-receipt.json`). Bu hazırlık kaydı dağıtım sonucu değildir.

| Sıra | Hedef | Beklenen aday | Sonuç |
| --- | --- | --- | --- |
| 1 | Storefront NET | `02611e0b` | Tamamlandı: `jhyhzibjwi8mdyvd5hh3763k`; runtime/payments/health geçti |
| 2 | Storefront SITE | `02611e0b` | Tamamlandı: `oupllakxeyt0fw4sd1wpnvsd`; runtime/payments/health geçti |
| 3 | Customer Panel NET | `02611e0b` | Tamamlandı: `wohrfpdmey2c26sy9bspe5vx`; runtime/payments/routes/health geçti |
| 4 | Customer Panel SITE | `02611e0b` | Tamamlandı: `irfun8x08bwiqvm7tnj8o7h1`; runtime/payments/routes/health geçti |

Her çalışan image ve SOURCE_COMMIT tam aday SHA ile eşleşti. Derlenmiş ödeme metadata dosyaları resmi aday kanıtlarıyla aynı kaldı: storefront NET `reviewedLiveOnly`, storefront SITE `reviewedTestLive`, panel NET `noApproval`, panel SITE `reviewedTestLive`. Korunan ayarlar, preview kayıtları ve ham şifreli ortam satırları yayın kapısınca doğrulandı; son kuyruk boştu. Belgeler: `.tmp/contact-tools-release-v3/*-runtime-receipt.json`, `final-verify.json`.

Güzide, Lilyum, Alpler ve Siora için dört storefront `/health` ve dört admin `/api/health` adresi HTTP 200 / `ok` verdi. İlk Python taşıyıcısı iki özel storefront alanında HTTPError verdi; yalnız bu iki adres resmi runtime probelarının kullandığı curl taşıyıcısıyla yeniden kontrol edildi ve geçti. İlk sonuç korunmuştur. Son belge: `.tmp/contact-tools-release-v3/health-final-receipt.json`.

Lilyum'un gerçek Chrome mağaza sahibi oturumunda Görünüm menüsünden yeni alan açıldı. Başlık değiştirip Vazgeç sonrası ilk değer korundu. Tüm kanallar ve balon kapalıyken zararsız deneme başlığı Uygula ile kaydedildi; tam yenileme sonrası kalıcı olduğu doğrulandı. Başka oturum değişikliği olmadığı görüldükten sonra başlangıç ayarı Uygula ile geri getirildi.

12:09:41 UTC salt okunur son karşılaştırma: kapalı singleton sürüm 2 ve iki audit olayı; config kanonik varsayılanla tam aynı; public RPC `config: null`. Lilyum'un önceki 18 ayar/tasarım/ödeme/içerik tablosundaki 46 satırın hash ve sayıları aynıdır. Yeni kapalı kayıt ve audit geçmişi korunmuştur. Belge: `.tmp/contact-tools-release/lilyum-widget-acceptance-comparison-final-20261003.json`. Müşteri mesajı veya ödeme işlemi oluşturulmadı.

11:55:38 UTC salt okunur veritabanı kabulünde dört mağazanın doğrulanmış ana alan adları doğru storeId ile `config: null` döndürdü; iletişim kaydı/olayı 0/0 idi. SQL204 assertions geçti; beklenen altı fonksiyon değişikliği ve on yeni fonksiyon dışında fonksiyon veya yetki değişikliği yok. Belge: `.tmp/contact-tools-release/db204-live-readonly-20261003T115539Z.json`.

Yerel tarayıcı kabulünden korunmuş görsel kanıtlar: [masaüstü ayarlar](../qa/evidence/contact-tools/settings-desktop.png), [mobil ayarlar](../qa/evidence/contact-tools/settings-mobile.png), [Lilyum mobil ürün](../qa/evidence/contact-tools/lilyum-product-mobile.png). Bu görseller canlı dağıtım kanıtı değildir.

[Canlı Lilyum ayar ekranı](../qa/evidence/contact-tools/live-lilyum-settings.png) gerçek yönetim oturumunda varsayılan kapalı config geri getirildikten sonra kaydedilmiştir. Yerel 390 px kontrolde yeni Lilyum sabit sepet alanı 771–844 px, balon 701–755 px arasında; yatay taşma 0 px. Alpler alt gezinmesinde de çakışma olmadı; checkout widget sayısı 0. Önceden 1440/1024/390, klavye ve odak davranışı kontrol edildi.

## Kapsam ve araştırma kaynakları

Uygulama kararları [özellik belgesinde](../superpowers/specs/2026-10-03-contact-tools.md) kayıtlıdır. Resmi araştırma kaynakları: [Chaty kullanım](https://chaty.app/help/getting-started/how-to-use-chaty/), [Chaty WhatsApp](https://chaty.app/help/getting-started/how-to-connect-your-whatsapp-to-chaty/), [Crisp iletişim kanalları](https://help.crisp.chat/en/article/how-to-display-channels-contact-information-in-the-chatbox-1p2r14l/), [Crisp saat programı](https://help.crisp.chat/en/article/how-to-schedule-when-to-appear-online-offline-kvso9a/) ve [WAI-ARIA modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
