# Çizgisel illüstrasyonlar — ortak panel yayını

## Canlı sürüm

İki ortak Customer Panel, `codex/promotion-illustration-polish` üzerindeki `01475eba82a18c2052d8dac5c41c71129e969d75` kaynağını çalıştırıyor. Önceki canlı kaynak `5b35ede0b6d186b4a5cfeff5f787b6370bd9c05d` korunarak ilerletildi.

Yeni indirim ekranında 12 ayrı native SVG sahnesi, Türkçe arama, sade şablon seçimi; oluşturma/kontrol özeti ve boş liste görselleri yenilendi. Analiz içgörülerinde huni/sepet çizimleri aynı aileye taşındı. Dashboarddaki dekoratif giriş yazıları kaldırıldı. Zemin `#f8f7f5`, nötr yüzeyler ve ölçülü turuncu korunuyor. Yeni görseller için raster isteği veya animasyon bağımlılığı yok; ölçülmüş sayfa hızı artışı iddia edilmiyor.

| Ortak panel | Mağazalar | Deployment | Bitiş UTC |
| --- | --- | --- | --- |
| NET | Butik Siora, Alpler Spor | `bpe1yb82c8a8i870b4936lyp` | 2026-10-01 20:44:05 |
| SITE | Güzide ve kayıtlı adresleri | `lxf2ja4kjgmgwlgspr8rfjmk` | 2026-10-01 20:49:41 |

## Korunan ödeme ve yayın bağlamı

Cemo'nun incelenmiş `7fe15418` kanonik PayTR düzeltmesi dar kapsamda dahil edildi. Gerçek kaynak SHA'sına bağlı candidate metadata ve kayıtlı TEST/LIVE execution kimlikleri ayrı doğrulandı. NET'in bütün ödeme ortam satırları/scopeları, SITE'in mevcut onay modları/scopeları, tüm preview satırları, diğer ayarlar ve Iyzico'nun kapalı yetkisi korundu. Provider sırları, DB onayları, profiller, eski ödeme denemeleri veya sipariş verisi değiştirilmedi. Storefront ve owner uygulamaları bu yayında dağıtılmadı.

Yayın, resmî Coolify kuyruğu ve mevcut ortak kilitle iki hedefte sıralı yürütüldü. Şifreli tam ayar yedeği ve kalıcı prepare/dispatch kayıtları özel sunucu dizininde korundu. Force, API, webhook, restart veya rollback dispatch kullanılmadı; tekrar dispatch yok.

## Doğrulama

- Son Customer Panel üretim derlemesi ve typecheck başarılı. İlgili SVG/analiz bileşen testleri 14/14; kanonik PayTR generator/binding testleri 18/18.
- Yerel gerçek bileşenlerde 1440/1024/390 px, yatay taşma 0; Türkçe arama, temizleme odağı ve klavye seçimi geçti. Atlas görsel incelemesi PASS.
- Her çalışan panelde **37/37** Git blobundan türetilmiş kaynak özeti ve **28/28** derlenmiş rota geçti. Ödeme metadata kontrollerinin tamamı geçti.
- Yedi kayıtlı/merkez adreste **49/49** anonim erişim kontrolü; beş mağaza adresinde sağlık 200/ok ve Redis ready geçti. Yayın sonrasındaki ilk `.com` sağlık sorgusunda Redis unavailable görüldü; 20 saniye sonraki sınırlı tekrar beş adresin tamamında ready verdi. Bu başlangıç bulgusu özel kanıtlarda tutuldu.
- Canlı oturumlu ekran etkileşimi iddia edilmiyor: Chrome mevcut güvenli giriş ekranını gösterdi. Görsel/etkileşim kabulü yerel gerçek bileşenlerden, canlı sürüm kabulü exact container/source/route/metadata ve anonim sağlık kontrollerinden oluşur. Gerçek kampanya veya müşteri verisi kaydedilmedi.

## Kontrol beklentisi düzeltmesi ve koordinasyon

İlk runtime listesi 38 dosya/28 rota içeriyordu. `scripts/generate-paytr-build.mjs`, `nixpacks.toml` start.onlyIncludeFiles nedeniyle çalışma paketinde bulunmaz; dashboard anahtarı `/page` değil `/(panel)/page`dir. İlk kontrol 37/38 ve 27/28 verdi. Bağımsız kaynak/paketleme incelemesiyle yalnız bu iki beklenti düzeltildi; SVG, veri ve ödeme kontrolleri korundu. SITE dispatch'i ilk beklenti hatası sonrası durması gereken yerel komut dizisinin devam etmesiyle başlamıştı. Bu sıralama hatası kayda alındı; iki aday kaynak aynıydı ve düzeltilmiş son kontroller iki hedefte de geçti. Sonraki bağımlı adımlar açık başarı koşuluyla yürütüldü.

İki panel finished olduktan sonra Cemo boş genel kuyruğu görüp koordine edilen storefront CSP yayınını başlattı. Bu nedenle özgün son helper genel-kuyruk kontrolünde `GLOBAL_DEPLOYMENTS_NOT_IDLE` verdi; ilk kontrol anında genel kuyruk boş değildi. Özgün dispatch/global-idle korumaları değiştirilmeden, aynı raw ayar/prepare/owned-finished/source-pin kontrollerini kullanan salt okuma kontrolü PASS verdi. En fazla iki ayrı aktif uygulama ve yalnız iki önceden koordine edilmiş storefront UUID'si kabul edildi; aktif panel yayını yok. İki panelin görevi tamamlandı.

Koordine edilen mağaza yayınları tamamlandıktan sonra özgün tam helper tekrar salt okumayla çalıştırıldı: `verified`, iki owned panel yayını finished ve `globalIdle=true`. Tüm kaynak/ayar/scope/preview korumaları geçti. [Son tam doğrulama](evidence/promotion-outline-shared-release/verify-final.json).

## Kanıtlar

[Dağıtımlar](evidence/promotion-outline-shared-release/deployments.json), [aday doğrulama](evidence/promotion-outline-shared-release/candidate-verification.json), [son ayar kontrolü](evidence/promotion-outline-shared-release/verify-scoped.json), [NET çalışma kontrolü](evidence/promotion-outline-shared-release/runtime-panel_net.json), [SITE çalışma kontrolü](evidence/promotion-outline-shared-release/runtime-panel_site.json), [NET ödeme metadata](evidence/promotion-outline-shared-release/metadata-panel_net.json), [SITE ödeme metadata](evidence/promotion-outline-shared-release/metadata-panel_site.json), [erişim kontrolü](evidence/promotion-outline-shared-release/http-smoke.json), [sağlık kontrolü](evidence/promotion-outline-shared-release/health-smoke.json), [beklenti düzeltmesi](evidence/promotion-outline-shared-release/runtime-expectation-correction.json).
