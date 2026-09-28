# Task 8 — Read-only saklama ve QA durdurma denetimi

Bu denetim yalnız exact görev dosyaları/container metadata ve seçili PostgreSQL metadata alanlarını okudu. Dosya kopyalama, deployment/helper mutasyonu, queue, environment, app/worker/provider/HTTP çalıştırması, SQL yazma, container durdurma/silme veya volume işlemi yapılmadı. Raw encrypted before/env snapshot içerikleri okunmadı veya dökülmedi.

## Private deployment artifact'ları

Kaynak container **coolify**. Kaynak prefix: `/tmp/celebix-onboarding-20260928/`.

Önerilen private host destination prefix: `/root/celebix-onboarding-20260928/release/` (mode0700), aynı basename. Bütün altı kaynak **regular file**, mode0600, uid9999. Read öncesi/sonrası inode/size/mtime/ctime/stat eşitliği kontrol edildi. Dosya içerikleri stdout'a dökülmedi.

| Exact kaynak path (coolify içinde) | Byte | SHA256 | Host aynı basename durumu |
| --- | ---: | --- | --- |
| `/tmp/celebix-onboarding-20260928/celebix-onboarding-shared-release-20260928.php` | 21887 | `f9a91891fa513ac40c49e6fdf89705a0c60e7c061d0bae3fa452503636a147ee` | Mevcut; byte-identical,0600 |
| `/tmp/celebix-onboarding-20260928/celebix-onboarding-owner-release-20260928.php` | 16683 | `73180baf6eb6050032cb452c0cd9bdf240dc20c69163c2fff59cc1503a095526` | Mevcut; byte-identical,0600 |
| `/tmp/celebix-onboarding-20260928/celebix-onboarding-shared-spec-20260928.json` | 232 | `dc6304eb8ae403fa2a63dabd573257d9d1269311377fec9f745f31c51822ed62` | Mevcut; byte-identical,0600 |
| `/tmp/celebix-onboarding-20260928/celebix-onboarding-owner-spec-20260928.json` | 234 | `82a42ce5b933ac08c7abcf13863ce455a7738cc62f7e6be15c9e1bcc4e11b513` | Mevcut; byte-identical,0600 |
| `/tmp/celebix-onboarding-20260928/shared-before-source.json.receipts.json` | 204 | `9c3ac20c91216e184186e49471a0d14e076af6c29053fcf4633f866f6f8555de` | Denetim sırasında yok; root600 kopyasını korumalı |
| `/tmp/celebix-onboarding-20260928/owner-before-source.json.receipts.json` | 115 | `350845e610b68d1871ac31b294456a83916b2a3da951e4b89909b176228e9fa0` | Denetim sırasında yok; root600 kopyasını korumalı |

İlk iki helper'ın exact mevcut host kopyaları da frozen reviewed hash'lerle eşleşti. Tekrar overwrite/replay/preparation yapılmadı.

Schema-only kontrolü:

- Shared spec exact keys `releaseSha`, `testDigest`, `liveDigest`; üç string; releaseSha frozen3de ile eşleşti.
- Owner spec exact keys `releaseSha`, `testDigest`, `iyzicoDigest`; üç string; releaseSha frozen3de ile eşleşti.
- İki ownership receipt exact keys `schemaVersion`, `deployments`; schemaVersion1; shared map exact dört target, owner map exact iki target; bütün deployment UUID'leri resmi helper'ın20..32 lower-alphanumeric kuralına uydu.
- Frozen helper receipt path derivation'ı `$snapshot.'.receipts.json'`; inner map `deployments` olarak okunur. İlk incelemede top-level alan sayısı2 olduğu için düz map varsayımı düzeltilerek schema doğrulandı; receipt dosyası değiştirilmedi.

## Exact owned deployment DB bağları

Altı ownership receipt UUID'si için read-only Coolify DB sorgusu yaptı. Her biri için rowFound, expected application UUID, frozen SHA `3de4bbcdb2808a97e4add42023356b0af2dae046`, status finished ve pull_request zero **true**. Queue tablosundaki application ID/text tip farkı ilk read-only sorguda operator mismatch verdi; text join karşılaştırmasıyla safe metadata kontrolü tamamlandı. SQL yazma veya retry/requeue yapılmadı.

| Target | Ownership deployment UUID | Exact kaynak / finished / normal |
| --- | --- | --- |
| panel_net | `f14bde6wahtdc4q34ey7qyre` | PASS |
| panel_site | `jo6s854ogczqivcf0fnqdsyd` | PASS |
| storefront_net | `plor5b53ih54f9vsdlrbsd7m` | PASS |
| storefront_site | `uhdy0oq9x1vsj5iuh64kn2mc` | PASS |
| owner_net | `kvcxxppoivy6v288x41sfqig` | PASS |
| owner_site | `z5u16derljthtpuynuulbwzg` | PASS |

Bu metadata kanıtı çalışma imajı/source/TLS/browser veya provider execution kanıtının yerine geçmez. Root'un ayrı runtime/public health/config preservation gate'leri geçerlidir.

## QA container ve veri saklama

- Exact container adı `celebix-onboarding-qa-20260927`; ID `1bed105ab41df74621533eb0b0e2e0aaf37f7b4ce8cfd3cce1dd72b5b14d825a`.
- Running true; exact `celebix.qa.task=onboarding-20260927` label; PostgreSQL binding yalnız `127.0.0.1:56417`.
- `pg_stat_activity` kendi audit backend'ini hariç tuttu: diğer client0, active0, idle-transaction0, idle0, unknown-state0. Query text, kullanıcı veya merchant row'ları okunup dökülmedi. Bu bir zaman noktası kontrolüdür.
- HostConfig.AutoRemove **false**; restartPolicy **no**, MaximumRetryCount0.
- PostgreSQL'in gerçek data_directory metadata'sı Postgres ağacı altında; Docker mount'u **volume**. Volume adı anonymous-shaped64hex; task'a isim verilmiş volume olduğu iddia edilmedi. Data tmpfs veya container layer üzerinde değildir.
- **Stop tek başına container ve volume'u korur.** Root durdurmayı seçerse exact container ve anonymous volume korunmalı; container/volume delete, `rm -v` veya prune yapılmamalı. Mevcut QA graph/proof verisi temizlenmemeli. Bu agent stop/delete yapmadı.
- Task build container `celebix-onboarding-build-20260928` fixed-name kontrolünde **absent**. Global container/image/volume inventory veya prune yapılmadı.

İlk persistence metadata okumada yerel JSON parser trailing blank line üzerinde hata verdi; yalnız parser boş satırları atlayarak seçili metadata tekrar okundu. Server veya QA veri mutasyonu olmadı. Son persistence alanları yukarıdaki exact task kimliğiyle tekrar eşleşti.

## Root'un saklama tamamlaması

Root, bu denetimden sonra iki ownership receipt'in aynı basename ile private host release dizinine mode0600 kopyalarını koruduğunu ve mevcut dört helper/spec kopyasını tekrar byte-identical doğruladığını bildirdi. Root'un final saklama kanıtı `resumability-artifacts-final-20260929.json` olarak saklandı. Tablo audit sırasındaki durumu gösterir; o sırada eksik olan iki host receipt artık root tarafından korunmuştur. Root durdurma öncesi exact AutoRemove/volume/client-zero koşullarını kendisi tekrar kontrol eder; yalnız task container'ı durdurur, container ve volume'u korur. Bu agent ilave operational read, test veya stop yapmadı.
