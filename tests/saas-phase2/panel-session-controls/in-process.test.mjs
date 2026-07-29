const root = new URL("../../../", import.meta.url);
const files = [
  "apps/customer-panel/lib/panel-session-completion/cookie.test.ts",
  "apps/customer-panel/lib/server-panel-access/runtime.test.ts",
  "apps/customer-panel/lib/server-panel-access/resolver.test.ts",
  "apps/customer-panel/lib/server-panel-session-controls/request-authority.test.ts",
  "apps/customer-panel/lib/server-panel-session-controls/request-input.test.ts",
  "apps/customer-panel/lib/server-panel-session-controls/mutation.test.ts",
  "apps/customer-panel/lib/server-panel-session-controls/handler.test.ts",
  "apps/customer-panel/lib/server-panel-session-controls/default.test.ts",
  "apps/customer-panel/app/api/session/active-store/route.test.ts",
  "apps/customer-panel/app/api/session/logout/route.test.ts",
];

for (const file of files) await import(new URL(file, root));
