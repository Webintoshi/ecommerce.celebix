import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const browserTests = ["components/StorefrontSearchForm.test.ts", "components/CampaignSectionContent.test.ts", "components/SharedCampaignPreview.test.ts", "components/ProductVariantMedia.test.ts", "components/GuzideProductPurchase.test.ts", "components/SioraProductPurchase.test.ts", "components/SioraCatalogReturn.test.ts", "components/SioraHeader.test.ts", "components/StorefrontFrame.test.ts", "components/SioraSideCartDrawer.test.ts", "components/CheckoutInteractions.test.ts", "components/SharedFooterSignature.test.ts"];
const directories = [
  "lib", "lib/account", "lib/cart", "lib/checkout", "lib/payment-adapters",
  "lib/cart-capture", "lib/analytics", "lib/promotions", "components", "components/account",
];
const serverTests = directories.flatMap((directory) => readdirSync(directory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
  .map((entry) => path.posix.join(directory, entry.name)))
  .filter((file) => !browserTests.includes(file))
  .concat(["scripts/healthcheck.test.mjs", "scripts/search-supervisor-start.test.cjs", "scripts/reconcile-standard-checkouts.test.mjs",
    "scripts/standard-checkout-supervisor.test.cjs", "scripts/standard-checkout-supervisor-run.test.cjs",
    "scripts/standard-checkout-supervisor-start.test.cjs"])
  .sort();

function run(tests, nodeOptions) {
  const child = spawnSync(process.execPath, ["--experimental-transform-types", "--test", ...tests], {
    stdio: "inherit", env: { ...process.env, NODE_OPTIONS: nodeOptions },
  });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}

run(serverTests, "--conditions=react-server");
run(browserTests, "");
