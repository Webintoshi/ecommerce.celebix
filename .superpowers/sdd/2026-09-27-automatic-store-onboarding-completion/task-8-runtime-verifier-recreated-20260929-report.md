# Task 8 — Kalıcı dizinde yeniden hazırlanan runtime doğrulayıcı

## Kapsam ve sınır

Önceki `/tmp` inspector/wrapper/plan dosyaları bu yerel ortamda bulunmadığından, saklanan runtime report/review kaynaklarına dayanarak **yeni dosyalar ve yeni hash'ler** üretildi. Kaybolmanın nedeni çıkarılmadı. Eski kabul edilmiş dosya byte'larının aynen geri getirildiği veya eski hash incelemesinin yeni dosyalara uygulandığı iddia edilmez.

Donmuş uygulama kaynağı: `3de4bbcdb2808a97e4add42023356b0af2dae046`; değişim tabanı: `c9225a56aa06d5e8cbb1a0ce741b6735596895fb`.

Helper dizini `/Users/Celebix/.codex/onboarding-release-20260929` mode0700; helper/plan/receipt dosyalarının tamamı mode0600. Inspector yalnız `node:fs`, `node:path`, `node:crypto` kullanır. Kaynak, generated TS literal, Next manifest/JS ve worker bundle **metin olarak okunur**. App/provider/worker module import edilmez; worker initializer/tick, HTTP, SQL, provider çağrısı veya konfigürasyon/queue/deployment mutasyonu yapılmaz.

Wrapper varsayılan çağrıda exit2 ile durur. `--plan-only` yalnız frozen Git objelerini okur. `--run-remote` açıkça seçilmeden SSH çalışmaz. Bu agent **hiçbir SSH/Docker/live/HTTP/DB/provider çağrısı yapmadı**.

## Yeni sabit helper hash'leri

| Dosya | SHA256 |
| --- | --- |
| `celebix-onboarding-runtime-20260929-inspect.mjs` | `757e8d57e6f08c1a0967a31982aca9718c8154df3b26151e43b9fb14478ca144` |
| `celebix-onboarding-runtime-20260929-verify.py` | `ced3756648e68412bf212066fe5ee88d298fc838f7f65de4d8c514884833b273` |
| `celebix-onboarding-runtime-20260929-plan.json` | `53356d843e14f6022be6126d9ca3bdb84d2ee686f1862d0d059ffc99ce93a975` |
| `celebix-onboarding-runtime-20260929-selftest.py` | `f35aafdf7c96a4c3797dc110ff3e8a7a01ebb609f018a7122f68b8f340308538` |
| `runtime-source-only-selftest-20260929.json` | `2e67bd9f4af48fad034d859013321ea6be93b2362baf2bf0ae064ad52cdf48f1` |

Inspector hash'i plan içinde sabittir. Wrapper, her çalışmada planın tamamını frozen Git kaynaklarından yeniden türeterek eşitlik arar; yalnız planın kendi yazdığı hash listesine güvenmez. Source path'leri güvenli relative path olarak doğrulanır; frozen blob kimliği ve SHA256 yeniden hesaplanır.

## Kaynak sayımı dürüstçe yeniden türetildi

Önceki107 girdinin tam path listesi kaybolan planla birlikte mevcut olmadığından107 sayısı yeniden yazılmadı. Yeni kural, üç uygulama ve ortak packages altında frozen taban→release arasındaki bütün test olmayan değişimleri ve açıkça listelenmiş mevcut auth/health/payment girdilerini kapsar:

| Uygulama | Planlanan runtime source | İki build generator gerçekten eksikse hash'i eşleşen runtime source | Compiled route |
| --- | ---: | ---: | ---: |
| Customer Panel | 45 | 43 | 8 |
| Storefront | 27 | Eksiklik kabul edilmez | 4 |
| Owner | 74 | 72 | 8 |

Yeni plan **116 farklı runtime kaynak girdisi**, bunların içinde **79 test olmayan değişmiş app/package girdisi** içerir. İlaveten frozen `nixpacks.toml` yerel packaging girdisi doğrulanır. Bu sayılar önceki107 girdinin birebir aynı kümesi oldukları veya gerçek container byte sayıları oldukları iddiası taşımaz. Her target'ın path listesi plan dosyasında görülebilir.

Owner/Panel için yalnız `scripts/generate-iyzico-sandbox-build.mjs` ve `scripts/generate-paytr-build.mjs` gerçek ENOENT + yok lstat durumunda kabul edilir. Böyle kayıtlar `exists:false`, `matches:null`, `packagingQualified:true` ve SHA256 olmadan raporlanır. Mevcut yanlış byte, symlink/dangling symlink, erişim hatası, başka eksik runtime kaynak veya Storefront generator eksikliği reddedilir.

Packaging izni frozen `nixpacks.toml` blob `5d690d48c984bc72a59f0e8e60edb93f3952102f`, SHA256 `3b5c2c5d07447f78439dc8adbf772024117c9778466795fcde84a3e91be52bff`, `node:20-bookworm` ve exact sekiz include girdisine bağlıdır. Yerel wrapper hem blob/hash'i hem türetilmiş policy alanlarını kontrol eder; inspector da aynı sabit policy eşitliğini arar.

## Runtime ve ödeme kontrolleri

- Altı sabit UUID ve app eşlemesi; tek running container, exact `<uuid>:<frozenSHA>` image etiketi, Docker tag image ID / running image ID eşitliği ve healthy veya açıkça `none` healthcheck durumu.
- Exact runtime `SOURCE_COMMIT`; remote Node major20; Owner normal worker/status flag'leri default aşamada exact `false`; Panel/Owner edge allowlist'i exact iki sunucu adresi.
- Her compiled route için Next `app-paths-manifest` exact key/value, gerçek nonempty compiled dosya ve byte hash'i. Pending/status consumer, host/proxy, status-proof/read ve operator retry işaretleri tüm `.next/server` JS dosyalarında aranır.
- Owner bundled worker'ın initializer, claim SQL ve preflight marker'ları metin olarak okunur; CLI/start/builder runtime kaynak hash'leri de kaynak listesinde bulunur. Worker import veya tick yapılmaz.
- İki provider'ın gerçek altı adapter kaynak dosyası resmî sıralamayla hash'lenerek sourceManifest ve üç candidate digest yeniden türetilir. Build generator byte'ları ayrıca frozen kaynak girdisidir; generated TS byte'ları committed default TS ile eşit sayılmaz.
- Generated metadata/export'lar JavaScript çalıştırmadan dar literal parser ile okunur. Exact field keys, schema, provider, environment, version, frozen SHA, sourceDigest ve candidate digest zorunludur. Generated approval map/authority null veya exact izinli tuple olmalıdır.
- Compiled candidate digest ve exact flat candidate literal bulunması kontrol edilir. Bütün flat, primitive üç alanlı authority literal'ları sıra ve tek/çift tırnak farkından bağımsız taranır. Exact izinli candidate tuple dışında stale/unbound/kapalı scope literal'ları reddedilir; duplicate authority field de reddedilir. Ek alanlı metadata authority sayılmaz.
- Ham approval-mode boolean'ları yalnız gözlemsel ayrı alanlardır. Compiled authority scope ile eşit sayılmaz; ham row/value koruması root'un ayrı config guard kanıtıdır.

| Target | PayTR test | PayTR live | Iyzico test |
| --- | --- | --- | --- |
| NET Panel/Storefront/Owner | false | false | false |
| SITE Panel/Storefront | true | true | false |
| SITE Owner | true | false | false |

Candidate digest'leri: PayTR test `sha256:b96dab8d08456335280414992966d7b8ac0ba7a87c67b8743f708c5d5cd519c3`, PayTR live `sha256:cba8a4ce524871ef32c6682de255967e52cd352cc2d35a9a488bb7555e74fe63`, Iyzico test `sha256:91760c99a9839301737cee72524a4c84896e3b0453ad5690e98348ac50e9ee59`.

## Taze yerel doğrulama

- `node --check`: PASS.
- İki Python helper AST parse: PASS.
- `--plan-only`: PASS,116 unique frozen kaynak byte hash'i ve pinned packaging policy eşleşti; `remoteExecuted:false`.
- Dar etkisiz fixture seti: **24/24 PASS**, altı doğru target/scope, approved raw mode + kapalı compiled scope, iki generator packaging sayımı/null kaydı, Storefront eksik generator, mevcut bozuk generator, başka eksik mandatory kaynak, dangling symlink, yanlış policy, karışık stale authority, duplicate alan, ek metadata field ve altı property order/trailing comma varyantı. Varsayılan remote dispatch yokluğu ve planın tam frozen türetim eşitliği de kapsandı.

Fixture kaynakları frozen Git byte'larından kopyalandı; compiled route/chunk/worker içeriği etkisiz sentetik metindi ve çalıştırılmadı. Yalnız helper dizininin altında task'a ait geçici fixture dizini kaldırıldı. Receipt yukarıdaki kalıcı path/hash'te saklanır.

Bu sonuç actual yayımlanmış runtime PASS, signed202 callback execution, geçerli status cookie/session/handoff, TLS/browser/login, DB worker heartbeat veya provider execution kanıtı değildir. Inspector `protocolProof:static_source_and_compiled_markers_only` ve `publicHttpHealthProven:false` sınırlarını açıkça bildirir. Flat literal taraması dinamik/computed JavaScript authority davranışını tek başına kanıtlamaz.

## Root'un bağımsız kabulden sonraki gerçek kontrol komutu

```sh
python3 /Users/Celebix/.codex/onboarding-release-20260929/celebix-onboarding-runtime-20260929-verify.py --run-remote --output-new /Users/Celebix/.codex/onboarding-release-20260929/runtime-all-six-disabled-20260929.json
```

Çıktı yalnız exact mode0700 helper parent altında **yeni** mode0600 dosyaya yazılır; var olan receipt üzerine yazılmaz. SSH root'un mevcut anahtarı, sabit host ve StrictHostKeyChecking=yes ile sınırlıdır. Remote command çıktısı yalnız Docker identity/health ve sanitized inspector JSON'dur; Docker labels/env inventory, credential, token, body, raw stderr, SQL veya merchant veri dökümü yoktur. Remote Node script stdin ile çalışır; remote diske helper yüklenmez.

Yeni bağımsız peer review `/root/proxy_public_health_check` agent'ına stable hash'lerle gönderildi. Sonucuna kadar gerçek probe bu agent tarafından başlatılmadı. Uygulama kaynakları/ref pinleri/queue/env/provider/SQL değiştirilmedi; root gerçek probe ve deployment sahibi olmaya devam eder.
