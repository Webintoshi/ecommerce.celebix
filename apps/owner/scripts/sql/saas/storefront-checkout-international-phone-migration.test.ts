import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const PREFIX = "202610010188_storefront_checkout_international_phone";
const SQL = path.dirname(new URL(import.meta.url).pathname);
const baseline = readFileSync(path.join(SQL, "202607310072_storefront_cart_checkout.up.sql"), "utf8");
const start = baseline.indexOf("CREATE FUNCTION saas.storefront_delivery_valid(p_delivery jsonb)");
assert.ok(start >= 0);
const originalFunction = baseline.slice(start, baseline.indexOf("$f$;", start) + 4);
const literal = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const delivery = (phone: string) => ({
  contact: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", phone },
  shippingAddress: { line1: "Cadde 1", city: "İstanbul", country: "TR" },
});

function binary(name: string) {
  const bundled = path.join(homedir(), ".codex", "tmp");
  const candidates = (existsSync(bundled) ? readdirSync(bundled, { withFileTypes: true }) : [])
    .filter(entry => entry.isDirectory() && /^postgresql-16[.][0-9]+-install$/.test(entry.name))
    .map(entry => path.join(bundled, entry.name, "bin"));
  for (const directory of [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter), ...candidates]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* try the next local runtime */ }
  }
  throw new Error(`Local PostgreSQL ${name} is required for migration verification.`);
}

test("international checkout phone migration preserves helper authority, other delivery fields and rollback", () => {
  const root = mkdtempSync(path.join(tmpdir(), "checkout-phone-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = String(20_000 + Math.floor(Math.random() * 10_000));
  mkdirSync(socket, { mode: 0o700 });
  const pg = Object.fromEntries(["initdb", "pg_ctl", "psql"].map(name => [name, binary(name)]));
  const run = (program: string, args: string[], input = "", allowFailure = false) => {
    const result = spawnSync(program, args, { input, encoding: "utf8", timeout: 30_000, env: { ...process.env, LC_ALL: "C", LANG: "C" } });
    if (result.error) throw result.error;
    if (!allowFailure) assert.equal(result.status, 0, result.stderr);
    return result;
  };
  const sql = (source: string, allowFailure = false) => run(pg.psql!, ["-h", socket, "-p", port, "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], source, allowFailure);
  const validate = (value: unknown) => sql(`SELECT saas.storefront_delivery_valid(${literal(value)}) IS TRUE;`).stdout.trim();
  const metadata = () => JSON.parse(sql("SELECT to_jsonb(p)-'prosrc' FROM pg_catalog.pg_proc p WHERE oid='saas.storefront_delivery_valid(jsonb)'::regprocedure;").stdout.trim());
  let started = false;
  try {
    run(pg.initdb!, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8", "--no-sync"]);
    run(pg.pg_ctl!, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
    started = true;
    sql(`CREATE ROLE celebix_saas_owner; CREATE ROLE celebix_saas_host_resolver; CREATE ROLE checkout_denied;
      CREATE SCHEMA saas AUTHORIZATION celebix_saas_owner; SET ROLE celebix_saas_owner;
      ${originalFunction}
      REVOKE ALL ON FUNCTION saas.storefront_delivery_valid(jsonb) FROM PUBLIC;
      GRANT USAGE ON SCHEMA saas TO celebix_saas_host_resolver, checkout_denied;
      GRANT EXECUTE ON FUNCTION saas.storefront_delivery_valid(jsonb) TO celebix_saas_host_resolver;
      RESET ROLE;`);
    assert.equal(validate(delivery("+905551112233")), "t");
    assert.equal(validate(delivery("+14155552671")), "f");
    const before = metadata();
    const upPath = path.join(SQL, `${PREFIX}.up.sql`);
    // Without the new migration the international acceptance assertion remains red.
    if (existsSync(upPath)) sql(readFileSync(upPath, "utf8"));
    for (const phone of ["+905551112233", "+14155552671", "+447911123456", "+4915112345678", "+12345678", "+123456789012345"]) {
      assert.equal(validate(delivery(phone)), "t", `${phone} must reach the same checkout delivery helper`);
    }
    for (const phone of ["14155552671", "+04155552671", "+1 4155552671", "+1-4155552671", "+1234567", "+1234567890123456", "+14155552671\n", "+١٤١٥٥٥٥٢٦٧١"]) {
      assert.equal(validate(delivery(phone)), "f", "Malformed phone must stay rejected");
    }
    for (const value of [
      { ...delivery("+14155552671"), contact: { ...delivery("+14155552671").contact, email: "invalid" } },
      { ...delivery("+14155552671"), contact: { ...delivery("+14155552671").contact, firstName: "" } },
      { ...delivery("+14155552671"), shippingAddress: { line1: "", city: "İstanbul", country: "TR" } },
      { ...delivery("+14155552671"), shippingAddress: { line1: "Cadde 1", city: "İstanbul", country: "TR", privateField: true } },
      { ...delivery("+14155552671"), note: "" },
    ]) assert.equal(validate(value), "f", "Other delivery constraints must remain in place");
    assert.deepEqual(metadata(), before);
    assert.equal(sql(`SET ROLE celebix_saas_host_resolver; SELECT saas.storefront_delivery_valid(${literal(delivery("+14155552671"))});`).stdout.trim(), "t");
    assert.notEqual(sql(`SET ROLE checkout_denied; SELECT saas.storefront_delivery_valid(${literal(delivery("+14155552671"))});`, true).status, 0);
    sql(readFileSync(path.join(SQL, `${PREFIX}_assertions.sql`), "utf8"));
    assert.notEqual(sql(readFileSync(upPath, "utf8"), true).status, 0, "Unexpected predecessor must fail instead of silently patching twice");
    sql(readFileSync(path.join(SQL, `${PREFIX}.down.sql`), "utf8"));
    assert.equal(validate(delivery("+905551112233")), "t");
    assert.equal(validate(delivery("+14155552671")), "f");
    assert.deepEqual(metadata(), before);
  } finally {
    if (started) run(pg.pg_ctl!, ["-D", data, "-m", "fast", "stop"], "", true);
    rmSync(root, { recursive: true, force: true });
  }
});
