# Alpler Spor — canlı HTTPS ve mevcut hesap erişimi düzeltmesi

## Sonuç

Alpler'in admin ve storefront adresleri artık geçerli HTTPS ile çalışıyor. 28 Eylül22:43UTC canlı kontrolünde iki sertifika zinciri/hostname doğrulaması ve doğru persisted Alpler tenant kimliği başarılı; sertifikaların89 günü kalıyor. Yedi Alpler kontrolü ve mevcut sekiz health/kayıt ekranı kontrolü geçti. Mevcut hesapla gerçek tarayıcı girişi, `/setup`, ürün formu, tasarım, teslimat, storefront ve boş ürün kataloğu doğrulandı.

Bu düzeltme mevcut Alpler adreslerini kapsar. Dört ortak wildcard sertifika ve yeni mağazaların worker/status üzerinden otomatik tamamlanmasının son canlı kapısı hâlâ bekliyor.

## Kök neden ve uygulama

DNS doğru sunucuya gidiyordu; çalışan Docker router'ları yalnız merkezi panel/Siora adreslerini kapsıyordu. Alpler için router ve ACME sertifikası yoktu; varsayılan sertifika sunuluyordu. Mevcut Traefik3.6 HTTP01 resolver ve izlenen dynamic klasörü iki exact adresi doğrulayabiliyor.

`/data/coolify/proxy/dynamic/celebix-alpler-exact-hosts.yaml` atomik ve mevcut dosyayı ezmeden kuruldu: iki exact HTTP→HTTPS yönlendirmesi, iki exact HTTPS router, priority20. Mevcut Docker servisleri ve storefront authority middleware kullanılır. Yeni DNS credential oluşturulmadı. Proxy aynı container'da sağlıklı; compose ve önceki dynamic dosyaları byte olarak korundu. Sertifikalar mevcut ACME resolver tarafından yönetilir.

- Helper SHA256: `dd81b89d12514077d53659f2fe8758f8fcc32d8f1d8d0afd68cd13dcb3e6236c`.
- Aday SHA256: `93bc1a222f0214c204efec0d8d4bf2887225b70dc063d37c23a9800665d8b588`.
- Kaynak/uygulama image pin'leri, altı kritik runtime kaynak hash'i, ağ, servis, middleware, directory/file güvenliği ve yapılandırma drift kontrolleri uygulamadan önce geçti.
- Author17 inert; bağımsız12 runtime modeli+4 filesystem negative kontrolleri geçti. Bunlar canlı sertifika kanıtının yerine kullanılmadı.

İlk uygulama çağrısı, root'un staging sırasında oluşturduğu görev üst klasörü0755 olduğu için izin preflight'ında durdu. WORK, backup, started/installed receipt ve hedef dosyanın tamamının yokluğu bağımsız ve root salt okunur kontrollerle doğrulandı. Yalnız görev klasörü0700 yapıldı; helper güvenlik kontrolü değiştirilmedi. Taze preflight sonrasında ikinci çağrı tek kurulumu yaptı. İlk hata kaydı korunuyor. Kurulum workspace'i veya hedef dosya varken helper tekrar çalıştırılmamalıdır.

## Paralel yayın ve veri koruması

Diğer yetkilendirilmiş görev, iki Panel'i Analizler güncellemesi `e6a1cc9f95369475a0addd24f4847509050c6777` ile yayımlamıştı. Bu commit doğrudan3de'nin çocuğu; fark yalnız10analytics UI/test dosyasıdır. Yeni panel korunarak NET Panel'in kesin e6a1 image/source pin'i kullanıldı; kritik auth/routing kaynakları3de ile aynı hash'e sahip. Storefront ve Owner4 uygulaması3de'de kalıyor. Bu görev uygulama dağıtımı veya eski sürüme dönüş yapmadı.

Kurulum öncesi compose, ACME ve iki dynamic dosyanın dört özel0600 yedeği `/root/celebix-onboarding-20260929/alpler-http01/before/` altında korundu. Son kontrol tüm yedek hash'lerini ve izinlerini, aynı sağlıklı proxy container'ını ve altı çalışan uygulamanın kaynaklarını doğruladı. Owner NET/SITE worker ve status değerleri hâlâ `"false"`.

Normal giriş yeni auth session oluşturabilir. Kayıt akışı tekrarlanmadı; merchant ürün/tasarım/teslimat/ödeme kayıtlarına hiçbir kaydet/yayınla işlemi gönderilmedi. Parola, kod, session cookie, proxy token veya ACME özel içeriği kanıtlara alınmadı.

## Canlı kanıtlar

- [Taze preflight](evidence/automatic-store-onboarding/alpler-http01-preflight-20260929.json), [ilk izin preflight hatası](evidence/automatic-store-onboarding/alpler-http01-first-preflight-failure-20260929.json), [tek kurulum](evidence/automatic-store-onboarding/alpler-http01-install-20260929.json).
- [Alpler7/7](evidence/automatic-store-onboarding/alpler-http01-public-final-20260929.json): iki strictTLS/doğru tenant health, iki exact HTTPS yönlendirmesi, iki bilinmeyen HTTP hostname404 ve sahte storefront forwarded-host ile Alpler tenant'ının korunması. Bilinmeyen HTTPS hostname/wildcard sertifika kabulü iddia edilmez.
- [Önce mevcut8/8](evidence/automatic-store-onboarding/alpler-http01-public-before-20260929.json), [sonra mevcut8/8](evidence/automatic-store-onboarding/alpler-http01-existing-public-final-20260929.json), [son koruma kanıtı](evidence/automatic-store-onboarding/alpler-http01-preservation-20260929.json).
- [Gerçek tarayıcı gözlemleri](evidence/automatic-store-onboarding/alpler-http01-native-browser-20260929.json): CUA erişilebilirlik sonuçlarının elle özetidir; ham ekran kaydı değildir. Mevcut kullanıcı girişi başarılı; kurulum erişimi ve tasarım hazır, ürün/teslimat/ödeme eksikleri doğru gösterilir. Özel alan adı bölümündeki starter plan sınırı korunur. Ürün formunun ölçü alanları isteğe bağlıdır; teslimat ücretindeki14,89 örneği ve isteğe bağlı1–365 gün alanı görünür.

## Kalan kapı

Cloudflare sekmesi giriş ekranında. Yeni kalıcı DNS anahtarı için önceki kapsam onayı yanıtlanmadı. Ortak NET/SITE wildcard DNS01 kurulumu ve ardından kontrollü worker/status aktivasyonu, gerçek heartbeat/recovery, pending/signed202 ve gecikme kabulü bekliyor. Chrome bağlantısı şartı Alpler tarayıcı kontrolü için aşıldı: Codex in-app browser ile doğrulandı. Mevcut hesap tekrar oluşturulmaz.

Yöntem resmi [Coolify dynamic configuration](https://coolify.io/docs/core/networking/proxy/traefik/dynamic-config) ve [Traefik3.6 ACME](https://doc.traefik.io/traefik/v3.6/reference/install-configuration/tls/certificate-resolvers/acme/) belgeleriyle kontrol edildi. Exact Host/HTTP01 bu iki mevcut adres için yeterlidir; wildcard sertifikalar DNS01 gerektirir.
