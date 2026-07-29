import { spawn, spawnSync } from "node:child_process";
import { createCipheriv, createHash } from "node:crypto";
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const STOREFRONT = path.join(ROOT, "apps/storefront-shared");
const NEXT = path.join(ROOT, "node_modules/next/dist/bin/next");
const MANIFEST = JSON.parse(readFileSync(path.join(
  SQL,
  "phase3q-quick-order-hosted-payment-bridge-manifest.json",
), "utf8"));
const PROVIDER_FIXTURE = readFileSync(path.join(
  ROOT,
  "tests/saas-phase3/iyzico-iframe-tenant-activation-runtime/fixture.sql",
), "utf8");
const DATABASE = "storefront_checkout_browser_staging";
const DATABASE_USER = "checkout_browser_app";
const DATABASE_PASSWORD = "checkout-browser-password";
const PROXY_TOKEN = Buffer.alloc(32, 0x5a).toString("base64url");
const NOW = "2026-07-29T08:00:00.000Z";
const STORE_A = "10000000-0000-4000-8000-000000000061";
const STORE_B = "10000000-0000-4000-8000-000000000062";
const CART_A = "60000000-0000-4000-8000-000000000091";
const CART_B = "60000000-0000-4000-8000-000000000092";
const PRODUCT_A = "70000000-0000-4000-8000-000000000091";
const PRODUCT_B = "70000000-0000-4000-8000-000000000092";
const VARIANT_A = "71000000-0000-4000-8000-000000000091";
const VARIANT_B = "71000000-0000-4000-8000-000000000092";
const PAYTR_METHOD = "50000000-0000-4000-8000-000000000061";
const IYZICO_METHOD = "40000000-0000-4000-8000-000000000062";
const BANK_A = "50000000-0000-4000-8000-000000000063";
const COD_A = "50000000-0000-4000-8000-000000000062";
const BANK_B = "50000000-0000-4000-8000-000000000092";
const COD_B = "50000000-0000-4000-8000-000000000093";
const CREDENTIAL_A = Buffer.alloc(32, 0x11).toString("base64url");
const CREDENTIAL_B = Buffer.alloc(32, 0x22).toString("base64url");
const DIGEST_A = createHash("sha256").update(Buffer.from(CREDENTIAL_A, "base64url")).digest("hex");
const DIGEST_B = createHash("sha256").update(Buffer.from(CREDENTIAL_B, "base64url")).digest("hex");
const IYZICO_RUN = "60000000-0000-4000-8000-000000000081";
const IYZICO_LEASE = "61000000-0000-4000-8000-000000000081";
const IYZICO_ATTESTATION = "62000000-0000-4000-8000-000000000081";
const IYZICO_WORKER = "checkout-browser-iyzico-worker";
const PROVIDER_KEY_ID = "provider.current";
const PROVIDER_KEY = Buffer.alloc(32, 0x7b);
const PROVIDER_KEY_B64URL = PROVIDER_KEY.toString("base64url");
const IYZICO_CREDENTIAL = Object.freeze({
  apiKey: "sandbox-api-key",
  secretKey: "sandbox-secret-key",
});
const IYZICO_MATRIX = Object.freeze([
  Object.freeze({ event: "63000000-0000-4000-8000-000000000081", caseKind: "success", eventKind: "success_captured", attempt: "64000000-0000-4000-8000-000000000081", observation: "1".repeat(64), code: "captured" }),
  Object.freeze({ event: "63000000-0000-4000-8000-000000000082", caseKind: "decline", eventKind: "declined", attempt: "64000000-0000-4000-8000-000000000082", observation: "2".repeat(64), code: "declined" }),
  Object.freeze({ event: "63000000-0000-4000-8000-000000000083", caseKind: "controlled_timeout_recovery", eventKind: "timeout_unknown", attempt: "64000000-0000-4000-8000-000000000083", observation: "3".repeat(64), code: "unknown" }),
  Object.freeze({ event: "63000000-0000-4000-8000-000000000084", caseKind: "controlled_timeout_recovery", eventKind: "timeout_recovered", attempt: "64000000-0000-4000-8000-000000000083", observation: "4".repeat(64), code: "recovered" }),
  Object.freeze({ event: "63000000-0000-4000-8000-000000000085", caseKind: "callback_replay", eventKind: "callback_original", attempt: "64000000-0000-4000-8000-000000000081", observation: "5".repeat(64), code: "accepted" }),
  Object.freeze({ event: "63000000-0000-4000-8000-000000000086", caseKind: "callback_replay", eventKind: "callback_replay", attempt: "64000000-0000-4000-8000-000000000081", observation: "5".repeat(64), code: "replayed" }),
]);
const MAX_LOG_BYTES = 32_000;

function tlsDebug(...values) {
  if (process.env.CELEBIX_CHECKOUT_BROWSER_TLS_DEBUG === "1") {
    console.error("[checkout-browser-tls]", ...values);
  }
}

export const CHECKOUT_BROWSER_HOSTS = Object.freeze([
  Object.freeze({
    cartId: CART_A,
    credential: CREDENTIAL_A,
    hostname: "store-a.checkout.test",
    methodIds: Object.freeze({
      provider: PAYTR_METHOD,
      bankTransfer: BANK_A,
      cashOnDelivery: COD_A,
    }),
    storeId: STORE_A,
    storeName: "Atölye A",
    themeKey: "starter",
  }),
  Object.freeze({
    cartId: CART_B,
    credential: CREDENTIAL_B,
    hostname: "store-b.checkout.test",
    methodIds: Object.freeze({
      provider: IYZICO_METHOD,
      bankTransfer: BANK_B,
      cashOnDelivery: COD_B,
    }),
    storeId: STORE_B,
    storeName: "Galeri B",
    themeKey: "hemenaku",
  }),
]);

function scenario(name, hostIndex, suffix, credentialByte) {
  const host = CHECKOUT_BROWSER_HOSTS[hostIndex];
  return Object.freeze({
    ...host,
    cartId: `60000000-0000-4000-8000-${suffix}`,
    credential: Buffer.alloc(32, credentialByte).toString("base64url"),
    itemId: `76000000-0000-4000-8000-${suffix}`,
    name,
  });
}

export const CHECKOUT_BROWSER_SCENARIOS = Object.freeze({
  paytrUnavailable: scenario("paytr-unavailable", 0, "000000000101", 0x31),
  iyzicoRedirect: scenario("iyzico-redirect", 1, "000000000102", 0x32),
  iyzicoProcessing: scenario("iyzico-processing", 1, "000000000103", 0x33),
  iyzicoRejected: scenario("iyzico-rejected", 1, "000000000104", 0x34),
  bankTransfer: scenario("bank-transfer", 0, "000000000105", 0x35),
  codKeyboard: scenario("cod-keyboard", 0, "000000000106", 0x36),
});

function credentialDigest(credential) {
  return createHash("sha256")
    .update(Buffer.from(credential, "base64url"))
    .digest("hex");
}

function sealProviderCredential({ credential, profileId, providerCode, storeId }) {
  const plaintext = Buffer.from(JSON.stringify(credential), "utf8");
  const iv = Buffer.alloc(12, 0x5c);
  const associatedData = Buffer.from(JSON.stringify([
    "celebix-provider-credential",
    1,
    storeId,
    profileId,
    providerCode,
    "payment_processing",
    1,
    PROVIDER_KEY_ID,
  ]), "utf8");
  const cipher = createCipheriv("aes-256-gcm", PROVIDER_KEY, iv);
  cipher.setAAD(associatedData);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  try {
    return Object.freeze({
      digest: createHash("sha256").update(plaintext).digest("hex"),
      envelope: Object.freeze({
        algorithm: "A256GCM",
        ciphertext: ciphertext.toString("base64url"),
        iv: iv.toString("base64url"),
        keyId: PROVIDER_KEY_ID,
        tag: tag.toString("base64url"),
        version: 1,
      }),
    });
  } finally {
    plaintext.fill(0);
    iv.fill(0);
    associatedData.fill(0);
    ciphertext.fill(0);
    tag.fill(0);
  }
}

function approvedIyzicoBuild() {
  const generated = path.join(
    ROOT,
    "packages/payment-adapters/src/providers/iyzico/build-metadata.generated.ts",
  );
  const original = readFileSync(generated);
  const sourceCommit = run(executable("git"), ["rev-parse", "HEAD"]).stdout.trim();
  const baseEnvironment = { SOURCE_COMMIT: sourceCommit };
  const candidateDigest = run(process.execPath, ["scripts/generate-iyzico-sandbox-build.mjs"], {
    env: baseEnvironment,
  }).stdout.trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(candidateDigest)) {
    writeFileSync(generated, original);
    throw new Error("checkout_browser_iyzico_candidate_invalid");
  }
  run(process.execPath, ["scripts/generate-iyzico-sandbox-build.mjs"], {
    env: {
      ...baseEnvironment,
      CELEBIX_IYZICO_APPROVAL_MODE: "approved_test_sandbox",
      CELEBIX_IYZICO_APPROVED_EVIDENCE_DIGEST: candidateDigest,
    },
  });
  return Object.freeze({
    candidateDigest,
    restore() {
      writeFileSync(generated, original);
    },
  });
}

function executable(name) {
  const bundledRoot = path.join(homedir(), ".codex", "tmp");
  let bundled = [];
  try {
    bundled = readdirSync(bundledRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^postgresql-[0-9.]+-install$/.test(entry.name))
      .map((entry) => path.join(bundledRoot, entry.name, "bin"));
  } catch {
    bundled = [];
  }
  for (const directory of [
    process.env.POSTGRES_BIN,
    ...(process.env.PATH ?? "").split(path.delimiter),
    ...bundled,
  ]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through the deterministic search path.
    }
  }
  throw new Error(`checkout_browser_missing_executable:${name}`);
}

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C", ...(options.env ?? {}) },
    input: options.input ?? "",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && options.allowFailure !== true) {
    throw new Error(`${path.basename(program)} failed\n${sanitizeDiagnostic(result.stdout)}\n${sanitizeDiagnostic(result.stderr)}`);
  }
  return result;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function psql(box, input, database = DATABASE) {
  return run(executable("psql"), [
    "-h", box.socket,
    "-p", String(box.adminPort),
    "-X",
    "-qAt",
    "-v", "ON_ERROR_STOP=1",
    "-U", "postgres",
    "-d", database,
  ], { input });
}

function applySql(box, file) {
  const selected = path.join(SQL, file);
  if (!existsSync(selected)) throw new Error(`checkout_browser_missing_migration:${file}`);
  return run(executable("psql"), [
    "-h", box.socket,
    "-p", String(box.adminPort),
    "-X",
    "-qAt",
    "-v", "ON_ERROR_STOP=1",
    "-U", "postgres",
    "-d", DATABASE,
    "-f", selected,
  ]);
}

function sslCertificate(root) {
  const key = path.join(root, "server.key");
  const certificate = path.join(root, "server.crt");
  const config = path.join(root, "openssl.cnf");
  writeFileSync(config, `[req]
distinguished_name=req_distinguished_name
x509_extensions=v3_req
prompt=no
[req_distinguished_name]
CN=checkout-browser-postgres
[v3_req]
subjectAltName=DNS:localhost,IP:127.0.0.1
`);
  run(executable("openssl"), [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-days", "2", "-config", config, "-keyout", key, "-out", certificate,
  ]);
  chmodSync(key, 0o600);
  return { key, certificate };
}

async function startPostgres(root) {
  const data = path.join(root, "postgres");
  const socket = path.join(root, "socket");
  const [adminPort, port, tlsPort] = await Promise.all([freePort(), freePort(), freePort()]);
  mkdirSync(socket, { mode: 0o700 });
  run(executable("initdb"), [
    "-D", data,
    "--auth-local=trust",
    "--auth-host=scram-sha-256",
    "--username=postgres",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  run(executable("pg_ctl"), [
    "-D", data,
    "-o", [
      `-k ${socket}`,
      `-p ${adminPort}`,
      "-h 127.0.0.1",
    ].join(" "),
    "-l", path.join(root, "postgres.log"),
    "start",
  ]);
  const certificate = sslCertificate(root);
  const boxTlsState = { secureConnections: 0 };
  const tlsBackend = tls.createServer({
    cert: readFileSync(certificate.certificate),
    key: readFileSync(certificate.key),
  }, (secured) => {
    boxTlsState.secureConnections += 1;
    tlsDebug("secure-connection");
    const upstream = net.createConnection({
      host: "127.0.0.1",
      port: adminPort,
    });
    upstream.once("connect", () => tlsDebug("upstream-connected"));
    upstream.on("error", () => secured.destroy());
    secured.on("error", () => upstream.destroy());
    secured.pipe(upstream).pipe(secured);
  });
  tlsBackend.on("tlsClientError", (error) => tlsDebug("tls-client-error", error.message));
  await new Promise((resolve, reject) => {
    tlsBackend.once("error", reject);
    tlsBackend.listen(tlsPort, "127.0.0.1", resolve);
  });
  const tlsProxy = net.createServer((socketConnection) => {
    tlsDebug("outer-connected");
    socketConnection.once("data", (packet) => {
      tlsDebug("outer-packet", packet.byteLength, packet.subarray(0, 16).toString("hex"));
      if (
        packet.byteLength < 8
        || !packet.subarray(0, 8).equals(Buffer.from("0000000804d2162f", "hex"))
      ) {
        socketConnection.end("N");
        return;
      }
      const remaining = packet.subarray(8);
      socketConnection.pause();
      socketConnection.write("S", () => {
        tlsDebug("ssl-accepted");
        const inner = net.createConnection({
          host: "127.0.0.1",
          port: tlsPort,
        }, () => {
          tlsDebug("inner-connected");
          if (remaining.byteLength > 0) inner.write(remaining);
          socketConnection.pipe(inner).pipe(socketConnection);
          socketConnection.resume();
        });
        inner.on("error", () => socketConnection.destroy());
        socketConnection.on("error", () => inner.destroy());
      });
    });
  });
  await new Promise((resolve, reject) => {
    tlsProxy.once("error", reject);
    tlsProxy.listen(port, "127.0.0.1", resolve);
  });
  return {
    adminPort,
    ca: certificate.certificate,
    data,
    port,
    root,
    socket,
    tlsBackend,
    tlsProxy,
    tlsState: boxTlsState,
  };
}

function stopPostgres(box) {
  if (!box) return;
  box.tlsProxy?.close();
  box.tlsBackend?.close();
  run(executable("pg_ctl"), ["-D", box.data, "-m", "fast", "stop"], {
    allowFailure: true,
  });
}

function seedSql() {
  const scenarioCarts = Object.values(CHECKOUT_BROWSER_SCENARIOS).map((selected) => {
    const storeA = selected.storeId === STORE_A;
    return `('${selected.cartId}','${selected.storeId}','${credentialDigest(selected.credential)}',
      'active',NULL,NULL,NULL,'TRY',${storeA ? 25800 : 24500},${storeA ? 0 : 2750},0,
      ${storeA ? 25800 : 27250},'standard','${NOW}','${NOW}',NULL,NULL,NULL,1,'${NOW}','${NOW}')`;
  }).join(",\n  ");
  const scenarioItems = Object.values(CHECKOUT_BROWSER_SCENARIOS).map((selected) => {
    const storeA = selected.storeId === STORE_A;
    return `('${selected.itemId}','${selected.storeId}','${selected.cartId}',
      '${storeA ? PRODUCT_A : PRODUCT_B}','${storeA ? VARIANT_A : VARIANT_B}',0,
      '${storeA ? "Keten Omuz Çantası" : "El Yapımı Seramik Vazo"}',
      '${storeA ? "Kum" : "Gece mavisi"}','${storeA ? "AT-A-1" : "GL-B-1"}',NULL,
      ${storeA ? 12900 : 24500},${storeA ? 2 : 1},0,${storeA ? 25800 : 24500},'${NOW}')`;
  }).join(",\n  ");
  return `BEGIN;
SET LOCAL ROLE celebix_saas_owner;
UPDATE saas.stores
SET name='Atölye A',theme_key='starter',updated_at='${NOW}'
WHERE id='${STORE_A}';
UPDATE saas.stores
SET name='Galeri B',theme_key='hemenaku',updated_at='${NOW}'
WHERE id='${STORE_B}';

UPDATE saas.payment_methods
SET state='active',label='PayTR ile güvenli ödeme',position=0,updated_at='${NOW}'
WHERE id='${PAYTR_METHOD}';
UPDATE saas.payment_methods
SET config='{"instructions":"Teslimatta nakit veya kart ile ödeme yapabilirsiniz."}',
    updated_at='${NOW}'
WHERE id='${COD_A}';
UPDATE saas.payment_methods
SET config='{"bankName":"Örnek Banka","accountHolder":"Atölye A A.Ş.","iban":"TR330006100519786457841326","instructions":"Sipariş numaranızı açıklamaya yazın."}',
    updated_at='${NOW}'
WHERE id='${BANK_A}';
UPDATE saas.payment_methods
SET label='iyzico ile güvenli ödeme',updated_at='${NOW}'
WHERE id='${IYZICO_METHOD}';

INSERT INTO saas.payment_methods(
  id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
  position,config,version,created_at,updated_at
) VALUES
  ('${BANK_B}','${STORE_B}','bank_transfer',NULL,NULL,'Banka Havalesi','active',NULL,2,
   '{"bankName":"Deneme Bankası","accountHolder":"Galeri B Ltd.","iban":"TR330006100519786457841326","instructions":"Sipariş numaranızı açıklamaya yazın."}',
   1,'${NOW}','${NOW}'),
  ('${COD_B}','${STORE_B}','cash_on_delivery',NULL,NULL,'Kapıda Ödeme','active',NULL,1,
   '{"instructions":"Teslimatta ödeme yapabilirsiniz."}',1,'${NOW}','${NOW}');

INSERT INTO saas.store_domains(
  id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version
) VALUES
  ('61000000-0000-4000-8000-000000000091','${STORE_A}','store-a.checkout.test',
   'custom_domain','active',true,'${NOW}','${NOW}','${NOW}',1),
  ('61000000-0000-4000-8000-000000000092','${STORE_B}','store-b.checkout.test',
   'custom_domain','active',true,'${NOW}','${NOW}','${NOW}',1);

INSERT INTO saas.inventory_locations(
  id,store_id,name,is_default,status,version,created_at,updated_at
) VALUES
  ('62000000-0000-4000-8000-000000000091','${STORE_A}','Atölye depo',true,'active',1,'${NOW}','${NOW}'),
  ('62000000-0000-4000-8000-000000000092','${STORE_B}','Galeri depo',true,'active',1,'${NOW}','${NOW}');

INSERT INTO saas.products(
  id,store_id,slug,title,description,status,currency,version,archived_at,created_at,updated_at
) VALUES
  ('${PRODUCT_A}','${STORE_A}','keten-canta','Keten Omuz Çantası',NULL,'active','TRY',1,NULL,'${NOW}','${NOW}'),
  ('${PRODUCT_B}','${STORE_B}','seramik-vazo','El Yapımı Seramik Vazo',NULL,'active','TRY',1,NULL,'${NOW}','${NOW}');
SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
SELECT pg_catalog.set_config(
  'saas.inventory.source_id','77000000-0000-4000-8000-000000000091',true
);
SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',true);
INSERT INTO saas.product_variants(
  id,product_id,store_id,title,sku,barcode,price_cents,compare_at_cents,cost_cents,
  stock_tracking,stock_quantity,status,attributes,version,archived_at,created_at,updated_at
) VALUES
  ('${VARIANT_A}','${PRODUCT_A}','${STORE_A}','Kum','AT-A-1',NULL,12900,NULL,NULL,true,20,'active','{}',1,NULL,'${NOW}','${NOW}'),
  ('${VARIANT_B}','${PRODUCT_B}','${STORE_B}','Gece mavisi','GL-B-1',NULL,24500,NULL,NULL,true,12,'active','{}',1,NULL,'${NOW}','${NOW}');
SELECT pg_catalog.set_config('saas.inventory.source_marker','',true);
SELECT pg_catalog.set_config('saas.inventory.source_id','',true);
SELECT pg_catalog.set_config('saas.inventory.source_time','',true);

INSERT INTO saas.merchant_admin_records(
  id,store_id,record_kind,name,config,status,version,archived_at,created_at,updated_at
) VALUES
  ('72000000-0000-4000-8000-000000000091','${STORE_A}','shipping_setting','Atölye standart',
   '{"regions":["TR"],"flatRateCents":1500,"freeShippingThresholdCents":20000,"estimatedDays":2}',
   'active',1,NULL,'${NOW}','${NOW}'),
  ('72000000-0000-4000-8000-000000000092','${STORE_B}','shipping_setting','Galeri standart',
   '{"regions":["TR"],"flatRateCents":2750,"freeShippingThresholdCents":40000,"estimatedDays":4}',
   'active',1,NULL,'${NOW}','${NOW}'),
  ('73000000-0000-4000-8000-000000000091','${STORE_A}','discount','Atölye indirim',
   '{"code":"ATOLYE10","discountType":"fixed","value":1000,"minimumOrderCents":0}',
   'active',1,NULL,'${NOW}','${NOW}'),
  ('73000000-0000-4000-8000-000000000092','${STORE_B}','discount','Galeri indirim',
   '{"code":"GALERI20","discountType":"fixed","value":2000,"minimumOrderCents":0}',
   'active',1,NULL,'${NOW}','${NOW}'),
  ('75000000-0000-4000-8000-000000000091','${STORE_A}','policy','Mesafeli Satış Sözleşmesi',
   '{"policyType":"distance_sales","locale":"tr","body":"Atölye mesafeli satış koşulları.","effectiveAt":"${NOW}"}',
   'active',1,NULL,'${NOW}','${NOW}'),
  ('75000000-0000-4000-8000-000000000092','${STORE_B}','policy','Mesafeli Satış Sözleşmesi',
   '{"policyType":"distance_sales","locale":"tr","body":"Galeri mesafeli satış koşulları.","effectiveAt":"${NOW}"}',
   'active',1,NULL,'${NOW}','${NOW}');

INSERT INTO saas.abandoned_carts(
  id,store_id,public_cart_digest,status,customer_name,customer_email,customer_phone,
  currency,subtotal_cents,shipping_cents,discount_cents,total_cents,shipping_method_code,
  checkout_started_at,last_activity_at,abandoned_at,recovered_at,archived_at,
  version,created_at,updated_at
) VALUES
  ('${CART_A}','${STORE_A}','${DIGEST_A}','active',NULL,NULL,NULL,
   'TRY',25800,0,0,25800,'standard','${NOW}','${NOW}',NULL,NULL,NULL,1,'${NOW}','${NOW}'),
  ('${CART_B}','${STORE_B}','${DIGEST_B}','active',NULL,NULL,NULL,
   'TRY',24500,2750,0,27250,'standard','${NOW}','${NOW}',NULL,NULL,NULL,1,'${NOW}','${NOW}');
INSERT INTO saas.abandoned_cart_items(
  id,store_id,cart_id,product_id,variant_id,position,product_name,variant_name,sku,
  image_url,unit_price_cents,quantity,discount_cents,line_total_cents,created_at
) VALUES
  ('76000000-0000-4000-8000-000000000091','${STORE_A}','${CART_A}','${PRODUCT_A}','${VARIANT_A}',
   0,'Keten Omuz Çantası','Kum','AT-A-1',NULL,12900,2,0,25800,'${NOW}'),
  ('76000000-0000-4000-8000-000000000092','${STORE_B}','${CART_B}','${PRODUCT_B}','${VARIANT_B}',
   0,'El Yapımı Seramik Vazo','Gece mavisi','GL-B-1',NULL,24500,1,0,24500,'${NOW}');
INSERT INTO saas.abandoned_carts(
  id,store_id,public_cart_digest,status,customer_name,customer_email,customer_phone,
  currency,subtotal_cents,shipping_cents,discount_cents,total_cents,shipping_method_code,
  checkout_started_at,last_activity_at,abandoned_at,recovered_at,archived_at,
  version,created_at,updated_at
) VALUES
  ${scenarioCarts};
INSERT INTO saas.abandoned_cart_items(
  id,store_id,cart_id,product_id,variant_id,position,product_name,variant_name,sku,
  image_url,unit_price_cents,quantity,discount_cents,line_total_cents,created_at
) VALUES
  ${scenarioItems};
RESET ROLE;
COMMIT;`;
}

function assertSqlOutcome(box, role, statement, expected) {
  const actual = psql(box, `SET ROLE ${role}; ${statement};`).stdout.trim();
  if (actual !== expected) {
    throw new Error(`checkout_browser_fixture_outcome_invalid:${expected}:${actual}`);
  }
}

function prepareAttestedIyzico(box, candidateDigest) {
  const authority = `'${STORE_B}'::uuid,'20000000-0000-4000-8000-000000000061'::uuid,` +
    `'30000000-0000-4000-8000-000000000062'::uuid,` +
    `'00000000-0000-4000-8000-000000000001'::uuid,'free_starter',1`;
  assertSqlOutcome(box, "celebix_saas_app", `SELECT outcome
    FROM saas.iyzico_iframe_tenant_evidence_begin_current(
      ${authority},'2026-07-28T14:05:00.000Z'::timestamptz,
      '${IYZICO_RUN}'::uuid,'${"1".repeat(64)}',
      '40000000-0000-4000-8000-000000000062'::uuid,1,1,
      '${candidateDigest}',1
    )`, "created");
  assertSqlOutcome(box, "celebix_saas_workflow", `SELECT outcome
    FROM saas.iyzico_iframe_tenant_evidence_claim_next(
      '${IYZICO_WORKER}','${IYZICO_LEASE}'::uuid,
      '2026-07-28T14:06:00.000Z'::timestamptz,
      '2026-07-28T14:11:00.000Z'::timestamptz
    )`, "claimed");
  for (const entry of IYZICO_MATRIX) {
    assertSqlOutcome(box, "celebix_saas_workflow", `SELECT outcome
      FROM saas.iyzico_iframe_tenant_evidence_record_event(
        '${IYZICO_RUN}'::uuid,'${IYZICO_LEASE}'::uuid,'${IYZICO_WORKER}',
        '${entry.event}'::uuid,'${entry.caseKind}','${entry.eventKind}',
        '${entry.attempt}'::uuid,'${entry.observation}','${entry.code}',
        '2026-07-28T14:07:00.000Z'::timestamptz
      )`, "recorded");
  }
  assertSqlOutcome(box, "celebix_saas_workflow", `SELECT outcome
    FROM saas.iyzico_iframe_tenant_evidence_finalize(
      '${IYZICO_RUN}'::uuid,'${IYZICO_LEASE}'::uuid,'${IYZICO_WORKER}',
      '${IYZICO_ATTESTATION}'::uuid,'${"2".repeat(64)}',
      '2026-07-28T14:08:00.000Z'::timestamptz
    )`, "attested");
  assertSqlOutcome(box, "celebix_saas_app", `SELECT outcome
    FROM saas.iyzico_iframe_tenant_evidence_activate_current(
      ${authority},'2026-07-28T14:09:00.000Z'::timestamptz,
      '65000000-0000-4000-8000-000000000081'::uuid,'${"9".repeat(64)}',
      '${IYZICO_METHOD}'::uuid,1
    )`, "state_changed");
}

function prepareDatabase(box, candidateDigest) {
  const sealedIyzico = sealProviderCredential({
    credential: IYZICO_CREDENTIAL,
    profileId: IYZICO_METHOD,
    providerCode: "iyzico_iframe",
    storeId: STORE_B,
  });
  psql(box, `CREATE DATABASE ${DATABASE};`, "postgres");
  for (const { file } of MANIFEST.migrationChain) applySql(box, file);
  applySql(box, "202607280059_payment_method_single_active_provider.up.sql");
  psql(box, PROVIDER_FIXTURE);
  psql(box, `SET ROLE celebix_saas_owner;
    INSERT INTO saas.payment_methods(
      id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
      position,config,version,created_at,updated_at
    ) VALUES(
      '${IYZICO_METHOD}','${STORE_B}','provider',
      '40000000-0000-4000-8000-000000000062','iyzico_iframe',
      'Iyzico','disabled',NULL,0,
      '{"environment":"test"}',1,
      '2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z'
    );
    UPDATE saas.merchant_provider_execution_authorities
    SET adapter_version=1,
        evidence_digest='${candidateDigest}',
        readiness='sandbox_ready',
        enabled=true,
        approved_at='2026-07-28T14:00:00.000Z'
    WHERE provider_code='iyzico_iframe'
      AND capability='payment_processing'
      AND environment='test';
    UPDATE saas.merchant_provider_profiles
    SET sealed_credentials='${JSON.stringify(sealedIyzico.envelope)}'::jsonb,
        credential_digest='${sealedIyzico.digest}',
        credential_key_id='${PROVIDER_KEY_ID}',
        validation_adapter_version=1,
        updated_at='2026-07-28T14:00:00.000Z'
    WHERE id='${IYZICO_METHOD}';`);
  applySql(box, "202607280060_iyzico_iframe_tenant_sandbox_evidence.up.sql");
  applySql(box, "202607280061_iyzico_iframe_tenant_activation_runtime.up.sql");
  prepareAttestedIyzico(box, candidateDigest);
  psql(box, `SET ROLE celebix_saas_owner;
    UPDATE saas.payment_methods SET
      config='{"bankName":"Örnek Banka","accountHolder":"Atölye A A.Ş.","iban":"TR330006100519786457841326","instructions":"Sipariş numaranızı açıklamaya yazın."}'::jsonb,
      updated_at='${NOW}'
    WHERE id='${BANK_A}';
    UPDATE saas.payment_methods SET state='active',updated_at='${NOW}'
    WHERE id='${PAYTR_METHOD}';`);
  applySql(box, "202607280062_builtin_payment_methods.up.sql");
  applySql(box, "202607280063_payment_provider_builtin_compatibility.up.sql");
  applySql(box, "202607280064_storefront_one_page_checkout.up.sql");
  psql(box, seedSql());
  const invalidBuiltins = psql(box, `SET ROLE celebix_saas_owner;
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',method.id,'kind',method.kind,'config',method.config
    ) ORDER BY method.id),'[]'::jsonb)
    FROM saas.payment_methods AS method
    WHERE method.kind IN('cash_on_delivery','bank_transfer')
      AND NOT saas.built_in_payment_method_config_valid(method.kind,method.config);`).stdout.trim();
  if (invalidBuiltins !== "[]") {
    throw new Error(`checkout_browser_fixture_builtin_config_invalid:${invalidBuiltins}`);
  }
  psql(box, `SET password_encryption='scram-sha-256';
    CREATE ROLE ${DATABASE_USER}
    LOGIN PASSWORD '${DATABASE_PASSWORD}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
    GRANT celebix_saas_host_resolver,celebix_saas_workflow TO ${DATABASE_USER};`);
}

function sanitizeDiagnostic(value) {
  return String(value)
    .replace(/(authorization|cookie|set-cookie)\s*[:=][^\r\n]*/gi, "$1:[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\+?[0-9][0-9 ()-]{8,}[0-9]/g, "[redacted-number]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[redacted-id]")
    .replace(/\b(?:sha256:)?[0-9a-f]{64}\b/gi, "[redacted-digest]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted-token]")
    .replace(/([?&][^=&#\s]+)=([^&#\s]*)/g, "$1=[redacted]");
}

function appendLog(current, value) {
  return `${current}${sanitizeDiagnostic(value)}`.slice(-MAX_LOG_BYTES);
}

async function preflightRuntimeDatabase(environment, database, candidateDigest) {
  const child = spawn(process.execPath, [
    "--input-type=module",
    "--eval",
	`import pg from "pg";
	import {
	  PostgresPublicCheckoutRepository,
	  parseMerchantProviderCredentialKeyring,
	} from "@celebix/saas-data";
	import { parseCheckoutQuote } from "@celebix/saas-contracts";
	const keyring = parseMerchantProviderCredentialKeyring(process.env);
	if (keyring.activeKeyId !== "${PROVIDER_KEY_ID}" || keyring.keys.length !== 1) {
	  throw new Error("checkout_browser_runtime_keyring_invalid");
	}
const pool = new pg.Pool({
  connectionString: process.env.CELEBIX_SAAS_DATABASE_URL,
  connectionTimeoutMillis: 5_000,
});
try {
  const rejectedPool = new pg.Pool({
    connectionString: process.env.CELEBIX_SAAS_DATABASE_URL.replace(
      ":${DATABASE_PASSWORD}@",
      ":checkout-browser-wrong-password@",
    ),
    connectionTimeoutMillis: 5_000,
  });
  let wrongPasswordRejected = false;
  try {
    await rejectedPool.query("SELECT 1");
  } catch {
    wrongPasswordRejected = true;
  } finally {
    await rejectedPool.end();
  }
  if (!wrongPasswordRejected) throw new Error("checkout_browser_runtime_password_auth_missing");
  const result = await pool.query(
    \`SELECT current_user,
      current_setting('server_version_num')::integer AS version_num,
      current_database() AS database_name,
      role.rolsuper AS is_superuser,
      pg_has_role(current_user,'celebix_saas_host_resolver','MEMBER') AS resolver_member,
      pg_has_role(current_user,'celebix_saas_workflow','MEMBER') AS workflow_member,
      to_regclass('saas.store_domains') IS NOT NULL
        AND to_regclass('saas.product_media') IS NOT NULL
        AND to_regprocedure('saas.resolve_public_storefront(text,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.public_list_products(uuid,text,timestamp with time zone,integer)') IS NOT NULL
        AND to_regprocedure('saas.public_get_product_by_slug(uuid,text,timestamp with time zone,text)') IS NOT NULL
        AND to_regprocedure('saas.public_list_product_media(uuid,text,timestamp with time zone,uuid)') IS NOT NULL
        AS migration_020,
      to_regprocedure('saas.quick_links_claim_redemption(text,text,uuid,text,timestamp with time zone,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.quick_links_resolve_redemption(text,text,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.checkout_get_redemption_status(text,text,timestamp with time zone)') IS NOT NULL
        AS migration_027,
      pg_catalog.strpos(COALESCE((
        SELECT procedure.prosrc
        FROM pg_catalog.pg_proc AS procedure
        WHERE procedure.oid=to_regprocedure('saas.quick_links_claim_redemption(text,text,uuid,text,timestamp with time zone,timestamp with time zone)')
      ),''),'effective_expires_at:=LEAST(p_expires_at,current_link.expires_at)')>0
        AS migration_028,
      to_regprocedure('saas.abandoned_carts_capture(text,uuid,text,timestamp with time zone,jsonb,jsonb)') IS NOT NULL
        AND to_regprocedure('saas.abandoned_carts_mark_stale(timestamp with time zone,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.abandoned_carts_convert(text,text,uuid,timestamp with time zone)') IS NOT NULL
        AS migration_032,
	      to_regprocedure('saas.storefront_checkout_preflight()') IS NOT NULL
	        AND saas.storefront_checkout_preflight()
	        AS migration_064,
	      to_regclass('saas.payment_attempts') IS NOT NULL
	        AND to_regprocedure('saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)') IS NOT NULL
	        AND to_regprocedure('saas.payment_callback_authority(text,text,timestamp with time zone)') IS NOT NULL
	        AS migration_052,
	      to_regclass('saas.merchant_provider_execution_authorities') IS NOT NULL
	        AND to_regprocedure('saas.storefront_checkout_execution_authority_matches(text,text,text,integer,text)') IS NOT NULL
	        AND to_regprocedure('saas.payment_provider_keyed_lifecycle_preflight()') IS NOT NULL
	        AND saas.payment_provider_keyed_lifecycle_preflight()
	        AS migration_056,
	      to_regprocedure('saas.quick_order_hosted_payment_authority_preflight()') IS NOT NULL
	        AND saas.quick_order_hosted_payment_authority_preflight()
	        AS migration_057,
	      saas.storefront_checkout_execution_authority_matches(
	        'iyzico_iframe','payment_processing','test',1,'${candidateDigest}'
	      ) AS compiled_authority,
      saas.built_in_payment_methods_preflight() AS builtin_preflight,
      saas.iyzico_iframe_tenant_activation_runtime_preflight() AS iyzico_preflight,
      saas.payment_method_single_active_provider_preflight() AS single_provider_preflight,
      saas.iyzico_iframe_tenant_evidence_preflight() AS iyzico_evidence_preflight,
      saas.payment_provider_keyed_lifecycle_preflight() AS keyed_preflight,
      saas.quick_order_hosted_payment_bridge_preflight() AS bridge_preflight
    FROM pg_roles AS role
    WHERE role.rolname=current_user\`,
  );
  const row = result.rows[0];
  const requiredTrue = [
    "resolver_member",
    "workflow_member",
    "migration_020",
    "migration_027",
    "migration_028",
    "migration_032",
	    "migration_064",
	    "migration_052",
	    "migration_056",
	    "migration_057",
	    "compiled_authority",
    "builtin_preflight",
    "iyzico_preflight",
    "single_provider_preflight",
    "iyzico_evidence_preflight",
    "keyed_preflight",
    "bridge_preflight",
  ];
  if (result.rows.length !== 1
    || row.current_user !== "${DATABASE_USER}"
    || Math.floor(Number(row.version_num) / 10_000) !== 16
    || row.database_name !== "${DATABASE}"
    || row.is_superuser !== false
    || row.resolver_member !== true
    || requiredTrue.some((name) => row[name] !== true)) {
    throw new Error("checkout_browser_runtime_database_role_invalid");
  }
  for (const selected of ${JSON.stringify(CHECKOUT_BROWSER_HOSTS.map(({ hostname }, index) => ({
    credentialDigest: index === 0 ? DIGEST_A : DIGEST_B,
    hostname,
  })))}) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE celebix_saas_workflow");
      const issued = await client.query({
        text: \`SELECT outcome,result_payload
          FROM saas.storefront_checkout_issue_nonce(
            $1::text,$2::text,$3::text,$4::timestamptz
          )\`,
        values: [
          selected.hostname,
          selected.credentialDigest,
          "${"3".repeat(64)}",
          "2026-07-29T09:00:00.000Z",
        ],
      });
      if (issued.rowCount !== 1 || issued.rows[0]?.outcome !== "issued") {
        throw new Error("checkout_browser_runtime_quote_invalid");
      }
      try {
        parseCheckoutQuote({
          ...issued.rows[0].result_payload,
          checkoutNonce: "${Buffer.alloc(32, 0x33).toString("base64url")}",
        });
      } catch (error) {
        throw new Error("checkout_browser_runtime_quote_contract_invalid");
      }
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  }
  const repository = new PostgresPublicCheckoutRepository({
    pool,
    role: "celebix_saas_workflow",
    timeouts: {
      poolCheckoutMs: 5_000,
      statementMs: 5_000,
      lockMs: 2_000,
      idleTransactionMs: 5_000,
    },
    audit: () => undefined,
  });
  for (const selected of ${JSON.stringify(CHECKOUT_BROWSER_HOSTS.map(({ hostname }, index) => ({
    credentialDigest: index === 0 ? DIGEST_A : DIGEST_B,
    hostname,
    operationId: index === 0
      ? "79000000-0000-4000-8000-000000000091"
      : "79000000-0000-4000-8000-000000000092",
  })))}) {
    try {
      const quote = await repository.issueNonce({
        hostname: selected.hostname,
        credentialDigest: selected.credentialDigest,
        now: new Date("2026-07-29T09:00:00.000Z"),
      });
      await repository.updateDelivery({
        hostname: selected.hostname,
        credentialDigest: selected.credentialDigest,
        delivery: {
          cartVersion: quote.cartVersion,
          checkoutNonce: quote.checkoutNonce,
          operationId: selected.operationId,
          email: "preflight@example.test",
          marketingOptIn: false,
          shippingAddress: {
            firstName: "Ön",
            lastName: "Kontrol",
            line1: "Bağdat Caddesi 1",
            district: "Kadıköy",
            city: "İstanbul",
            countryCode: "TR",
            phone: "+905551112233",
          },
          billingAddress: null,
          shippingId: "standard",
          discountCode: null,
        },
        now: new Date("2026-07-29T09:01:00.000Z"),
      });
    } catch (error) {
      throw new Error("checkout_browser_runtime_repository_quote_invalid");
    }
  }
} finally {
  await pool.end();
}`,
  ], {
    cwd: ROOT,
    env: { ...process.env, LC_ALL: "C", LANG: "C", ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (value) => {
    stdout = appendLog(stdout, value);
  });
  child.stderr.on("data", (value) => {
    stderr = appendLog(stderr, value);
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
  if (exitCode !== 0) {
    throw new Error(`checkout_browser_runtime_database_preflight_failed\n${stdout}\n${stderr}`);
  }
  if (database.tlsState.secureConnections < 2) {
    throw new Error("checkout_browser_runtime_tls_path_missing");
  }
}

async function waitForHttp(url, label, init = {}, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  let last = "unavailable";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual", ...init });
      if (response.status > 0) return response;
    } catch (error) {
      last = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${label}_timeout:${last}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!graceful) {
    child.kill("SIGKILL");
    await exited;
  }
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(() => resolve()));
}

function proxyCertificate(root) {
  const key = path.join(root, "proxy.key");
  const certificate = path.join(root, "proxy.crt");
  const config = path.join(root, "proxy-openssl.cnf");
  writeFileSync(config, `[req]
distinguished_name=req_distinguished_name
x509_extensions=v3_req
prompt=no
[req_distinguished_name]
CN=store-a.checkout.test
[v3_req]
subjectAltName=DNS:store-a.checkout.test,DNS:store-b.checkout.test
`);
  run(executable("openssl"), [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-days", "2", "-config", config, "-keyout", key, "-out", certificate,
  ]);
  return {
    cert: readFileSync(certificate),
    key: readFileSync(key),
  };
}

function requestObservation({ body, incomingHost, request }) {
  const observedHeaders = Object.fromEntries(
    [
      "content-length",
      "content-type",
      "host",
      "origin",
      "transfer-encoding",
      "x-forwarded-host",
      "x-forwarded-proto",
    ]
      .filter((name) => request.headers[name] !== undefined)
      .map((name) => [name, request.headers[name]]),
  );
  return Object.freeze({
    bodyBytes: body.byteLength,
    cookieNames: String(request.headers.cookie ?? "")
      .split(";")
      .map((segment) => segment.split("=", 1)[0].trim())
      .filter(Boolean),
    headers: observedHeaders,
    hostname: incomingHost,
    method: request.method,
    pathname: request.url,
  });
}

function proxyRequest({ appPort, request, requestObservations, response }) {
  const incomingHost = String(request.headers.host ?? "").split(":", 1)[0];
  const selected = CHECKOUT_BROWSER_HOSTS.find(({ hostname }) => hostname === incomingHost);
  if (!selected) {
    response.writeHead(421, { "content-type": "text/plain; charset=utf-8" });
    response.end("Unknown checkout fixture host");
    return;
  }
  const chunks = [];
  request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  request.on("end", () => {
    const body = Buffer.concat(chunks);
    if (String(request.url).startsWith("/api/checkout/")) {
      requestObservations.push(requestObservation({ body, incomingHost, request }));
    }
    const forwarded = http.request({
      hostname: "127.0.0.1",
      port: appPort,
      method: request.method,
      path: request.url,
      headers: {
        ...request.headers,
        host: selected.hostname,
        "content-length": String(body.byteLength),
        "x-celebix-storefront-proxy": `p1.${PROXY_TOKEN}`,
        "x-forwarded-for": "93.184.216.34",
        "x-forwarded-host": selected.hostname,
        "x-forwarded-proto": "https",
      },
    }, (upstream) => {
      const headers = { ...upstream.headers };
      delete headers.connection;
      delete headers["keep-alive"];
      delete headers["transfer-encoding"];
      response.writeHead(upstream.statusCode ?? 502, headers);
      upstream.pipe(response);
    });
    forwarded.on("error", (error) => {
      if (!response.headersSent) {
        response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      }
      response.end(`checkout_fixture_upstream_error:${error.message}`);
    });
    if (body.byteLength > 0) forwarded.write(body);
    forwarded.end();
  });
}

export async function startCheckoutBrowserFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "celebix-checkout-browser-"));
  const artifacts = path.join(
    ROOT,
    ".superpowers/sdd/2026-07-28-fixed-one-page-shared-checkout/task-9-evidence",
  );
  mkdirSync(artifacts, { recursive: true });
  let database;
  let next;
  let proxy;
  let iyzicoBuild;
  let nextLog = "";
  const requestObservations = [];
  try {
    iyzicoBuild = approvedIyzicoBuild();
    database = await startPostgres(root);
    prepareDatabase(database, iyzicoBuild.candidateDigest);
    const [appPort, proxyPort, providerControlPort] = await Promise.all([
      freePort(),
      freePort(),
      freePort(),
    ]);
    const providerControlToken = Buffer.alloc(32, 0x6d).toString("base64url");
    const providerControlUrl = `http://127.0.0.1:${providerControlPort}`;
    const runtimeEnvironment = {
      CELEBIX_DEPLOYMENT_TIER: "staging",
      CELEBIX_CHECKOUT_ROLLOUT_MODE: "approved_staging",
      CELEBIX_CHECKOUT_ROLLOUT_HOSTS: CHECKOUT_BROWSER_HOSTS
        .map(({ hostname }) => hostname)
        .join(","),
      CELEBIX_STOREFRONT_DATA_MODE: "approved_staging",
      CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging",
      CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: PROXY_TOKEN,
      CELEBIX_SAAS_DATABASE_NAME: DATABASE,
      CELEBIX_SAAS_DATABASE_URL:
        `postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@127.0.0.1:${database.port}/${DATABASE}?sslmode=require`,
      CELEBIX_R2_MEDIA_ENVIRONMENT: "staging",
      CELEBIX_R2_PUBLIC_ORIGIN: "https://checkout-browser-fixture.r2.dev",
      CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "disabled",
      CELEBIX_IYZICO_IFRAME_STOREFRONT_MODE: "approved_test_sandbox",
      CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_ACTIVE_KEY_ID: PROVIDER_KEY_ID,
      CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_KEYS:
        `${PROVIDER_KEY_ID}:${PROVIDER_KEY_B64URL}`,
      CELEBIX_CHECKOUT_PROVIDER_CONTROL_PORT: String(providerControlPort),
      CELEBIX_CHECKOUT_PROVIDER_CONTROL_TOKEN: providerControlToken,
      NODE_EXTRA_CA_CERTS: database.ca,
      NEXT_TELEMETRY_DISABLED: "1",
    };
	    await preflightRuntimeDatabase(runtimeEnvironment, database, iyzicoBuild.candidateDigest);
    if (process.env.CELEBIX_CHECKOUT_BROWSER_SKIP_BUILD !== "1") {
      run(process.execPath, [NEXT, "build"], {
        cwd: STOREFRONT,
        env: runtimeEnvironment,
      });
    }
    iyzicoBuild.restore();
    iyzicoBuild = undefined;
    next = spawn(process.execPath, [NEXT, "start", "-p", String(appPort)], {
      cwd: STOREFRONT,
      env: {
        ...process.env,
        ...runtimeEnvironment,
        NODE_ENV: "production",
        NODE_OPTIONS: [
          process.env.NODE_OPTIONS,
          `--import=${path.join(
            ROOT,
            "tests/saas-phase3/storefront-one-page-checkout/provider-fetch-preload.mjs",
          )}`,
        ].filter(Boolean).join(" "),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    next.stdout.on("data", (value) => {
      nextLog = appendLog(nextLog, value);
    });
    next.stderr.on("data", (value) => {
      nextLog = appendLog(nextLog, value);
    });
    const controlHeaders = Object.freeze({ "x-checkout-control": providerControlToken });
    await waitForHttp(`${providerControlUrl}/state`, "checkout_provider_control", {
      headers: controlHeaders,
    });
    await waitForHttp(`http://127.0.0.1:${appPort}/health`, "checkout_next");
    const certificate = proxyCertificate(root);
    proxy = https.createServer(certificate, (request, response) => {
      proxyRequest({ appPort, request, requestObservations, response });
    });
    await new Promise((resolve, reject) => {
      proxy.once("error", reject);
      proxy.listen(proxyPort, "127.0.0.1", resolve);
    });
    return Object.freeze({
      appPort,
      artifacts,
      database: Object.freeze({
        name: DATABASE,
        port: database.port,
        url: runtimeEnvironment.CELEBIX_SAAS_DATABASE_URL,
        query(input) {
          return psql(database, input).stdout.trim();
        },
      }),
      nextLog() {
        return nextLog;
      },
      requestLog() {
        return structuredClone(requestObservations);
      },
      hostResolverRules: CHECKOUT_BROWSER_HOSTS
        .map(({ hostname }) => `MAP ${hostname}:443 127.0.0.1:${proxyPort}`)
        .join(","),
      hosts: CHECKOUT_BROWSER_HOSTS,
      scenarios: CHECKOUT_BROWSER_SCENARIOS,
      proxyPort,
      async providerState() {
        const response = await fetch(`${providerControlUrl}/state`, { headers: controlHeaders });
        if (!response.ok) throw new Error("checkout_fixture_provider_state_unavailable");
        return await response.json();
      },
      async resetProviderCalls() {
        const response = await fetch(`${providerControlUrl}/calls`, {
          method: "DELETE",
          headers: controlHeaders,
        });
        if (response.status !== 204) {
          throw new Error("checkout_fixture_provider_reset_unavailable");
        }
      },
      disablePaytrExecutionAuthority() {
        const disabled = psql(database, `SET ROLE celebix_saas_owner;
          WITH changed AS (
            UPDATE saas.merchant_provider_execution_authorities
            SET enabled=false
            WHERE provider_code='paytr_iframe'
              AND capability='payment_processing'
              AND environment='test'
              AND enabled
            RETURNING 1
          ) SELECT pg_catalog.count(*) FROM changed;`).stdout.trim();
        if (disabled !== "1") {
          throw new Error("checkout_fixture_paytr_authority_disable_failed");
        }
      },
      async setProviderOutcome(provider, outcome) {
        if (!['iyzico', 'paytr'].includes(provider)
          || !["redirect", "processing", "rejected"].includes(outcome)) {
          throw new Error("checkout_fixture_provider_outcome_invalid");
        }
        const response = await fetch(`${providerControlUrl}/outcome`, {
          method: "PUT",
          headers: { ...controlHeaders, "content-type": "application/json" },
          body: JSON.stringify({ provider, outcome }),
        });
        if (response.status !== 204) {
          throw new Error("checkout_fixture_provider_outcome_unavailable");
        }
      },
      async stop() {
        await closeServer(proxy);
        await stopProcess(next);
        stopPostgres(database);
        rmSync(root, { recursive: true, force: true });
      },
    });
  } catch (error) {
    const postgresLogPath = path.join(root, "postgres.log");
    const postgresLog = existsSync(postgresLogPath)
      ? sanitizeDiagnostic(readFileSync(postgresLogPath, "utf8"))
      : "";
    await closeServer(proxy);
    await stopProcess(next);
    iyzicoBuild?.restore();
    stopPostgres(database);
    rmSync(root, { recursive: true, force: true });
    throw new Error(`${error instanceof Error ? error.stack : String(error)}\nPOSTGRES_LOG\n${postgresLog}\nNEXT_LOG\n${nextLog}`);
  }
}
