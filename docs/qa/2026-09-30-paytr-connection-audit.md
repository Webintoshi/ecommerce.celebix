# PayTR bağlantı ve ödeme akışı incelemesi

Tarih: 30 Eylül 2026. Kod tabanı: `14344dc0`; inceleme dalı: `codex/paytr-connection-audit`.

## Sonuç

PayTR entegrasyonu bugün sorunsuz kabul edilemez. Dağıtılmış ödeme yetkileri ile veritabanı yetkisi eşleşmiyor. Bağlantı ekranının test/canlı sözleşmesi de tutarsız. Bunlar API anahtarını tekrar girmekle giderilecek sorunlar değil; yayın ve yetki modelinin birlikte düzeltilmesi gerekiyor.

İnceleme yalnız okuma ve yerel sentetik testlerle yapıldı. Canlı ayarlar, yetkiler, ödeme kayıtları, stok ve siparişler değiştirilmedi. PayTR'a token, tahsilat, iade veya durum sorgusu isteği gönderilmedi. Anahtar ve müşteri bilgileri rapora alınmadı.

## Öncelikli bulgular

### 1. P1 — Canlı ödeme yürütme yetkileri eşleşmiyor

Gerçek dağıtılmış konteynerlerin `build-metadata.generated.ts` dosyaları okundu; sadece çalışma ortamı değişkenlerinden çıkarım yapılmadı. Aynı adaptör kaynak özeti `sha256:1a07a5b9de71c42f2c13e55cdd1a4d9f7741f87883199222723708ac2ede800d` olmasına rağmen servislerin Git kimlikleri farklı olduğundan aday yürütme özetleri farklı:

| Kaynak | TEST | LIVE |
| --- | --- | --- |
| Veritabanındaki etkin yetki | `b332fb0e…` | `14bbcbf7…` |
| Ortak SITE storefront, `d38a5466…` | `ed23a824…` | `563a8c13…` |
| Ortak SITE admin, `68ad9d17…` | `b10271a8…` | `b747c2ac…` |
| Ortak SITE owner, `3de4bbcd…` | `b96dab8d…` | Derlenmiş onay yok |

`BEGIN READ ONLY` içinde `celebix_saas_workflow` rolüyle gerçek `saas.storefront_hosted_payment_execution_authority_matches` işlevi çağrıldı. Storefront LIVE, storefront TEST, SITE panel TEST ve SITE owner TEST için dört sonuç da `false`.

`apps/storefront-shared/lib/default-runtime.ts:479–486` bu eşleşmeyi zorunlu tutuyor. Başlatma hatası kullanılabilir ödeme runtime'ını `null` yapıyor ve sonuç süreçte önbelleğe alınıyor. `lib/payment-adapters/runtime.ts:524–549` mevcut ödeme denemesinin saklanan özetiyle derlenmiş yetkiyi de karşılaştırıyor. Bu nedenle sadece DB özetini değiştirmek eski denemelerin sonuçlandırılmasını düzeltmez.

`packages/payment-adapters/src/providers/paytr/build-binding.ts:144` ve `scripts/generate-paytr-build.mjs:158–166` özetin Git kimliğine bağlandığını doğruluyor. Ödeme dışı yayınlar bile bu kimliği değiştiriyor. Güvenlik kontrolünü kaldırmak uygun bir düzeltme değildir; onay ve geçmiş deneme uyumluluğu birlikte tasarlanmalı.

### 2. P1 — Admin bağlantı ekranı iki ortamı tutarlı desteklemiyor

`apps/customer-panel/lib/payment-providers/catalog.ts:56–66` TEST onayını `sandbox_ready/[test]` olarak sunuyor. `lib/payment-provider-adapters/default.ts:404–415` yalnız `disabled` ve `approved_test_sandbox` modlarını kabul ediyor. Onaylı modda canlı ayarlar `default.ts:214` tarafından reddediliyor.

Yerel saf bileşim tekrarında: kapalı mod + derlenmiş TEST onayı katalog ile registry'yi uyuşturamıyor, `configurable=false`; onaylı TEST modunda kurulum açılıyor fakat `liveAccepted=false`.

Canlı NET adminde mod kapalı ve derlenmiş onaylar `null`. SITE adminde mod `approved_test_sandbox`. NET tarafındaki kapalı modun işletme kararı olup olmadığı bu incelemede doğrulanmadı; bu dağıtımda PayTR kurulumu kullanılabilir değildir.

### 3. P2 — Etkin canlı yöntem varken yanlış bağlantı durumu gösterilebiliyor

Güzide'de TEST ve LIVE profilleri `active`, yalnız LIVE ödeme yöntemi `active`. `lib/payment-settings-ui/model.ts:333–348,438–454` etkin ödeme yöntemini dikkate almadan önce profil seçiyor. TEST ilk sıradaysa model TEST profilini seçip “PayTR'a şu anda ulaşılamıyor” diyor. Aynı kayıt yapısıyla yerel tekrar doğrulandı. Bu metin sağlayıcıya ağ isteği yapılmadan üretildiği için PayTR erişim hatası kanıtı değildir.

Ek olarak pending TEST doğrulaması `PaymentProviderConnectionDrawer.tsx:79` üzerinden formun tamamını, dolayısıyla `PaytrConnectionForm.tsx:89` ortam anahtarını kapatıyor; kullanıcı diğer ortama geçemiyor.

### 4. P2 — Sonuç bildirimi önce gelirse müşterinin dönüş ekranı engelleniyor

`apps/storefront-shared/proxy.ts:69–75` PayTR sonuç iFrame'ine izin vermek için hâlâ etkin ödeme sunumunu istiyor. SQL091:396 sunumu yalnız `provider_ready` aşamasında kabul ediyor; SQL110:352–355 doğrulanmış bildirimle oturumu `captured` yapıyor. Sonrasında proxy:197–208 sonuç sayfasını `frame-ancestors 'none'` ve `X-Frame-Options: DENY` ile döndürüyor. İçerideki üst pencereye dönüş betiği çalışamıyor.

Yerel proxy tekrarında bekleyen sunum izinli, `captured/failed` oturumlar engelli. Düzeltme, tamamlanmış oturumun kimliğini ve mağazasını doğrulayan sonuç yetkisini ödeme sunum yetkisinden ayrı kullanmalı. Bildirim ve tarayıcı dönüşü asenkron işlemler; [PayTR iFrame 1. adım](https://dev.paytr.com/iframe-api/iframe-api-1-adim).

### 5. P2 — Türkçe müşteri bilgilerinde karakter sınırı bayt olarak uygulanıyor

`packages/payment-adapters/src/providers/paytr/config.ts:85–89` bütün sınırlı dizgelerde UTF-8 bayt sayıyor; `adapter.ts:393` ad için 60 sınırını kullanıyor. [PayTR alan belgesi](https://dev.paytr.com/iframe-api/iframe-api-1-adim) ad sınırını karakter olarak tanımlıyor. Sentetik 50 karakter/66 bayt Türkçe adla başlatma `unknown` dönüyor ve sağlayıcıya sıfır istek gidiyor. Alanlara özel karakter sınırları ve ayrı makul bayt güvenlik sınırları uygulanmalı.

## Canlı operasyon bulguları ve doğrulama sınırları

- Güzide'de 37 LIVE ödeme denemesi `awaiting_customer`, 6 LIVE deneme `provider_outcome_unknown`; son güncellemeleri Ağustos 2026. Bu 43 kayıttan tahsilat yapıldığı veya yapılmadığı çıkarılamaz. Yetki geçişinden sonra sağlayıcının gerçek [Durum Sorgu API](https://dev.paytr.com/durum-sorgu) sonucuyla kontrollü uzlaştırma gerekir; topluca başarılı/başarısız işaretlenmemeli.
- Host systemd zamanlayıcıları, cron dosyaları ve incelenen storefront/owner süreçlerinde ödeme uzlaştırma görevi bulunmadı. Coolify zamanlanmış görevleri ve dış bir zamanlayıcı ayrıca doğrulanmadan otomatik uzlaştırmanın tamamen yok olduğu iddia edilmiyor.
- `guzidekuyumcu.com/health` ve `/api/payments/paytr/callback` için bilgisayardan ve sunucudan yapılan GET erişimlerinin ikisi de Cloudflare üzerinden 403 döndü; staging alias sağlık adresi 200. GET bir PayTR POST bildirimi değildir. PayTR IP'lerinin engellendiği veya panelde bu adresin kullanıldığı henüz kanıtlanmadı; gerçek bildirim URL'sinin dış erişimi ve koruma kuralları kontrol edilmeli. Normal tarayıcı görünümü ve PayTR satıcı panelindeki ayarlar görülemedi.
- Eski `apps/storefront-base/app/api/payments/paytr/callback/route.ts:57–78` tutar/ortam/önceden sonuçlandırma kontrolleri olmadan sipariş durumunu güncelliyor. Bu eski yolun mevcut ortak storefront dağıtımında kullanıldığına dair kanıt yok; yeni ortak akışın bulgularıyla karıştırılmamalı. Kullanan eski mağazalar ayrıca belirlenmeli.
- Eski TEST yürütme worker'ında `validation_unavailable` credential reddine dönüşüyor (`apps/owner/lib/merchant-provider-execution/worker.ts:191`, SQL053:592). Yeni verification yolu geçici hatayı bekleme/tekrar deneme olarak koruyor. Ortak düzeltme bu doğru davranışı esas almalı.

## Geçen kontroller

168 mevcut odaklı test geçti: adaptör/config/build-binding 29, ortak checkout/bildirim/tekrar/IP 81, panel bağlantı/model/HTTP 58. Yukarıdaki bileşim, çift profil ve tamamlanmış dönüş tekrarları mevcut testlerin kapsamadığı durumları ortaya çıkardı. Tüm ödeme sisteminin uçtan uca sorunsuz olduğu iddia edilmiyor.

HMAC alan sırası, kuruş hesaplamaları, taksit farkıyla daha yüksek toplamın işlenmesi, ödeme başlatma tekrar koruması, mağaza sahipliği ve şifreli credential bağlamı incelenen ortak yollarda doğru. Tarayıcı başarılı dönüşü tahsilat kanıtı kabul edilmiyor; [PayTR sonuç bildirimi](https://dev.paytr.com/iframe-api/iframe-api-2-adim) ve [canlıya geçiş süreci](https://dev.paytr.com/home/iframe-api-entegrasyon-sureci) temel alındı.

## Düzeltme sırası

1. Mevcut onayları, profilleri ve bekleyen denemeleri koruyan ödeme yetkisi geçişini hazırlamak; adaptör kaynak kimliği ile uygulama yayını kimliğini açıkça ayırmak. Yayınlar arası geçmiş bildirimlerin güvenli kabulünü test etmek.
2. Admin katalog/registry/HTTP sözleşmesini TEST ve LIVE mağaza doğrulaması için birleştirmek; gerçek etkin yönteme göre durum göstermek. Ortam seçimini pending işlem kilidinden ayırmak; geçici doğrulama hatasını tekrar denenebilir bırakmak.
3. Sonuç dönüşünü doğrulanmış oturum/status üzerinden yetkilendirmek; Türkçe alan sınırlarını düzeltmek. Yeni regresyon testleriyle doğrulamak.
4. Uyumlu DB desteği, storefront, owner ve admini koordine yayımlamak; derlenmiş onay–DB eşleşmesini yayın kapısı yapmak. Önbelleğe alınan kapalı runtime'ı yeni yayınla yenilemek.
5. PayTR panelindeki gerçek bildirim URL'sini ve Cloudflare erişimini doğrulamak; gerçek TEST ödeme bildirimi, tekrar bildirim ve durum sorgusu kabulünü tamamlamak. Token alınmasını canlı tahsilat onayı diye sunmamak.
6. Uzlaştırma görevinin çalıştığını doğrulamak; eski 43 LIVE denemeyi sınırlı gruplarla gerçek sağlayıcı sonucuna göre incelemek. Gerçek tahsilat ve canlı moda açma ayrı kabul adımıdır.
