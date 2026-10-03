# Task 8 — Gerçek runtime metadata kontrolü sonrası dar v2 düzeltmesi

Donmuş uygulama SHA: `3de4bbcdb2808a97e4add42023356b0af2dae046`. Uygulama, deployment, environment, payment scope ve SQL değiştirilmedi. İlk başarısız gerçek root receipt ve v1 helper/plan dosyaları korundu. Yeni v2 wrapper/plan ayrı dosyalardır; eski hash incelemesinin yeni byte'ları kapsadığı iddia edilmez.

## Gerçek kontrolün ayırdığı iki verifier hatası

1. Root'un ilk gerçek kontrolünde Panel/Owner metadata okuması `container_identity_failed` verdi. Exact Owner `493cc7184360` üzerinde **tam eski altı alanlı** Docker formatını read-only olarak tekrar çalıştırdım: return1, kontrollü eksik map key `Health`. Tam map-index formatı return0 ile altı JSON alanını ve `health:"none"` durumunu okudu. Yalnız Health alanını içeren daha küçük eski format bu sorunu tekrar üretmemişti; neden kanıtı tam eski formattan gelir.
2. Root'un iki Storefront inspector sonucu içeride kaynak/route/payment kontrollerini geçti; wrapper yanlışlıkla bütün uygulamalara Node20 şartı uyguluyordu. Frozen `Dockerfile.storefront` iki aşamada Node22 kullanıyor. Gerçek Coolify build recipe seçimi de aynı Dockerfile'a bağlı.

Bu bulgular uygulama hatası veya merchant/provider sorunu olarak raporlanmadı. Health lookup yalnız `index .State "Health"` ve nested Status index ile düzeltildi. Node kuralı uygulama başına **exact major** olarak kaynağa bağlandı; Node20/22 genel aralığı kabul edilmiyor.

## Yeni stable girdiler

Private dizin `/Users/Celebix/.codex/onboarding-release-20260929` mode0700; dosyalar mode0600.

| Dosya | SHA256 |
| --- | --- |
| Değişmeyen `celebix-onboarding-runtime-20260929-inspect.mjs` | `757e8d57e6f08c1a0967a31982aca9718c8154df3b26151e43b9fb14478ca144` |
| `celebix-onboarding-runtime-20260929-verify-v2.py` | `8b7b12c430c1caba2b29f9d7cb6173e2d7d85413928b0313141d91ebef1088ab` |
| `celebix-onboarding-runtime-20260929-plan-v2.json` | `4b035b5c66d79150879b4c079781c0825d264467027f4f3d3cdeee5a3d4e1da2` |
| `runtime-build-config-provenance-20260929.json` | `fc2781d196d842cab7169e27ce9572e61dc578bf00d0925125bc19e61e4a030e` |

Son dosya gerçek read-only Coolify PostgreSQL sorgusunun yalnız `uuid`, `build_pack`, `dockerfile_location` alanlarını saklar. Altı exact hedef dışında satır alınmadı; env/labels, encrypted snapshot veya merchant verisi okunmadı. Wrapper bu kayıt için exact altı UUID/kapsam/recipe eşitliği ve byte hash'i arar. Kayıt `freshReadDuringRemoteProbe:false` olarak etiketlenir; root'un ayrı taze configuration guard kanıtıyla birlikte değerlendirilir.

| Uygulama | Gerçek build_pack | Gerçek dockerfile_location | Zorunlu Node major | Frozen kaynak |
| --- | --- | --- | ---: | --- |
| Panel NET/SITE | nixpacks | null | 20 | `nixpacks.toml` runImage |
| Owner NET/SITE | nixpacks | null | 20 | `nixpacks.toml` runImage |
| Storefront NET/SITE | dockerfile | `/Dockerfile.storefront` | 22 | `Dockerfile.storefront` iki FROM |

Frozen Storefront Dockerfile Git blob `dccfcb75df07743d03852adffa977fee335279c2`, SHA256 `8b707a735b741c879bc5ede9b5625bdc6edcea26d2ea2263012a48d1e1466aca`. Exact FROM satırları `FROM node:22-bookworm AS build` ve `FROM node:22-bookworm AS runtime`. Wrapper blob, SHA ve bütün FROM listesini Git'ten taze doğrular; extra/stale FROM veya yanlış recipe reddedilir. Owner/Panel pinned nixpacks Node20 policy'si aynen kaldı.

Runtime kaynak sayıları **116 unique /79 değişmiş**, Panel45/Storefront27/Owner74 olarak kaldı. Exact iki build-only generator Owner/Panel qualification, absent null/no-hash sayımı, Storefront mandatory generator, image/SOURCE_COMMIT, source/payment digest/export, compiled authority, route/marker, Worker text ve Owner false flag kontrolleri değişmedi. Local packaging input listesine frozen Dockerfile eklendi; Dockerfile runtime source dosyası bulunduğu iddiası yapılmaz.

## Taze yerel kontrol ve bağımsız kabul

- v2 Python AST: PASS.
- Altı dar Node sürüm pozitif/negatif assertion: PASS; major20/22 çapraz kabul edilmedi, major23 ve suffix varyantı reddedildi.
- `--plan-only`: PASS;116 frozen runtime byte girdisi, iki pinned local recipe girdisi ve kaydedilmiş exact altı build-config alanı eşleşti; remoteExecuted false.
- Bağımsız peer v2 wrapper/plan/provenance hash'lerini kabul etti. Altı rol için pozitif/negatif Node probe, dört target-major/policy-major/frozen-FROM/saved-recipe negatifi ve mock tam altı alanlı Health map-index/none davranışı geçti. Inspector ve önceki56 bounded source/authority/packaging kontrolünün girdileri değişmedi.

Peer source-only inceleme yaptı; operational çağrı yapmadı. Benim gerçek çağrılarım yalnız seçili build-config/deployment/QA metadata ve kontrollü Docker format read'leriydi. **Bu agent gerçek runtime Node inspector çalıştırmadı**, app/worker/provider import etmedi, HTTP/SQL mutasyonu veya deployment/env değişikliği yapmadı. Root gerçek düzeltilmiş altı runtime kontrolünü üstlenir.

## Root gerçek kontrol komutu

```sh
python3 /Users/Celebix/.codex/onboarding-release-20260929/celebix-onboarding-runtime-20260929-verify-v2.py --run-remote --output-new /Users/Celebix/.codex/onboarding-release-20260929/runtime-all-six-disabled-corrected-20260929.json
```

Yeni receipt üzerine yazılmaz; mode0600 exclusive oluşturulur. `nodeVersionMatchesSourcePolicy` ve `expectedNodeMajor` alanları yeni uygulama bazlı kuralı bildirir. Protocol proof hâlâ static source/compiled marker kanıtıdır; signed callback, session/handoff, TLS/browser, live worker heartbeat ve provider execution kanıtı değildir.

## Root'un son gerçek sonucu

Root, bağımsız v2 kabulünden sonra **2026-09-28T22:00:04 UTC** tarihinde altı gerçek runtime kontrolünün PASS sonucunu bildirdi. Corrected receipt SHA256 `8ff745ae45fac8b6b86b8a217c5523b923ad99c7e251c9207f7005d78d41c918`; sanitized219104-byte kopya root tarafından QA evidence'a alındı. Panel43/45 kaynak+8route, Storefront27/27+4route, Owner72/74+8route; exact uygulama bazlı Node20/22 ve Owner iki flag string'inin `false` oluşu doğrulandı. Eksik iki build generator qualified/null olarak ayrı raporlandı. Bu gerçek çalıştırma root'a aittir; yukarıdaki static/TLS/worker/provider kanıt sınırları devam eder.
