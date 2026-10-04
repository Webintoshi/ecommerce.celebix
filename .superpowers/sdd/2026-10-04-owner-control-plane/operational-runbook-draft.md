# Celebix sahip paneli — işletim ve yayın notu

**Güncel durum: 2026-10-04, son teknik kabul BAŞARILI.** İki Owner yayını, SQL214 ve dört gerçek native kontrol, beş mevcut-container yeniden başlatma, altı çalışma zamanı/ödeme/rol kontrolü ve12 genel HTTP kontrolü başarılı. İnsan şifre/TOTP kurulumu ve dört mağazada doğrulanmış sahip hesabıyla panel kabulü **bekliyor**. Önceki ilerleme kayıtları tarihsel gözlem olarak korunur; teknik kabul insan girişinin tamamlandığı anlamına gelmez.

## Uygulananlar ve kalan adımlar

| Aşama | Durum / kanıt |
|---|---|
| SQL209–212 üretim desteği | Root bildirimi: tek atomik işlemde uygulama başarılı. İlk yayın anında insan hesabı bağlanmadan önce platform ücret/tahsilat/operatör/destek satırları0. |
| SQL214 ödeme başlangıç uyumluluğu | Üretimde uygulandı. `paytr_iframe_activation_preflight`, `payment_provider_keyed_lifecycle_preflight`, `iyzico_iframe_tenant_activation_runtime_preflight`, `quick_order_hosted_payment_authority_preflight` gerçek workflow rolüyle salt okunur işlemde true döndü. Katalogda fonksiyonun bulunması tek başına kabul sayılmaz. |
| Ortak storefront NET → SITE | Root bildirimi: `71a69150` yayını tamamlandı. Bu kaynak final davet akışını ve satış kabul sınırı desteğini içeriyor. |
| Ortak admin NET → SITE | `6a86dfd3` kabul edildi: NET `z6n12nclfcejpnsqx545sno6`, SITE `tk5i49iuq3hjzx5z3b4ujubp`. Dört ortak merchant okuyucusunun gerçek container, kaynak, ödeme haritası ve sınırlı rol/native yardımcı kontrolleri başarılı. |
| Owner NET | `6a86dfd3`, `tsobyehlfyaf9bsqg48dlq4b` kabul edildi. Genel giriş200, kurulum-bekliyor200, auth/admin404 ve anonim platform401; Chrome giriş ekranı hata/uyarı kaydı olmadan açıldı. İnsan hesabıyla panel kabulü ayrı ve **bekliyor**. |
| Owner SITE | Kontrollü `6a86dfd3` toparlama yayını `ochr111ktzbpebk7dfyjmtwf` tamamlandı. Yalnız mevcut TEST digest satırı9899 canonical kanıta bağlandı; eski başarısız kayıt/receipt ve diğer yapılandırmalar korundu. Son çalışma zamanı ve anonim platform401/auth-admin404/kurulum-bekliyor200 kabulü başarılı. İnsan girişi ayrı bekliyor. |
| Beş mevcut-container çalışma zamanı sıfırlaması | **Başarılı.** Beş aynı container kimliği/kaynak/imaj/Config/HostConfig korundu; altı uygulamanın ham yapılandırması değişmedi ve OwnerNET başlangıç zamanı aynı kaldı. Root özel kanıtı `runtime-reset-existing-214-20261004.verified.json`. |
| Son çalışma zamanı/genel HTTP kabulü | **Başarılı**, `all-runtime-payment-green-20261004.json`, kontrol zamanı2026-10-04T01:42:04.110516Z. Altı gerçek çalışma zamanı/native ödeme hazırlığı/derlenmiş ödeme haritası/sınırlı rol kontrolü ve12 genel HTTP kontrolü geçti: iki Owner401/404/200, dört storefront sağlık200 ve iki admin sağlık200. İnsan hesabıyla kabulü kapsamaz. |
| Destek erişimi ayarı | `CELEBIX_PLATFORM_SUPPORT_ENABLED=true` önceden yapılandırıldı; o anda operatör kaydı0 ve eski Owner desteği oluşturabilecek yeni route taşımıyordu. Dört merchant okuyucusu Owner NET gönderiminden önce kabul edildi. Üretimde destek oturumu oluşturulmadı; gerçek yetkili kullanım şifre/TOTP kabulünü bekliyor. |
| Gerçek sahip girişi | Tek sabit kimlik `sdkahmetcelebi@icloud.com`. E-posta kurulum bağlantısı gönderildi; doğrulanmış e-posta sonrası önceden bağlanmış değişmez kimliği bir kez operatör/audit kaydına geçiren kalıcı systemd hizmeti çalışıyor. Kullanıcının kendi şifresini belirlemesi ve TOTP doğrulaması **bekleniyor**. Hizmetin çalışması veya bağlantının gönderimi, panel girişinin tamamlandığı anlamına gelmez. |
| Dört mağazada canlı kabul | Güzide, Alpler, Lilyum ve Butik Siora: doğrulanmış sahip oturumuyla okuma ve güvenli çalışma zamanı kontrolleri **bekleniyor**. |

## Kimlik ve bağlantılar

- Platform sahibi için ayrılmış **Supabase GoTrue v2.196.0** hizmeti ve ayrı özel kimlik veritabanı kuruldu. Hizmet dışarıya açık veritabanı/servis portu kullanmıyor; owner sunucusu iç bağlantıdan erişiyor. Ön kontrol sırasında sağlık ve SMTP kimlik doğrulaması doğrulandı; son yayın sonrası tekrar kontrol edilmeli.
- `CELEBIX_OWNER_AUTH_INTERNAL_URL` özel hizmet bağlantısıdır. İstemciye yalnız tanımlı genel `/auth/v1` otoritesi ve anon anahtarı gider. Hizmet anahtarı, özel veritabanı parolası, TOTP sırrı ve davet/tahsilat işlem sırları kayda veya bu nota yazılmaz.
- Mağaza üyeliğinin ortak Logto kimliği ile platform sahibinin GoTrue kimliği ayrı otoritelerdir. Aynı e-posta, aynı kimlik numarası veya aynı yetki anlamına gelmez. SQL212 davetleri yalnız sunucuda tanımlı ortak Logto issuer’ına bağlı adayları kullanır.
- Yetki kaynağı sunucunun doğruladığı **issuer/subject**, aktif ve değişmez operatör kaydı, doğrulanmış e-posta, şifreyle giriş ve doğrulanmış TOTP ile `aal2` oturumudur. Kullanıcı tarafından değiştirilebilir profil/rol veya e-posta tek başına yetki vermez. Tek aktif yetkili hesap `sdkahmetcelebi@icloud.com` olacaktır.
- Owner finans bağlantısı yalnız `celebix_saas_platform_operator` sınırlı rolünü; merchant destek bağlantısı yalnız `celebix_saas_support_runtime` rolünü kullanır. Süper kullanıcı, BYPASSRLS, rol/veritabanı oluşturma/çoğaltma veya sahip/tenant/bootstrap/kimlik işçisi rol üyeliği çalışma zamanı kapısında reddedilir. Ham finans, audit ve operatör tablolarına istemci yetkisi verilmez.

## İlk insan kurulumu

1. Gerçek sahibin `sdkahmetcelebi@icloud.com` adresine kurulum/doğrulama bağlantısı gönderildi. Kullanıcı bağlantıyı kendisi açacak. Root tarafından kurulan kalıcı systemd doğrulama hizmeti, yalnız önceden belirlenmiş sabit kimliğin GoTrue tarafından doğrulanmış issuer/subject ve e-posta sonucunu kabul eder; insan doğrulaması sonrasında operatör kaydı/audit bir kez oluşur. İlk kaydolan kullanıcıya veya yalnız aynı e-postayı taşıyan başka bir kimliğe otomatik yetki verilmez. Şifre/TOTP ve panel kabulü ayrı olarak beklenir.
2. Kullanıcı `/security` ekranından kendisi en az12 karakterlik şifre belirler. Ajan şifre veya TOTP sırrı seçmez, toplamaz veya sohbet kaydına yazmaz.
3. Kullanıcı doğrulama uygulamasını QR koduyla bağlar ve güncel6 haneli TOTP kodunu ekranda doğrular. Son oturum hem şifreyle kimlik doğrulaması hem de `aal2` taşımalıdır. E-posta bağlantısı veya yalnız şifre, panel yetkisini açmaz.
4. Çıkış ve yeniden şifre/TOTP girişi kontrol edilir. Süresi dolmuş oturumun yenilenmesi, MFA zorunluluğu ve normal mağaza yöneticisi/eski affiliate hesabının platform uçlarına erişememesi doğrulanır.

Bu adımlar henüz tamamlanmış sayılmıyor. İnsan kurulumu bittikten sonra son durum bu nota eklenmeli.

## Yayın sonrası çalışma zamanı kabulü

- Storefront NET/SITE `71a69150`, admin NET/SITE ve iki Owner `6a86dfd3` kaynakları yayımlandı. SQL214 gerçek native kontrolleri başarılı. Başarısız başlangıcın süreç hafızasında kalması, aynı container/imaj/kaynak/Config/HostConfig ile beş kontrollü yeniden başlatmayla temizlendi. Final altı çalışma zamanı ve12 HTTP kontrolü başarılı; tüm altı ham yapılandırma ve OwnerNET tanığının başlangıcı aynı kaldı. Dockerfile buildpack için resmî restart_only çağrısı tam derlemeye dönebileceği için ilk yardımcı doğru biçimde engelledi; ayar değiştirilmedi veya tam build başlatılmadı.
- Dört mağaza güncel SaaS kayıtlarından sahip, üyeler, alan adları, paket ve kullanım bilgileriyle görünmeli. Sayfa açılması veya liste yenilemesi veriyi değiştirmemeli. Ulaşılamayan ölçüm0 olarak gösterilmemeli.
- Eski tahmini19.000TL hesabı gerçek gelir değildir. Ücret/tahsilat kanıtı olmayan mağazalar yapılandırma bekliyor olarak kalmalı. Üretimde deneme ücreti, sahte tahsilat veya iade kaydı açılmamalı.
- Destek bayrağının gerçek değeri `CELEBIX_PLATFORM_SUPPORT_ENABLED=true`. Ön yapılandırma anında operatör kaydı0; yeni Owner NET route gönderiminden önce dört merchant okuyucusu kabul edildi. Bayrak tek başına operatör yetkisi vermez: doğrulanmış değişmez kimlik, şifre ve `aal2`/TOTP kapıları geçilmeden destek oturumu açılamaz. Üretimde sahte destek oturumu/tahsilat açılmadı. Owner/admin ortak gizli handoff anahtarını kullanır; ham anahtar kayda alınmaz.
- Destek oturumu30 dakika, tek mağaza ve gerçek operatör kimliğine bağlıdır. Tarayıcı bağlantısı ayrı doğrulanır; süre veya iptal kontrolü her istekte yürür. Normal mağaza oturumları ve çalışan kotasıyla karışmamalı. Kritik bir sorun görülürse yeni destek oluşturma bayrağını kapat, mevcut oturumları sunucudaki revoke işlemiyle bitir; merchant satışların tamamlanmasını engelleme.
- Yeni WEB/POS satış kabul sınırı ile mevcut tahsilat/ödeme bildirimi/iade yolları ayrı kontrol edilmeli. Canlı mağazada sırf deneme için satışları duraklatma veya finansal kayıt üretme yapılmamalı; kapsamlı yazma senaryoları izole testte zaten çalıştırıldı.
- Davet kabulünün yeni mağaza kurmadığı, yanlış kimlik/alan adı/süre ile reddedildiği ve kabulden sonra normal ortak SSO girişinin çalıştığı son çalışma zamanı kontrolünde doğrulanmalı. Mağaza üyelik davetinin gerçek e-posta/insan kabulü henüz yapılmış sayılmıyor; sahibin giriş kurulum daveti ise gönderildi ve ayrı izleniyor.

## Owner SITE toparlama kapısı — yayın ve son teknik kabul tamamlandı

- İlk başarısız yayın/deployment kaydı ve receipt değişmeden korundu. Eski TEST kanıt digest’inin yeni kaynağın resmi üretici/doğrulayıcı sonucuyla uyuşmaması kontrollü bağlama ile düzeltildi; koruma kapısı devre dışı bırakılmadı. `ochr111ktzbpebk7dfyjmtwf` resmî toparlama yayını `6a86dfd3` ile finished oldu.
- Bağımsız uyumluluk/kurtarma kanıtı SHA256: `16547465ddec481235ee00469d7da41f192a0655340760d1b84e03b03c14a11e`. Aday `6a86dfd3` paket ve üretici byte’ları kabul edilmiş okuyucuyla birebir karşılaştırıldı. Canonical TEST-only generate/check başarılı; LIVE capability kapalı ve sağlayıcı çağrısı yapılmadı.
- Uygulanan helper yalnız Owner SITE `bpsgdwfiswna06mooguu2mr3` hedefindeki mevcut nonpreview TEST digest satırı9899 değerini `b96dab…` → `b332fb…` canonical kanıtına bağladı. `approved_test_sandbox` modu, SOURCE, tüm preview satırları, diğer ham ortam/yapılandırma alanları, LIVE/panel-mode yokluğu ve kabul edilmiş beş tanık uygulama korundu. Ödeme/SOURCE kanıtındaki5 preview sayısı yalnız ilgili altı anahtar kapsamını belirtir;37 toplam preview satırı da ham karşılaştırmada korundu. Bu işlem LIVE ödeme yetkisi açmadı.
- Root snapshot/rehearse/prepare ve tek resmî queue/yayın aşamalarını tamamladı. SQL214 üretim uyumluluğu ve dört gerçek native kontrol, beş mevcut-container yeniden başlatma ve son altı çalışma zamanı/12HTTP kabulü başarılı. Özel ön kontrol dosyaları `.codex-artifacts/owner-site-payment-compatibility-20261004.json` ve `.tmp/owner-control-plane/release-helper-owner-site-recovery-notes.md` altında; başarısız ilk receipt değişmedi. Üretimde sahte finans/tahsilat/destek oturumu açılmadı.

## Yedek, geri alma ve finans güvenliği

**Tam izole geri alma provası başarılı.** Üretimden alınan son özel208 yedeği yeni izole veritabanına yüklendi; SQL209 →210 →211 →212 ve tüm native kabul senaryoları çalıştırıldı; ters sıra212 →211 →210 →209 sonrası başlangıç manifesti birebir geri geldi.

- Son yedek: `/root/celebix-private-backups/platform-before-209-final-20261004.dump`, 53.590.638byte, mode0600.
- Yedek SHA256: `9c0e3d10deaa11ab599eff1b79fd34229a2acaa12e0aca724c73a33e49845bc2`.
- Önce/sonra manifest SHA256 aynı: `d0099966a6a7de6447e009a197f80795e9c4351a4d85f271e4f8d3978af4842a`.
-5.931 kayıtlı şema/veri girdisi:1.599 native fonksiyon,300 iş tablosu ve384.760 iş satırı; sahiplik, ACL, RLS, indeks, constraint, trigger ve sequence değerleri karşılaştırıldı. Eksik/fazla/değişmiş girdi0. Canlı yedek restore kanıtı `.superpowers/sdd/2026-10-04-owner-control-plane/task-2-final-backup-gate.md`; özel fingerprint/loglar `.codex-artifacts/platform-support/final-restoration/` altında.
- Restore’ın yeniden ürettiği fonksiyon OID’leri ve pg_trgm eklentisinin clone oluşturucu sahipliği başlangıç farkı olarak kaydedildi. Uygulama fonksiyonu yetkisine istisna verilmedi; down, izole başlangıç manifestini tam olarak geri getirdi. Geçici prova veritabanı kaldırıldı.
- İlk gerçek operatör/audit/davet/destek veya finans hareketi kaydedildikten sonra geçmişi yok edecek **down işlemi reddedilir**. Bu beklenen korumadır. Canlı finans/audit geçmişi silinmez, eski yedek güncel üretimin üstüne yazılmaz. Gerçek tahsilatlar gerekçeli ters kayıt/düzeltmeyle ele alınır; yazılım/veri sorunu ileriye dönük düzeltme ile çözülür.
- Olay halinde önce yeni riskli işlemi/bayrağı durdur, güncel veri ve özel authDB yedeğini al, işlem anahtarlarını ve mevcut tutarları koru; izole kopyada düzeltmeyi doğruladıktan sonra uyumlu ileri düzeltme yayımla. Şifre/TOTP veritabanı yedeği SaaS finans yedeğinden ayrı korunmalıdır.

## Son teknik kabul ve kalan insan kurulumu

- Admin NET/SITE ve iki Owner yayını tamamlandı; Owner SITE `ochr111ktzbpebk7dfyjmtwf`, kaynak `6a86dfd3`. SQL214/dört gerçek native kontrol, beş mevcut-container reset sonucu, son Owner SITE anonim HTTP kabulü ve altı uygulamanın çalışma zamanı kapanış kontrolü: **başarılı**. Ek post-reset giriş kontrolünde iki Owner `/login` adresi de HTML200 döndürdü.
- Ayrı GoTrue/private authDB daha önce sağlıklı doğrulandı; kalıcı sabit-kimlik doğrulama hizmeti çalışıyor ve iki Owner genel yetkisiz erişim kapıları geçti. Bağlantı sırları ve özel kimlik doğrulama materyalleri bu nota eklenmez.
- Sabit kimliğe bağlı doğrulanmış e-posta sonrası tek-seferlik operatör/audit bağlama hizmeti kalıcı systemd olarak çalışıyor. İnsan şifre/TOTP, çıkış/yeniden giriş ve bu kurulumun kabulü: **bekleniyor**.
- Dört mağazada okuma, yetkisiz erişim, destek ve davet çalışma zamanı kabulü: **bekleniyor**.
- Destek bayrağı **true olarak yapılandırıldı**; o sıradaki operatör kaydı0 ve merchant-before-Owner sırası yukarıda kaydedildi. Gerçek sahip yetkisiyle destek kabulü: **bekleniyor**; üretimde sahte oturum açılmadı.

## Kapanış kanıtı ve sonraki yayına devir — 4 Ekim 2026

- Altı gerçek uygulama ve12 genel HTTP kapısı kabulü: özel sunucu `all-runtime-payment-green-20261004.json`, kontrol zamanı `2026-10-04T01:42:04.110516Z`, SHA256 `d3266b7ee24a762ddf300b5f20078b37d5454cdc7eca8fc586c0f156e88199d0`. Gerçek merchant ödeme kontrolü salt okunur işlemde çağrıldı; yalnız fonksiyon varlığına bakılmadı. Sağlayıcı veya iş/finans mutasyonu yok.
- Reset sonrası14 doğrulanmış storefront/admin alan adında gerçek HTTPS sağlık200 ve native mağaza kimliği eşleşti. Güzide actual Traefik Docker HTTPS kuralıyla SITE, Lilyum actual file-provider hizmeti üzerinden NET okuyucuya gidiyor. Alpler/Siora NET; Güzide admin SITE, diğer üç admin NET. Güvenli seçilmiş routing kanıtı `.codex-artifacts/platform-support/custom-host-runtime-routing-20261004.json`, kontrol zamanı `2026-10-04T01:44:20Z`, SHA256 `c74a5249eb7a946c569df1ade93fd95521c230ebd44ac710658801f616a5ad1a`.
- Kullanıcının açık onayıyla Mira'ya kaynak pinleri, SQL214 durumu, özel/güvenli kanıt yolları ve sonraki ortak yayın için **GO** iletildi. Root ortak uygulama/veri yayın sırasını devretti; Owner ve özel platformAuth pin/ayarları Mira'nın kapsamı dışında. Kabul zamanındaki kaynaklar tabloda yazılıdır; sonraki ortak yayının kendi kanıtları bu kapanış kaydının yerine geçirilmez.
- Son durum: teknik yayın ve genel erişim kabulü tamamlandı; gerçek insanın e-posta doğrulaması, kendi şifresi/TOTP kurulumu ve yetkili oturumla dört mağaza kabulü **bekliyor**. Tamamlanmamış insan kabulü başarılı sayılmadı.

Bu taslakta üretim para hareketi veya tamamlanmamış insan/çalışma zamanı kabulü başarılı olarak sunulmadı.

Son root kanıtları: `/root/celebix-private-backups/runtime-reset-existing-214-20261004.verified.json` ve `all-runtime-payment-green-20261004.json` (2026-10-04T01:42:04.110516Z). Bunlar kaynak/imaj/yapılandırma değişmeden teknik yayının kabulünü doğrular; insan şifre/TOTP, gerçek sahip hesabıyla dört mağazada panel kabulü ve gerekirse yetkili destek/davet kullanımı ayrı açık adımlardır.
