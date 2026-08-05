# Storefront custom-domain staging acceptance

Varsayılan test koşusu yalnız yapılandırma sınırını doğrular ve hiçbir ağ isteği ya da mutasyon yapmaz. Gerçek yaşam döngüsü yalnız aşağıdaki açık staging otoritesiyle çalışır:

```text
CELEBIX_CUSTOM_DOMAIN_STAGING_RUN=approved
CELEBIX_DEPLOYMENT_TIER=staging
CELEBIX_CUSTOM_DOMAIN_STAGING_PANEL_ORIGIN=https://<slug>.admin.saas-staging.celebix.site
CELEBIX_CUSTOM_DOMAIN_STAGING_PLATFORM_ORIGIN=https://<slug>.saas-staging.celebix.site
CELEBIX_CUSTOM_DOMAIN_STAGING_OWNED_SUFFIX=custom-domains-staging.celebix.co
CELEBIX_CUSTOM_DOMAIN_STAGING_PANEL_COOKIE=__Host-celebix_panel=<ephemeral-session>
CELEBIX_CUSTOM_DOMAIN_STAGING_STORE_ID=<store-uuid>
```

Owned suffix için wildcard CNAME önceden `shops.saas-staging.celebix.site` hedefine verilmelidir. Test her koşuda benzersiz bir host üretir; `finally` bloğu custom hostu devre dışı bırakır ve platform storefront’unun çalıştığını doğrular. Cookie veya API token hiçbir artefakta/logda yazılmaz.

```bash
node --test tests/saas-phase3/storefront-custom-domains/lifecycle.test.mjs
CELEBIX_CUSTOM_DOMAIN_BROWSER_RUN=approved \
CELEBIX_CUSTOM_DOMAIN_STAGING_CUSTOM_ORIGIN=https://<active-primary-host>.custom-domains-staging.celebix.co \
node tests/saas-phase3/storefront-custom-domains/browser-acceptance.mjs
```
