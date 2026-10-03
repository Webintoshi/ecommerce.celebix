# Otomatik mağaza kurulumu — tamamlama yayını

Bu onboarding yayınının uygulama kaynağı: `3de4bbcdb2808a97e4add42023356b0af2dae046`. Bu daldaki sonraki commit'ler QA ve rapor değişiklikleridir. Sonraki bağımsız Analizler yayını iki Panel'i bunun doğrudan çocuğu e6a1 sürümüne taşıdı; auth/kurulum kaynakları korunuyor. **Son güncelleme:** [Alpler'in HTTPS ve gerçek hesap erişimi düzeltildi](alpler-exact-host-tls-remediation-2026-09-29.md); ortak wildcard/aktivasyon kapısı aşağıda bekliyor.

## Uygulanan değişiklikler

- E-posta doğrulamasından sonra kurulum işi, ilk kayıttaki mağaza ve alan adı kapsamıyla veritabanına atomik yazılır. Kesinti sonrası aynı işlem sürdürülür; tekrar gönderim ikinci mağaza oluşturmaz.
- Ayrı worker; lease, sürüm kontrolü, sınırlı eşzamanlılık ve artan bekleme süreleriyle takılan işleri toparlar. Aktif işlem kilidi zorla alınmaz; mevcut kimlik ve işlem kanıtı korunur.
- Kurulumun tamamlandığı bilgisi doğru tenant, DNS, doğrulanmış TLS ve admin/mağaza health sonucuna bağlıdır. Genel bir HTTP200 yanıtı yeterli sayılmaz.
- Kayıt cevabı bekleme durumunu destekler. Mağaza hazır olduğunda kullanıcı yeni, normal giriş akışına yönlendirilir; durum sorgusu oturum oluşturmaz.
- Admin `/setup`, ürün, tasarım, alan adı, teslimat ücreti ve ödeme hazırlığını gerçek yetkili kayıtlardan gösterir. Boş başlangıç tasarımı geçerlidir; isteğe bağlı logo zorunlu değildir; okuma hatası tamamlandı sayılmaz.
- Kargo ayarlarında açık ücret ve isteğe bağlı 1–365 gün tanımlanır. `14,89` TL, 1489 kuruş olarak kaydedilir; sıfır ücretsiz teslimattır. Mevcut diğer kargo alanları korunur.
- Owner panelinde yalnız yetkili operatörler bekleyen işleri, worker durumunu ve güvenli tekrar denemeyi görebilir.

## Kaynak ve veritabanı doğrulaması

| Kontrol | Sonuç |
|---|---|
| Owner genel testleri | 805/805 başarılı |
| Panel server testleri | 96/96 başarılı |
| Storefront testleri, uygun React koşullarıyla | 568/568 başarılı |
| Üç uygulamanın sabit kaynaktan izole Node20 QA üretim derlemesi | Başarılı |
| Worker bundle import, ağsız Node20 ortamı | Başarılı; initializer/tick çalıştırılmadı |
| PG16 birleşik 167/168/169 up/assertions/down/up | 3/3 başarılı, izole QA |
| İki bağlantıyla completion recovery | Başarılı; işlem/tenant tekilliği korunuyor |
| Korunan izole merchant grafiğinde ürün/görsel/tasarım/teslimat devamı | 4 başarılı, 0 hata, başka modlara ait 3 test atlandı |
| Panel geniş ilk test grubu | 1631 başarılı, 19 hata, 1 atlanan test |

Panel'in 19 hatası için bağımsız baseline incelemesi yapıldı: ilgili kaynak/test girdileri önceki kaynakla aynı. Bu sonuç genel suite'in başarılı olduğu anlamına gelmez; testler gevşetilmedi. Yeni odaklı kurulum ve teslimat kontrolleri geçti.

Canlı 167/168/169 migration'ları **28 Eylül 08:50:32 UTC** tarihinde up+assertions ile uygulandı. On mevcut merchant tablosunun sayıları ve tam satır hash'leri birebir korundu. Canlıda down, kayıt sıfırlama veya kanıt silme yapılmadı. [Canlı migration kanıtı](evidence/automatic-store-onboarding/live167-169-apply-20260928.json).

Yeni izole merchant fixture'ı başlangıçta sıfır mağazayla hazırlandı. İlk sürecin tam sonuç kaydı yerel ortam kesintisinden sonra bulunamadı; yeniden incelemede tek tamamlanmış sentetik kayıt grafiği ve henüz ürün/görsel/teslimat ücreti olmadığı doğrulandı. Kayıt tekrar edilmedi. [Salt okunur başlangıç kanıtından](evidence/automatic-store-onboarding/merchant-initial-readonly-20260929.json) sonra yalnız aynı grafiğin merchant aşamaları bir kez sürdürüldü: taslak ürün ve varyant, doğrulanmış bellek görseli, sürüm2 yayımlanmış tasarım ve aktif 1489 kuruş/365 gün teslimat ücreti ile tekrar denemeleri geçti. On kayıt grafiği tablosu ve başlangıç bildirim ayarı korundu. [Devam sonucu](evidence/automatic-store-onboarding/merchant-continuation-final-20260929.json) 4 başarılı test gösterir; kaybolan bütün fresh sürecin başarılı olduğu iddia edilmez. Sentetik kimlik/bellek depolama kontrolleri gerçek Logto e-posta teslimatı, R2 veya tarayıcı kabulü sayılmaz.

## Yayın ve çalışan sürüm

Altı NET/SITE admin, mağaza ve Owner uygulaması resmi Coolify kuyruğunda sırayla aynı sabit kaynakla yayınlandı; dağıtımlar `finished`, global kuyruk boş. İki Panel'in yeni protokol yolları çalışan image, kaynak hash'leri ve derlenmiş yollarla doğrulandıktan sonra Owner yayını başlatıldı. Son shared4+Owner2 configuration guard başarılıdır. [Dağıtım/config kanıtı](evidence/automatic-store-onboarding/deployment-config-final-20260929.json).

Canlı public GET kontrolleri **8/8 başarılı**: iki Owner health, Siora ve Güzide admin/mağaza health çiftleri ile iki kayıt ekranı. Merchant çiftlerinde doğru hostname, geçerli store kimliği ve aynı mağaza eşleşmesi kontrol edildi; tüm health cevapları `no-store`. Kayıt ekranlarında aynı etkin POST formundaki action, zorunlu alanlar, onay kutusu, submit ve doğru alan adı son eki doğrulandı. [HTTP/form kanıtı](evidence/automatic-store-onboarding/public-health-final-20260929.json), tarayıcı etkileşimi, signed202 işlemi, yeni kullanıcı oluşturma veya yeni wildcard TLS kanıtı değildir.

Çalışan Owner NET imajının worker paketi ağsız, ortamı temizlenmiş, salt okunur ayrı container'da `--check-runtime` ile **768 ms / exit0** doğrulandı. [Paket kanıtı](evidence/automatic-store-onboarding/worker-runtime-import-final-20260929.json). Initializer, job tick, veritabanı veya sağlayıcı çalıştırılmadı; bu sonuç canlı worker heartbeat değildir.

Normal worker/status bayrakları **false**. Bu onboarding yayınında Auto Deploy, Preview Deploy, preview ortam değerleri ve mevcut ödeme kapsamları korundu. **28 Eylül22:00:04UTC onboarding yayınının altı runtime kontrolü başarılıdır:** exact çalışan imaj/source commit, zorunlu kaynak byte hash'leri, derlenmiş yollar, generated/compiled ödeme scope'ları ve Owner kapalı bayrakları eşleşti. [Tarihli altı runtime kanıtı](evidence/automatic-store-onboarding/runtime-all-six-final-20260929.json). Sonraki Analizler yayını Panel'leri e6a1'e taşıdı; Alpler düzeltmesinin güncel ve daha dar kaynak/koruma kanıtı ayrı rapordadır.

| İki NET/SITE hedefi | Gerçek Node | Eşleşen zorunlu kaynak / plan | Paketleme gereği eksik build betiği | Derlenmiş yol |
|---|---|---|---|---|
| Panel | v20.20.2 | 43/45 | 2 | 8 |
| Storefront | v22.23.3 | 27/27 | 0 | 4 |
| Owner | v20.20.2 | 72/74 | 2 | 8 |

Panel/Owner runtime imajı yalnız iki belirli build generator'ını içermez; bu durum sabit `nixpacks.toml` paketleme politikasıyla doğrulandı. Eksik betikler hash eşleşmesi olarak sayılmadı (`exists:false`, `matches:null`); diğer zorunlu girdilerde eksiklik kabul edilmedi. Docker healthcheck tanımı bulunmayan Panel/Owner `none`, Storefront `healthy` olarak raporlanır; bunlar birbirine eşit sayılmaz. Son runtime kanıtı kaynak/derlenmiş marker kontrolüdür, signed callback veya tarayıcı çalıştırması değildir.

Yerel geçici runtime araçları bulunamadığında yeni araçlar kalıcı özel klasörde, yeni hash'lerle yeniden hazırlandı ve bağımsız incelendi. Yeni frozen plan 116 farklı runtime girdisi ve 79 değişmiş test dışı girdi türetir; eski107 girdinin birebir geri getirildiği iddia edilmez. İlk gerçek çalışmanın iki helper hatası dar biçimde düzeltildi: tam Docker metadata şablonu eksik Health alanında hata veriyordu; bütün hedefler yanlışlıkla Node20 sayılıyordu. Health map üzerinden okunur, Storefront'un sabit `Dockerfile.storefront` kaynağı exact Node22, Panel/Owner'ın `nixpacks.toml` kaynağı exact Node20 gerektirir. [Altı hedefin seçilmiş build yapılandırması](evidence/automatic-store-onboarding/runtime-build-config-provenance-20260929.json) bu ayrımı doğrular; bu kayıt runtime probe sırasında yeniden SQL okunmuş gibi sunulmaz. İlk başarısız helper kaydı özel klasörde tutulur. Yeni wrapper/plan için bağımsız6/6 Node ve4/4 bozuk politika reddi sonrası gerçek altı hedef kontrolü28 Eylül22:00:04UTC'de geçti; uygulama, imaj veya yayın ayarı değiştirilmedi.

Ödeme adapter/generator kaynakları önceki sürümle aynı. Yeni candidate digest'leri sabit kaynağa bağlandı; mevcut NET/SITE kapsam farklılıkları korundu. Salt okunur inceleme, SITE PayTR global veritabanı onayının eski çalışan sürümle de tam tuple eşleşmediğini gösterdi. Yeni sürüm bunu hazır ödeme olarak sunmaz. Global ödeme onayı, aktif merchant ödeme profilleri ve yöntemleri değiştirilmedi; sağlayıcı/ödeme işlemi yapılmadı.

## Kalan canlı kabul kapısı

Daha önce incelenen önerilen Cloudflare kapsamı: `celebix-staging-wildcard-tls`, yalnız `celebix.net` ve `celebix.site`, **DNS Write + Zone Read**, yalnız sunucu IPv4 `46.225.183.57` ve IPv6 `2a01:4f8:1c19:75b5::1`; sertifika yenilemesi için son kullanma tarihi yok. Güncel giriş sonrasında kapsam incelemesi yeniden doğrulanmalıdır.

Bu yeni kalıcı güvenlik erişimi oluşturduğu için tarayıcı kuralı işlem anında açık kapsam onayı gerektirir. Önceden sorulan onay henüz gelmedi; token oluşturulmadı ve wildcard proxy adayı kurulmadı. Önceki Chrome bağlantısı envanterden kayboldu; Alpler tarayıcı kabulü artık in-app browser ile geçti. Güncel Cloudflare sekmesi giriş ekranında; bu oturuma erişim gerekiyor.

Önceki Alpler kontrolündeki TLS kod20 hatası [tarihsel önce kanıtıdır](evidence/automatic-store-onboarding/alpler-public-access-final-20260929.json). Sonraki dar HTTP01 kurulumu iki exact adresin sertifika ve route eksikliğini düzeltti: [güncel Alpler7/7](evidence/automatic-store-onboarding/alpler-http01-public-final-20260929.json), [gerçek mevcut hesap girişi ve ekranlar](evidence/automatic-store-onboarding/alpler-http01-native-browser-20260929.json). Sertifika doğrulaması hiçbir aşamada atlanmadı.

Cloudflare erişimi/kapsam onayı sonrasında ortak wildcard sertifikalar kurulup doğrulanacak; ardından worker/status normal ortamda kontrollü açılacak. Mevcut Alpler Spor hesabı normal girişle admin, ürün formu, tasarım, teslimat, `/setup` ve mağazada doğrulandı; yeniden kayıt yapılmadı. Gerçek wildcard TLS, worker heartbeat/recovery, pending/signed202 ve doğrulama→hazır gecikmesi kalan adımlar tamamlanmadan başarılı sayılmaz.

İlk yayın aşamasında canlı DB ve Coolify yedeklerine ek olarak proxy'nin compose, ACME ve dynamic düzeninden dört dosyalık kararlı özel yedek alındı. Arşiv786862 byte; hash `102963e196e5c4d07865d26aba0eff693a2be3517b8fbb7aa60bbed543482d5b`; arşiv ve receipt mode0600. [İçeriksiz yedek kanıtı](evidence/automatic-store-onboarding/proxy-backup-final-20260929.json). Sonraki Alpler dosyası kurulmadan ayrıca taze dört özel yedek doğrulandı; proxy yeniden başlatılmadı.

Yedekler ve tam şifreli yapılandırma snapshot'ları sunucuda özel izinlerle tutulur; parola, e-posta kodu, token, ACME özel anahtarları ve özel merchant satırları bu rapora/repoya alınmaz. [Devam kayıtlarının korunma kanıtı](evidence/automatic-store-onboarding/resumability-artifacts-final-20260929.json): dört mevcut reviewed helper/spec kopyası birebir doğrulandı, iki dağıtım sahiplik receipt'i Coolify geçici klasöründen sunucunun özel0700 klasörüne yeni0600 kopyalarla saklandı. Yayın yeniden kuyruğa alınmadı ve yapılandırma değiştirilmedi.

Göreve ait QA container'ı temiz biçimde kapandı (`exited`, exit0, OOM yok); AutoRemove false, container ve kalıcı local volume korunuyor. Sentetik kayıt/iş/proof grafikleri sıfırlanmadı veya silinmedi. İlk stop runner'ı başarı makbuzu yazamadı; stop tekrar edilmeden sonraki salt okunur mevcut durum/volume kontrolü geçti. [Son görev kaynağı kanıtı](evidence/automatic-store-onboarding/task-resources-final-20260929.json), ilk runner'ın bütün sonuçlarının başarılı olduğu iddiası değildir. Göreve ait yerel SSH tüneli kapatıldı; build container zaten yok. Bekleyen canlı kabul nedeniyle çalışma dalı ve özel devam yedekleri tutulur.
