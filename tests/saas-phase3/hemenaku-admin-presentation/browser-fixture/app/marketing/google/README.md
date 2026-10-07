# Google connections browser fixture

Mounts the production `GoogleMarketingConnections`, workspace chrome and native dialog with a disposable in-memory client. It makes no Google requests, changes no production authorization, and does not prove real Google OAuth/API acceptance. The screen and sidebar explicitly label the example data.

From the repository root:

```sh
CELEBIX_FIXTURE_MEMORY_CACHE=1 NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next dev tests/saas-phase3/hemenaku-admin-presentation/browser-fixture --webpack -p 3569
```

Open `http://127.0.0.1:3569/marketing/google`. Optional `?scenario=` values: `normal`, `unconfigured`, `unconnected`, `reconnect`, `readonly`, `empty`, `loading`, `error`, `save-error`, `conflict`.

Review cards/modal at 1440, 1024 and 390 pixels; account/resource choice; GTM creation; Ads creation link and refresh; Search Console selection; Apply/Cancel; same-key retry after `save-error`; conflict recovery; Escape, native focus containment and restoration; no page horizontal overflow; no unexpected console/network errors.
