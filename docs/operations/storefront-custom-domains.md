# Storefront özel alan adları operasyonu

Bu akış yalnızca mağaza vitrinleri içindir. Yönetim paneli adresleri Celebix platform alan adında kalır. Bir alan adı eklemek yeni Coolify uygulaması veya yeni proxy kuralı üretmez; bütün doğrulanmış hostlar ortak `storefront-shared` uygulamasına gider.

## Değişmez mimari

- Cloudflare for SaaS Custom Hostnames sertifika ve host yaşam döngüsünü yönetir.
- `shops-staging.celebix.site` staging müşterisinin ekleyeceği proxied CNAME hedefidir.
- `shops-origin-staging.celebix.site` staging fallback origin’idir ve Cloudflare Tunnel’a bağlıdır. Tek etiketli ad, Cloudflare Universal SSL kapsamını korur.
- PostgreSQL `saas.store_domains` hangi hostun hangi mağazaya ait olduğunun tek otoritesidir.
- `storefront-shared` yalnızca güvenilir edge tarafından imzalanmış `x-forwarded-host` değerini kullanır.
- Platform mağaza adresi özel alan adı ekleme, hata, kaldırma ve geri alma sırasında aktif kalır.

Resmî Cloudflare belgeleri: [Cloudflare for SaaS başlangıç](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/), [Custom Hostnames API](https://developers.cloudflare.com/api/resources/custom_hostnames/), [Tunnel yapılandırması](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/), [Request Header Transform Rules](https://developers.cloudflare.com/rules/transform/request-header-modification/).

## 1. Cloudflare hazırlığı

Staging ve production için ayrı zone, API token, Tunnel ve fallback origin kullanın. Önce staging’i tamamlayın.

1. Zone’da Cloudflare for SaaS’ı etkinleştirin. Sertifika minimum TLS sürümünü `1.2` seçin.
2. Named Tunnel oluşturun. İki ayrı cloudflared replica çalıştırın; ikisi de aynı Tunnel kimliğiyle `infra/cloudflare/storefront-tunnel.example.yml` yapılandırmasını kullansın.
3. `shops-origin-staging.celebix.site` kaydını Tunnel public hostname’i olarak yalnız Coolify ağına açık `http://celebix-storefront-router:8080` servisine bağlayın.
4. `shops-staging.celebix.site` için proxied CNAME oluşturun; içeriği `shops-origin-staging.celebix.site` olsun.
5. Cloudflare for SaaS fallback origin değerini tam olarak `shops-origin-staging.celebix.site` yapın ve durum `active` olana kadar bekleyin.
6. Müşteriye gösterilecek DNS talimatı her zaman `CNAME <müşteri-hostu> shops-staging.celebix.site` olmalıdır.

Production için aynı isimlerin `.celebix.site` karşılığını ve production’a özel kaynakları kullanın. Staging token’ını production zone’a vermeyin.

## 2. Güvenilir edge header sınırı

Storefront doğrudan tarayıcıdan gelen `x-forwarded-host` değerine güvenmez. Tunnel’ın internete açık portu bulunmayan `celebix-storefront-router` origin’i her istekte:

- `x-forwarded-host` değerini gerçek Cloudflare for SaaS `Host` değerinden yeniden yazar.
- `x-forwarded-proto` değerini `https` yapar.
- `x-celebix-storefront-proxy` değerini `p1.<CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL>` ile yeniden yazar.
- Coolify proxy yönlendirmesi için iç `Host` değerini bilinen platform storefront hostuna sabitler.

Aynı 32-byte base64url secret’ı Coolify’de `storefront-shared` ve router için `CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL` olarak kaydedin. Secret’ı kaynak koda, SQL’e, loga veya müşteri paneline yazmayın. Origin portunu internete açmayın; erişim yalnız Tunnel ağı üzerinden olmalıdır. Cloudflare for SaaS fallback bağlantısı müşteri `Host` değerini koruduğu için tenant çözümlemesi router’da bu değer üzerinden yapılır.

## 3. Coolify ortam değişkenleri

Owner worker ve customer-panel sunucu runtime’ı:

```text
CELEBIX_DEPLOYMENT_TIER=staging
CLOUDFLARE_SAAS_API_TOKEN=<server-only-token>
CLOUDFLARE_SAAS_ZONE_ID=<staging-zone-id>
CLOUDFLARE_SAAS_API_BASE_URL=https://api.cloudflare.com/client/v4
CELEBIX_CUSTOM_DOMAIN_CNAME_TARGET=shops-staging.celebix.site
CELEBIX_CUSTOM_DOMAIN_RESERVED_SUFFIXES=celebix.site,saas-staging.celebix.site
CELEBIX_STORE_DOMAIN_WORKER_ID=owner.domains.1
CELEBIX_STORE_DOMAIN_WORKER_ENABLED=false
CELEBIX_SAAS_DATABASE_URL=<self-hosted-postgresql-url>
```

Readiness komutunun çalıştığı güvenli operasyon ortamı ayrıca şunları alır:

```text
CLOUDFLARE_SAAS_ACCOUNT_ID=<account-id>
CLOUDFLARE_SAAS_TUNNEL_ID=<tunnel-uuid>
CELEBIX_CUSTOM_DOMAIN_FALLBACK_ORIGIN=shops-origin-staging.celebix.site
CELEBIX_CUSTOM_DOMAIN_STOREFRONT_PROBE_HOSTNAME=<staging-probe-host>
CELEBIX_CUSTOM_DOMAIN_STOREFRONT_PROBE_STORE_ID=<probe-store-uuid>
CELEBIX_CLOUDFLARE_CUSTOM_HOSTNAME_LIMIT=<approved-zone-limit>
```

API token kapsamını ilgili tek zone ve gereken Custom Hostnames/DNS okuma-yazma izinleriyle sınırlandırın. Readiness GET-only çalışır; customer-panel custom hostname oluşturur, owner worker durum okur ve kaldırma yapar.

## 4. Veritabanı ve kapalı worker ile dağıtım

Migration’ı self-hosted PostgreSQL 16 veritabanına uygulayın:

```bash
psql "$CELEBIX_SAAS_DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/owner/scripts/sql/saas/202608050088_storefront_custom_domains.up.sql
psql "$CELEBIX_SAAS_DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/owner/scripts/sql/saas/202608050088_storefront_custom_domains_assertions.sql
```

Ardından owner, customer-panel ve storefront-shared uygulamalarını worker kapalıyken dağıtın. `/health` container sağlığını; tam host zinciri ise `https://<probe-host>/api/health` yanıtını doğrular. İkinci endpoint’in cevabı yalnız `{schemaVersion,status,storeId,hostname}` alanlarından oluşmalıdır.

Read-only edge ön kontrolü:

```bash
npm run verify:custom-domains
```

Başarılı sonuçta `zone=active`, `customHostnameQuota=ready`, `fallbackOrigin=active`, `cnameTarget=ready`, `tunnel=healthy`, `storefront=healthy` görülür. Aksi durumda worker’ı açmayın.

## 5. Worker’ı açma ve kabul akışı

1. Owner’da `CELEBIX_STORE_DOMAIN_WORKER_ENABLED=true` yapıp yalnız owner’ı yeniden dağıtın.
2. Test mağazasında Celebix’e ait staging test hostunu ekleyin.
3. Panelde DNS, hostname, SSL ve origin durumlarının sırayla aktif olmasını bekleyin.
4. HTTPS vitrini, sepeti, misafir ödeme akışını ve müşteri hesabını kontrol edin.
5. Özel hostu primary yapın; platform hostundaki path/query isteğinin özel hosta `308` döndüğünü doğrulayın.
6. Platform hostunu tekrar primary yapın, özel hostu kaldırın ve platform vitrininin çalıştığını doğrulayın.

Tekrarlanabilir staging akışının gerekli değişkenleri ve güvenli cleanup davranışı `tests/saas-phase3/storefront-custom-domains/README.md` dosyasında tanımlıdır. Mutasyon testi açıkça `CELEBIX_CUSTOM_DOMAIN_STAGING_RUN=approved`; browser kabul testi de `CELEBIX_CUSTOM_DOMAIN_BROWSER_RUN=approved` verilmeden başlamaz.

## 6. Olay yönetimi

- `dns_pending`: Müşterinin CNAME değerini ve proxy durumunu kontrol edin; `shops` hedefini değiştirmeyin.
- `ssl_pending`: Cloudflare DCV kaydını panelde gösterin, sertifika isteğini çoğaltmayın.
- `origin_pending`: `/api/health` exact-host cevabını, Transform Rule’u, Tunnel replica durumunu ve DB migration 088’i kontrol edin.
- `action_required`: Güvenli provider hata koduna göre yeniden deneme yapın; ham provider yanıtını müşteriye göstermeyin.
- Tunnel kaybı: Worker’ı kapatın, iki replica’yı geri getirin, readiness tamamen yeşil olmadan tekrar açmayın.
- Token şüphesi: Worker’ı kapatın, token’ı Cloudflare’da iptal/yenileyin, Coolify secret’ını değiştirip ilgili uygulamaları yeniden dağıtın.

## 7. Güvenli geri alma

Önce worker’ı kapatın. Her mağazada platform hostname’ini primary yapın ve aktif custom domain bırakmayın. Devam eden lease olmadığını doğrulayın. Sonra:

```bash
psql "$CELEBIX_SAAS_DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/owner/scripts/sql/saas/202608050088_storefront_custom_domains.down.sql
```

Down migration aktif custom domain veya açık worker lease varsa bilinçli olarak durur. Bu korumayı atlamayın. Cloudflare fallback origin ve CNAME hedefini ancak tüm custom hostname kayıtları kaldırıldıktan sonra silin.
