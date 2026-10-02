# Toshi arayüzü — ortak panel yayını

## Canlı sürüm

İki ortak Customer Panel, `codex/promotion-illustration-polish` dalındaki `bf66681ee7e78181493149903966e3a8f6ebb252` kaynağını çalıştırıyor. Önceki canlı kaynak `01475eba82a18c2052d8dac5c41c71129e969d75` korunarak ilerletildi.

Toshi mevcut üst bardaki “Bana Sorun” düğmesinden açılıyor. Ana sol menüye giriş eklenmedi. `#f8f7f5`, nötr yüzeyler, ölçülü turuncu ve çizgisel native SVG illüstrasyon; sade başlık, geçmiş araması, güvenli biçimlendirilmiş yanıtlar, çok satırlı soru alanı ve mobil yerleşim uygulandı. Drawer yalnız açılınca yükleniyor; ölçülmüş performans artışı iddia edilmiyor.

| Ortak panel | Mağazalar | Deployment | Bitiş UTC |
| --- | --- | --- | --- |
| NET | Butik Siora, Alpler Spor | `qzyg9laco4fsjlfh1zm48iv4` | 2026-10-01 23:57:39 |
| SITE | Güzide ve kayıtlı adresleri | `g3f0wi75tppzujq36xpe5o95` | 2026-10-02 00:04:28 |

## Yayın ve koruma

Kullanıcı canlı yayına ve diğer sohbetle koordinasyona izin verdi. Cemo sohbetine iki panel için sıralı yayın aralığı bildirildi. Bağımsız kit incelemesi PASS; taze başlangıçta iki kaynak aynıydı, otomatik/preview yayın kapalı ve genel kuyruk boştu.

Mevcut ortak kilit ve resmî Coolify kuyruğu kullanıldı. NET finished ardından 44 kaynak, 33 rota, ödeme metadata ve sağlık kontrolleri başarılı olmadan SITE kuyruğa alınmadı. İki owned dağıtım finished; özgün son helper `verified`, `globalIdle=true` verdi. Force/restart/webhook/API/rollback dispatch veya tekrar dispatch kullanılmadı.

Şifreli tam ayar yedeği ve kalıcı prepare/dispatch kayıtları özel sunucu dizininde korundu. Diğer ham ayarlar, bütün preview satırları, NET ödeme ortam satırları/scopeları ve SITE mevcut ödeme onayları korundu. Kaynak SHA bağları bağımsız üreticiyle doğrulandı. Üretim API, migration, veri sözleşmesi, paket veya ödeme kaynak kodu değişmedi; owner/storefront yayımlanmadı.

## Doğrulama

- Customer Panel üretim derlemesi/typecheck başarılı; Toshi UI 28, entegrasyon 9, server/tools/HTTP 24: **61 ilgili test geçti**.
- Yerel gerçek bileşenlerde 1440/1024/390 px, ayrıca 390×500; geçmiş, klavye, güvenli Markdown, çok satırlı giriş, durdurma/kurtarma, hata halinde korunmuş soru ve taşma kontrol edildi.
- Genel panel testlerinin ilk koşusunda 51 başarısızlık vardı. Altı Toshi assertion/mocking uyumsuzluğu düzeltildi ve hedefli kontroller geçti; ilk koşudan 45 kapsam dışı başarısızlık kaldı. Tam suite ve temiz başlangıç karşılaştırması yeniden koşulmadı; genel suite başarılı iddia edilmiyor.
- İki canlı container’da **44/44** exact Git kaynak hash’i, **33/33** derlenmiş rota ve ödeme metadata doğrulandı.
- Yedi merkez/kayıtlı adreste **63/63** anonim erişim kontrolü; beş mağaza adresinde sağlık **200/ok**, Redis **ready** geçti.
- Oturumlu Chrome’da Butik Siora karşılama/illüstrasyon, geçmiş, Escape ve launcher odağı; Güzide’de mevcut gerçek konuşmanın yüklenmesi, yeni konuşma karşılama ve kapanış odağı doğrulandı. Butik Siora yerel mod, Güzide DeepSeek bağlantısı gözlendi. Yeni mesaj veya provider çağrısı gönderilmedi; müşteri/katalog verisi yazılmadı. Gerçek AI üretimi bu yayın kontrolünde yeniden denenmedi.

## Kanıtlar

[Dağıtımlar](evidence/toshi-ui-shared-release/deployments.json), [aday doğrulama](evidence/toshi-ui-shared-release/candidate-verification.json), [son ayar kontrolü](evidence/toshi-ui-shared-release/verify.json), [NET kaynak/rota](evidence/toshi-ui-shared-release/runtime-panel_net.json), [SITE kaynak/rota](evidence/toshi-ui-shared-release/runtime-panel_site.json), [NET metadata](evidence/toshi-ui-shared-release/metadata-panel_net.json), [SITE metadata](evidence/toshi-ui-shared-release/metadata-panel_site.json), [erişim](evidence/toshi-ui-shared-release/http-smoke.json), [sağlık](evidence/toshi-ui-shared-release/health-smoke.json), [NET tarayıcı](evidence/toshi-ui-shared-release/browser-net.json), [SITE tarayıcı](evidence/toshi-ui-shared-release/browser-site.json).
