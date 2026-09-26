# Barkod etiketleri arayüzü — ortak admin yayını

Tarih: 26 Eylül 2026

Durum: iki ortak admin uygulamasının yayını ve son kaynak/sağlık kontrolleri başarılı.

## Kaynak ve kapsam

Kullanıcı onaylanan barkod arayüzünün canlıya alınmasını istedi. Yayın kaynağı `06fb43db778e37883b74832ba38ed90e9ebb924c`, dal `codex/barcode-approved-ui`. Önceki çalışan kaynak `4353ff4fb9429c6d04c9a4b9852da9115f9ac700`, dal `codex/deepseek-toshi`.

Taze Coolify ve container kontrolleri önceki kaynağı iki uygulamada da doğruladı. Onaylanan barkod commit'i bu kaynağın devamıdır; son DeepSeek, siparişler, POS, ürün ölçüleri ve kategori çalışmaları korunur. Veritabanı geçişi ve yeni API değişikliği yoktur; SQL163 yeniden uygulanmadı.

Tüm aktif ortak müşteri paneli uygulamaları güncellenir:

| Ortak uygulama | Coolify UUID | Deployment |
| --- | --- | --- |
| Siora / `.net` | `e4xe74cmii7jucbkyor0o412` | `vnwvrm7zzo4jj2bmm8785p2u` |
| Güzide / `.site` ve özel admin alan adları | `yk1h6d97z7ex0h74ok3zrj5c` | `klkp12pik21rlv0r6lp9mxay` |

Bu iki ortak uygulamada barınan tüm tenant adminleri güncellemeyi alır. Kabul kontrollerinin bilinen dört adresi: `butik-siora.admin.saas-staging.celebix.net`, `guzide-kuyumcu-4.admin.saas-staging.celebix.site`, `admin.guzidekuyumcu.com`, `admin.guzidekuyumcu.com.tr`.

## Ayarların korunması

- İlk yayın ön kontrolünde global deployment kuyruğu boş; Auto Deploy ve Preview Deploy kapalıdır.
- Yayınlar sırayla başlatıldı. Coolify'nin kendi `queue_application_deployment` işlevi kullanıldı.
- Yalnız kaynak dalı/commit, mevcut `SOURCE_COMMIT` ve aynı kaynağa bağlı iki mevcut PayTR digest değeri güncellendi. Diğer uygulama ayarları, bütün ortam satırlarının kimlikleri/bayrakları, sağlayıcı bilgileri ve deployment hook'ları işlem içinde birebir karşılaştırıldı.
- `.site` mevcut PayTR build/runtime kapsamı açık; `.net` aynı anahtarların kapsamı kapalı kalır. Modlar değiştirilmedi; Iyzico onayı eklenmedi.
- Pre-hook SHA256: `ace00b971421954c7d2c01911fda9dd44103e899d421873679250f182a96eaa3`.
- Post-hook SHA256: `a594d05ac19cc95ff4eba0d19e5617987c21ce3d885642f89b270f0b0852d78e`.

İlk ayar işleminde Eloquent'in `withCount` sorgu çıktıları yenilemede kaybolduğu için koruma kontrolü işlemi geri aldı. `additional_servers_count` ve `additional_networks_count` alanlarının depolanan ayarlar değil sorgu projeksiyonları olduğu kurulu Coolify kaynak kodundan doğrulandı. Bu iki projeksiyon karşılaştırmadan çıkarıldı; bütün depolanan alanların kontrolü korundu. Başarısız ön denemeler deployment başlatmadı ve canlı çalışan uygulamayı değiştirmedi.

## Yedek ve sürüm bağları

Önceki Coolify uygulama, ayar ve şifreli ortam kayıtları 0077 umask ile yedeklendi; deployment başlamadan önce kalıcı sunucu klasörüne kopyalanarak hashleri ve 0600 izinleri doğrulandı:

- `/data/celebix-release-backups/barcode-coolify-e4xe74cmii7jucbkyor0o412-20260926_173349.json`; SHA256 `23a412ebaa03a36bb86ac102a8d5cc169fb5e7d64ee064731277e79cbb5ce018`.
- `/data/celebix-release-backups/barcode-coolify-yk1h6d97z7ex0h74ok3zrj5c-20260926_174113.json`; SHA256 `fe9da97248fa80ce689c951953c875bf55d21453b4d2ef1532a31d83b082b5f1`.

PayTR adapter ve generator kaynakları önceki canlı commit ile aynıdır. Resmî generator ve check işlevleri yeni kaynak için geçti; ayrıca ayrı SHA256 hesabı adayları doğruladı:

- Kaynak digest: `sha256:1a07a5b9de71c42f2c13e55cdd1a4d9f7741f87883199222723708ac2ede800d`.
- TEST: `sha256:8953d9b68cef3afb4caf3abb2e2e649d3413e25bf153740aca9f825238a85d6d`.
- LIVE: `sha256:25c51125051df054ed447fb2770ca55d9a57d739fa9b402991f2b88ad7e6d7b2`.

Bu bağ doğrulaması ödeme işlemi yürütüldüğü anlamına gelmez; bu yayın için sağlayıcı çağrısı yapılmadı.

## Doğrulama

Onaylanan kaynakta 46 etiket/sunum, 21 HTTP ve 12 gerçek bileşen davranış testi, toplam **79/79** başarılı. Yerel müşteri paneli üretim derlemesi başarılı; 1440/1024/390 px arayüz kontrolleri [uygulama raporunda](barcode-label-studio-ui-2026-09-26.md) kayıtlıdır.

İki uzak üretim derlemesi generator, TypeScript ve sayfa üretimini geçerek tamamlandı: Siora `17:39:50 UTC`, Güzide `17:45:22 UTC`. Çalışan container'lar Siora `cbcf57b0e026`, Güzide `e34b8cb51111`. İki çalışan uygulamanın image etiketi ve runtime `SOURCE_COMMIT` exact yayın kaynağına eşit; 14 kaynak dosyası, derlenmiş barkod/sipariş/POS/ürün oluşturma/AI ayar sayfaları ve generated ödeme metadata hashleri doğrulandı.

Son sağlık kontrolü `17:46:26 UTC`: dört admin HTTP200, `status=ok`, Redis `ready`; iki storefront HTTP200. Dört barkod sayfasına oturumsuz istek HTTP307 `/login` döndürdü. Son Coolify kontrolünde iki source pin ve beş mevcut environment bağının değerleri/kapsamları beklenen; hook'lar, alan adları ve kapalı Auto/Preview korunur; global yayın kuyruğu boş.

Önceki `4353ff4f` uygulama image'ları ve iki kalıcı 0600 ayar yedeği korunur. Son ölçümde sunucuda **6.408.962.048 bayt** boş alan vardı; disk/cache/image/volume temizliği yapılmadı. Sonraki yayın kapasiteyi yeniden ölçmelidir. Devam eden Toshi göreviyle yeni kaynak ve yayın sonucu paylaşıldı; sonraki yayın öncesinde barkod commit'ini birleştirmesi ve güncel kaynak/kuyruğu yeniden kontrol etmesi koordine edildi.

Mevcut kontrol tarayıcısı güvenli giriş istiyor. Canlı oturum gerektiren görsel kabul bu yayında başarılı olarak raporlanmaz; kullanıcı kimlik bilgisi alınmadı, oturum kopyalanmadı. Canlı mağaza verisi, şablon, barkod veya baskı işi QA amacıyla yazılmadı; fiziksel yazdırma yapılmadı.

[Deployment kayıtları](evidence/barcode-approved-ui/deployments.json), [çalışan kaynak ve dosyalar](evidence/barcode-approved-ui/runtime.json), [son sağlık](evidence/barcode-approved-ui/health.json), [son public yapılandırma](evidence/barcode-approved-ui/final-config.json), [erişim kontrolü](evidence/barcode-approved-ui/guard.json), [resmî ve bağımsız sürüm bağları](evidence/barcode-approved-ui/binding.json).

## Geri dönüş

Uygulama geri dönüşünde iki paneli önceki `4353ff4fb9429c6d04c9a4b9852da9115f9ac700` kaynağına ve `codex/deepseek-toshi` dalına sabitleyin; `SOURCE_COMMIT` ile mevcut iki PayTR digest değerini birlikte eski değerlerine geri getirin. TEST `sha256:cf11f2cc3c2a9865d72e430099e4ced89aa4b782ad4687693a5f9509068aa9fd`, LIVE `sha256:3f016c5272b0c9a508f0c8f28e0a4e731972f96fbf3b4789d22bd0a49e2a0c77`. Önceki modlar, flagler, kimlik bilgileri ve hook'lar korunmalıdır. Veritabanı down veya yedek geri yükleme bu arayüz yayınının geri dönüşü için gerekli değildir.

Yayın kaydının sonraki belge commit'i canlı kaynak pinini değiştirmez.
