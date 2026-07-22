import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

test("customer pages stay behind durable server panel access and role capabilities", async () => {
  const layout = await source("app/customers/layout.tsx");
  const detail = await source("app/customers/[customerId]/page.tsx");
  const segments = await source("app/customers/segments/page.tsx");
  const tags = await source("app/customers/tags/page.tsx");
  assert.match(layout, /requireServerPanelAccess\(\)/);
  assert.match(layout, /tenantContext/);
  assert.match(detail, /customers[.]manage/);
  assert.match(detail, /customers[.]archive/);
  assert.match(segments, /customers[.]manage/);
  assert.match(tags, /customers[.]manage/);
});

test("customer browser UI uses only same-origin DTO APIs and no browser authority", async () => {
  const files = [
    "lib/customer-ui/client.ts",
    "components/customers/CustomerListConsole.tsx",
    "components/customers/CustomerFormConsole.tsx",
    "components/customers/CustomerDetailConsole.tsx",
    "components/customers/CustomerTaxonomyConsole.tsx",
  ];
  const combined = (await Promise.all(files.map(source))).join("\n");
  assert.match(combined, /credentials:\s*["']same-origin["']/);
  assert.match(combined, /crypto[.]randomUUID/);
  assert.doesNotMatch(
    combined,
    /document[.]cookie|localStorage|sessionStorage|x-forwarded|\btenantId\b|\bstoreId\b|membershipId|planId/i,
  );
  assert.doesNotMatch(
    combined,
    /postgres|repository|database|supabase|\/api\/admin/i,
  );
});

test("customer console exposes truthful loaded empty error export and responsive states", async () => {
  const list = await source("components/customers/CustomerListConsole.tsx");
  const detail = await source("components/customers/CustomerDetailConsole.tsx");
  const taxonomy = await source(
    "components/customers/CustomerTaxonomyConsole.tsx",
  );
  const styles = await source(
    "components/customers/customer-console.module.css",
  );
  assert.match(list, /Henüz müşteri yok/);
  assert.match(list, /Müşteriler yükleniyor/);
  assert.match(list, /CSV Dışa Aktar/);
  assert.match(detail, /Dahili notlar/);
  assert.match(detail, /Müşteriyi Arşivle/);
  assert.match(detail, /customerApi[.]update\(customerId/);
  assert.match(detail, /expectedVersion:\s*data[.]version/);
  assert.match(taxonomy, /müşteri/);
  assert.match(styles, /@media\s*\(max-width:\s*1024px\)/);
  assert.match(styles, /min-height:\s*48px/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("customer edit route sends the loaded version and leaves stale conflicts visible", async () => {
  const editor = await source("components/customers/CustomerEditConsole.tsx");
  const detail = await source("components/customers/CustomerDetailConsole.tsx");
  const page = await source("app/customers/[customerId]/edit/page.tsx");
  assert.match(editor, /export function CustomerEditConsole/);
  assert.match(editor, /customerApi[.]get\(customerId\)/);
  assert.match(editor, /customerApi[.]update\(customerId/);
  assert.match(editor, /expectedVersion:\s*customer[.]version/);
  assert.match(editor, /version_conflict/);
  assert.match(editor, /sizden önce güncellendi/i);
  assert.match(editor, /router[.]push\(`\/customers\/\$\{result[.]id\}`\)/);
  assert.match(detail, /href=\{`\/customers\/\$\{encodeURIComponent\(data[.]id\)\}\/edit`\}/);
  assert.match(page, /requireServerPanelAccess\(\)/);
  assert.match(page, /customers[.]manage/);
  assert.match(page, /<CustomerEditConsole customerId=\{customerId\} \/>/);
  assert.doesNotMatch(editor, /tenantId|storeId|principalId|membershipId|planId|document[.]cookie|localStorage|sessionStorage/i);
});

test("customer route files expose only the reviewed methods", async () => {
  const routes = [
    ["app/api/customers/summary/route.ts", { GET: "handleCustomerSummary" }],
    [
      "app/api/customers/route.ts",
      { GET: "handleCustomerList", POST: "handleCustomerCreate" },
    ],
    [
      "app/api/customers/[customerId]/route.ts",
      { GET: "handleCustomerGet", POST: "handleCustomerUpdate" },
    ],
    [
      "app/api/customers/[customerId]/archive/route.ts",
      { POST: "handleCustomerArchive" },
    ],
    [
      "app/api/customers/[customerId]/notes/route.ts",
      { POST: "handleCustomerNote" },
    ],
    [
      "app/api/customers/[customerId]/tags/route.ts",
      { POST: "handleCustomerSetTags" },
    ],
    [
      "app/api/customers/[customerId]/segments/route.ts",
      { POST: "handleCustomerSetSegments" },
    ],
    [
      "app/api/customers/tags/route.ts",
      { GET: "handleCustomerTags", POST: "handleCustomerTagSave" },
    ],
    [
      "app/api/customers/segments/route.ts",
      { GET: "handleCustomerSegments", POST: "handleCustomerSegmentSave" },
    ],
    ["app/api/customers/export/route.ts", { GET: "handleCustomerExport" }],
  ] as const;
  for (const [path, allowed] of routes) {
    const text = await source(path);
    for (const [method, handler] of Object.entries(allowed))
      assert.match(
        text,
        new RegExp(`export const ${method}\\s*=\\s*${handler}`),
      );
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"].filter(
      (candidate) => !Object.hasOwn(allowed, candidate),
    )) {
      assert.doesNotMatch(text, new RegExp(`export const ${method} =`));
    }
  }
});
