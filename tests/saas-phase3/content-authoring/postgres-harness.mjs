import pg from 'pg';
// Reuses the established retail fixture seed against a disposable PostgreSQL16 cluster.
import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const ROOT = path.resolve(import.meta.dirname, "../../.."), SQL = path.join(ROOT, "apps/owner/scripts/sql/saas"), DB = "starter_retail_experience", RESTORE = "starter_retail_restore";
const UP = "202608020075_complete_starter_retail_experience.up.sql", DOWN = "202608020075_complete_starter_retail_experience.down.sql", ASSERTIONS = "202608020075_complete_starter_retail_experience_assertions.sql";
const STORE_A = "10000000-0000-4000-8000-000000000075", STORE_B = "10000000-0000-4000-8000-000000000076", HOST_A = "retail-a.example.test", HOST_PLATFORM = "retail-a.saas-staging.celebix.site", HOST_B = "retail-b.example.test", PLAN = "00000000-0000-4000-8000-000000000001";
const PRINCIPAL_A = "20000000-0000-4000-8000-000000000075", PRINCIPAL_B = "20000000-0000-4000-8000-000000000076", MEMBERSHIP_A = "30000000-0000-4000-8000-000000000075", MEMBERSHIP_B = "30000000-0000-4000-8000-000000000076";
const PRODUCT = "40000000-0000-4000-8000-000000000075", INACTIVE_PRODUCT = "40000000-0000-4000-8000-000000000076", VARIANT = "50000000-0000-4000-8000-000000000075", COMPOSITION = "60000000-0000-4000-8000-000000000075", NOW = "2026-08-02T09:00:00.000Z";
function executable(name) {
    const candidates = [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter)];
    try {
        for (const entry of readdirSync(path.join(homedir(), ".codex", "tmp"), {
            withFileTypes: true
        }))
            if (entry.isDirectory() && /^postgresql-16[.]/.test(entry.name))
                candidates.push(path.join(homedir(), ".codex", "tmp", entry.name, "bin"));
    }
    catch {
    }
    for (const directory of candidates) {
        if (!directory)
            continue;
        const candidate = path.join(directory, name);
        try {
            accessSync(candidate, constants.X_OK);
            return candidate;
        }
        catch {
        }
    }
    throw new Error(`DISPOSABLE_DB_EXECUTION_BLOCKED: missing ${name}`);
}
function command(program, args, input = "", allowFailure = false, environment = {}) {
    const result = spawnSync(program, args, {
        cwd: ROOT, input, encoding: "utf8", env: {
            ...process.env, ...environment, LC_ALL: "C", LANG: "C"
        }, maxBuffer: 128 * 1024 * 1024
    });
    if (result.error)
        throw result.error;
    if (!allowFailure && result.status !== 0)
        throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
    return result;
}
function start() {
    const tools = Object.fromEntries(["initdb", "pg_ctl", "psql"].map(name => [name, executable(name)]));
    const root = mkdtempSync(path.join("/tmp", "celebix-content-operations-")), data = path.join(root, "data"), socket = path.join(root, "socket"), port = 20000 + Math.floor(Math.random() * 15000);
    mkdirSync(socket, {
        mode: 0o700
    });
    command(tools.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
    command(tools.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
    return {
        tools, root, data, socket, port
    };
}
function stop(box) {
    if (!box)
        return;
    command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], "", true);
    rmSync(box.root, {
        recursive: true, force: true
    });
}
function psql(box, source, database = DB, allowFailure = false) {
    return command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], source, allowFailure);
}
function apply(box, file, database = DB) {
    psql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}
function migrations() {
    const accepted = /(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;
    return readdirSync(SQL).filter(file => {
        const sequence = Number.parseInt(file.slice(8, 12), 10);
        return Number.isSafeInteger(sequence) && sequence <= 71 && accepted.test(file) && !file.includes(".down.");
    }).sort((left, right) => {
        const a = Number.parseInt(left.slice(8, 12), 10), b = Number.parseInt(right.slice(8, 12), 10);
        if (a !== b)
            return a - b;
        const weight = value => value.includes("assertions") ? 3 : value.includes("freeze") || value.includes("grants") ? 2 : 1;
        return weight(left) - weight(right) || left.localeCompare(right);
    });
}
function result(box, call, database = DB) {
    const output = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome||'|'||COALESCE(result_payload::text,'null') FROM ${call};COMMIT;`, database).stdout.trim().split("\n").at(-1), separator = output.indexOf("|");
    return {
        outcome: output.slice(0, separator), payload: JSON.parse(output.slice(separator + 1))
    };
}
async function main() {
    let box;
    try {
        box = start();
        psql(box, `CREATE DATABASE ${DB};`, "postgres");
        const files = readdirSync(SQL).filter(f => {
            const n = Number.parseInt(f.slice(8, 12), 10);
            return (n <= 80 || n === 163 || n === 164) && !f.includes('seed_guzide') && /(?:[.]up|[.]seed|[.]freeze|_grants)[.]sql$/.test(f);
        }).sort((a, b) => Number.parseInt(a.slice(8, 12), 10) - Number.parseInt(b.slice(8, 12), 10) || a.localeCompare(b));
        for (const file of files)
            apply(box, file);
        psql(box, `SET ROLE celebix_saas_owner;
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE_A}','AI A','ai-a','active','tr','TRY','starter','2026-01-01','2026-01-01'),('${STORE_B}','AI B','ai-b','active','tr','TRY','starter','2026-01-01','2026-01-01');
 INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${PRINCIPAL_A}','https://identity.example.test/oidc','ai-a','ai-a@example.test',true,'2026-01-01','2026-01-01'),('${PRINCIPAL_B}','https://identity.example.test/oidc','ai-b','ai-b@example.test',true,'2026-01-01','2026-01-01');
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MEMBERSHIP_A}','${PRINCIPAL_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),('${MEMBERSHIP_B}','${PRINCIPAL_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('71000000-0000-4000-8000-000000000075','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01'),('71000000-0000-4000-8000-000000000076','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');`);
        const now = '2026-09-29T12:00:00.000Z', config = '80000000-0000-4000-8000-000000000075', draft = '90000000-0000-4000-8000-000000000075', fp = 'a'.repeat(64), source = 'b'.repeat(64);
        const auth = (store = STORE_A, actor = PRINCIPAL_A, member = MEMBERSHIP_A, time = now) => `'${store}','${actor}','${member}','${PLAN}','free_starter',1,'${time}'`;
        const invoke = (name, extra, a = auth()) => {
            const text = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome||'|'||coalesce(result_payload::text,'null') FROM saas.content_authoring_${name}(${a},${extra});COMMIT;`).stdout.trim().split('\n').at(-1);
            const i = text.indexOf('|');
            return {
                outcome: text.slice(0, i), payload: JSON.parse(text.slice(i + 1))
            };
        };
        const op = n => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
        const begin = (id, f = fp, a = auth()) => invoke('begin', `'${id}','${f}','${draft}',NULL,'${source}','${config}','deepseek','deepseek-flash',1,'v1'`, a);
        // RED: missing function is required to fail before migration.
        assert.notEqual(psql(box, `SELECT * FROM saas.content_authoring_get(${auth()},'${op(1)}');`, DB, true).status, 0);
        console.log('RED operations functions absent before migration');
        apply(box, '202609290170_content_authoring_operations.up.sql');
        apply(box, '202609290170_content_authoring_operations.down.sql');
        apply(box, '202609290170_content_authoring_operations.up.sql');
        const sealed = JSON.stringify({
            algorithm: 'A256GCM', ciphertext: 'Y3JlZGVudGlhbA', iv: 'MTIzNDU2Nzg5MDEy', keyId: 'qa', tag: 'MTIzNDU2Nzg5MDEyMzQ1Ng', version: 1
        });
        psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT * FROM saas.toshi_provider_connect(${auth()},'${op(999)}','${fp}','${config}','deepseek','${sealed}'::jsonb,'sha256:${fp}',1,'••••QA01','deepseek-flash','[{"id":"deepseek-flash","label":"Flash"}]'::jsonb,0);COMMIT;`);
        assert.equal(begin(op(1)).outcome, 'pending');
        assert.equal(begin(op(1)).outcome, 'existing-status');
        assert.equal(begin(op(1), 'c'.repeat(64)).outcome, 'operation_mismatch');
        assert.equal(begin(op(2)).outcome, 'operation_busy');
        assert.equal(begin(op(4), fp, auth(STORE_A, PRINCIPAL_B, MEMBERSHIP_B)).outcome, 'membership_denied');
        assert.equal(invoke('get', `'${op(1)}'`, auth(STORE_B, PRINCIPAL_B, MEMBERSHIP_B)).outcome, 'operation_not_found');
        const c = invoke('claim', `'${op(1)}',1`);
        assert.equal(c.outcome, 'claimed');
        assert.equal(invoke('claim', `'${op(1)}',1`).outcome, 'version_conflict');
        const positiveDraft = {
            seoTitle: 'Title', seoDescription: 'Description', suggestions: ['Suggestion'], claims: [{
                    field: 'description', factRef: 'r', value: 'v', unit: 'cm'
                }], sourceFingerprint: source, description: [
                {
                    type: 'paragraph', children: [{
                            type: 'text', text: 'Quotes " with spaces, slash \\ and emoji 😀'
                        }, {
                            type: 'fact', factRef: 'r', value: 'v', unit: 'cm'
                        }]
                },
                {
                    type: 'heading', level: 2, children: [{
                            type: 'text', text: 'Heading'
                        }]
                },
                {
                    type: 'list', ordered: false, items: [[{
                                type: 'text', text: 'Item'
                            }]]
                },
                {
                    type: 'table', rows: [[[{
                                    type: 'fact', factRef: 'r', value: 'v'
                                }]]]
                },
            ]
        };
        const output = JSON.stringify(positiveDraft);
        const goodDraft = {
            seoTitle: 'Title', suggestions: [], claims: [], sourceFingerprint: source
        };
        const invalidDrafts = [
            ['nested suggestion envelope', {
                    ...goodDraft, suggestions: [{
                            sealedCredentials: 'synthetic'
                        }]
                }],
            ['nested claim envelope', {
                    ...goodDraft, claims: [{
                            field: 'seoTitle', factRef: 'r', value: 'v', sealedCredentials: 'synthetic'
                        }]
                }],
            ['claim non-string value', {
                    ...goodDraft, claims: [{
                            field: 'seoTitle', factRef: 'r', value: 12
                        }]
                }],
            ['claim field not generated', {
                    ...goodDraft, claims: [{
                            field: 'description', factRef: 'r', value: 'v'
                        }]
                }],
            ['nested description envelope', {
                    ...goodDraft, description: [{
                            type: 'paragraph', children: [{
                                    type: 'text', text: 't', rawProviderEnvelope: {
                                        key: 'synthetic'
                                    }
                                }]
                        }]
                }],
            ['nested fact envelope', {
                    ...goodDraft, description: [{
                            type: 'paragraph', children: [{
                                    type: 'fact', factRef: 'r', value: 'v', credential: 'synthetic'
                                }]
                        }]
                }],
            ['heading invalid level', {
                    ...goodDraft, description: [{
                            type: 'heading', level: 1, children: []
                        }]
                }],
            ['list invalid ordered', {
                    ...goodDraft, description: [{
                            type: 'list', ordered: 'yes', items: []
                        }]
                }],
            ['table invalid nested row', {
                    ...goodDraft, description: [{
                            type: 'table', rows: [{
                                    sealedCredentials: 'synthetic'
                                }]
                        }]
                }],
            ['empty generated fields', {
                    suggestions: [], claims: [], sourceFingerprint: source
                }],
            ['non-string SEO', {
                    ...goodDraft, seoTitle: {
                        rawProviderEnvelope: 'synthetic'
                    }
                }],
            ['markup SEO', {
                    ...goodDraft, seoTitle: '<b>Title</b>'
                }],
            ['overlength suggestion', {
                    ...goodDraft, suggestions: ['x'.repeat(301)]
                }],
            ['too many suggestions', {
                    ...goodDraft, suggestions: Array(6).fill('x')
                }],
            ['too many blocks', {
                    ...goodDraft, description: Array(101).fill({
                        type: 'paragraph', children: []
                    })
                }],
            ['too many children', {
                    ...goodDraft, description: [{
                            type: 'paragraph', children: Array(101).fill({
                                type: 'text', text: 'x'
                            })
                        }]
                }],
            ['too many list items', {
                    ...goodDraft, description: [{
                            type: 'list', ordered: true, items: Array(101).fill([])
                        }]
                }],
            ['too many table rows', {
                    ...goodDraft, description: [{
                            type: 'table', rows: Array(51).fill([])
                        }]
                }],
            ['too many table cells', {
                    ...goodDraft, description: [{
                            type: 'table', rows: [Array(21).fill([])]
                        }]
                }],
            ['fact null unit', {
                    ...goodDraft, description: [{
                            type: 'paragraph', children: [{
                                    type: 'fact', factRef: 'r', value: 'v', unit: null
                                }]
                        }]
                }],
            ['claim overlength ref', {
                    ...goodDraft, claims: [{
                            field: 'seoTitle', factRef: 'r'.repeat(201), value: 'v'
                        }]
                }],
            ['control suggestion', {
                    ...goodDraft, suggestions: ['bad\u0001']
                }],
            ['UTF16 overlength SEO', {
                    ...goodDraft, seoTitle: '😀'.repeat(101)
                }],
            ['description serialized limit', {
                    ...goodDraft, description: [{
                            type: 'paragraph', children: [{
                                    type: 'text', text: 'x'.repeat(10000)
                                }, {
                                    type: 'text', text: 'x'.repeat(9990)
                                }]
                        }]
                }],
            ['too many nodes', {
                    ...goodDraft, description: Array(11).fill({
                        type: 'paragraph', children: Array(100).fill({
                            type: 'text', text: 'x'
                        })
                    })
                }],
            ['fingerprint case', {
                    ...goodDraft, sourceFingerprint: source.toUpperCase()
                }],
        ];
        const invalidUsages = [
            ['extra usage key', {
                    inputTokens: 1, outputTokens: 1, totalTokens: 2, sealedCredentials: 'synthetic'
                }],
            ['null counter', {
                    inputTokens: null, outputTokens: 1, totalTokens: 1
                }],
            ['boolean counter', {
                    inputTokens: true, outputTokens: 1, totalTokens: 2
                }],
            ['string counter', {
                    inputTokens: '1', outputTokens: 1, totalTokens: 2
                }],
            ['fraction counter', {
                    inputTokens: 0.5, outputTokens: 0.5, totalTokens: 1
                }],
            ['negative counter', {
                    inputTokens: -1, outputTokens: 2, totalTokens: 1
                }],
            ['overflow counter', {
                    inputTokens: 2147483648, outputTokens: 0, totalTokens: 2147483648
                }],
            ['wrong sum', {
                    inputTokens: 1, outputTokens: 1, totalTokens: 3
                }],
            ['missing counter', {
                    inputTokens: 1, outputTokens: 1
                }],
            ['array usage', []],
        ];
        for (const [label, bad] of invalidDrafts) {
            const r = invoke('complete', `'${op(1)}','${c.payload.claimToken}',2,'${JSON.stringify(bad)}'::jsonb,NULL`);
            assert.equal(r.outcome, 'invalid_input', label);
            const persisted = invoke('get', `'${op(1)}'`).payload;
            assert.equal(persisted.status, 'pending', label);
            assert.equal(persisted.version, 2, label);
            assert.equal(persisted.draft, null, label);
            assert.equal(persisted.usage, null, label);
        }
        for (const [label, bad] of invalidUsages) {
            const r = invoke('complete', `'${op(1)}','${c.payload.claimToken}',2,'${output}'::jsonb,'${JSON.stringify(bad)}'::jsonb`);
            assert.equal(r.outcome, 'invalid_input', label);
            const persisted = invoke('get', `'${op(1)}'`).payload;
            assert.equal(persisted.status, 'pending', label);
            assert.equal(persisted.version, 2, label);
            assert.equal(persisted.draft, null, label);
            assert.equal(persisted.usage, null, label);
        }
        console.log(`PASS strict completion rejects ${invalidDrafts.length} nested/empty/limited drafts and ${invalidUsages.length} malformed usages without storing a result`);
        assert.equal(invoke('complete', `'${op(1)}','${c.payload.claimToken}',2,'${output}',NULL`).outcome, 'completed');
        assert.equal(begin(op(1)).outcome, 'replayed-result');
        assert.equal(invoke('get', `'${op(1)}'`).payload.usage, null);
        assert.equal(begin(op(2)).outcome, 'pending');
        const c2 = invoke('claim', `'${op(2)}',1`);
        const later = auth(STORE_A, PRINCIPAL_A, MEMBERSHIP_A, '2026-09-29T12:01:01.000Z');
        assert.equal(invoke('get', `'${op(2)}'`, later).payload.status, 'unknown');
        assert.equal(invoke('complete', `'${op(2)}','${c2.payload.claimToken}',2,'${output}',NULL`, later).outcome, 'version_conflict');
        assert.equal(begin(op(2), fp, later).payload.status, 'unknown');
        assert.equal(begin(op(3), fp, later).outcome, 'pending');
        assert.equal(invoke('get', `'${op(3)}'`, auth(STORE_A, PRINCIPAL_A, MEMBERSHIP_A, '2026-09-29T12:02:02.000Z')).payload.status, 'failed');
        psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.memberships SET role='analyst' WHERE id='${MEMBERSHIP_A}';`);
        assert.equal(begin(op(4), fp, later).outcome, 'membership_denied');
        psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.memberships SET role='store_owner' WHERE id='${MEMBERSHIP_A}';`);
        const t = '2026-09-29T14:00:00.000Z', a = auth(STORE_A, PRINCIPAL_A, MEMBERSHIP_A, t);
        for (let n = 10; n < 16; n++) {
            assert.equal(begin(op(n), fp, a).outcome, 'pending');
            const code = ['invalid_input', 'rate_limited', 'quota_exceeded'][n - 10] ?? 'cancelled';
            if (n === 10) {
                assert.equal(invoke('fail', `'${op(n)}',NULL,1,'arbitrary_client_message','not_dispatched'`, a).outcome, 'invalid_input');
                assert.equal(invoke('get', `'${op(n)}'`, a).payload.status, 'pending');
            }
            const dispatched = n === 11 || n === 12;
            const failureClaim = dispatched ? invoke('claim', `'${op(n)}',1`, a).payload : null;
            const failed = invoke('fail', failureClaim
                ? `'${op(n)}','${failureClaim.claimToken}',${failureClaim.version},'${code}','dispatched'`
                : `'${op(n)}',NULL,1,'${code}','not_dispatched'`, a);
            assert.equal(failed.outcome, 'failed', code);
            assert.equal(failed.payload.safeCode, code);
        }
        assert.equal(begin(op(16), fp, a).outcome, 'rate_limited');
        for (let n = 16; n <= 106; n++) {
            const time = new Date(Date.parse(t) + (n - 15) * 61000).toISOString(), aa = auth(STORE_A, PRINCIPAL_A, MEMBERSHIP_A, time);
            const r = begin(op(n), fp, aa);
            assert.equal(r.outcome, n <= 106 ? 'pending' : 'quota_exceeded');
            invoke('fail', `'${op(n)}',NULL,1,'cancelled','not_dispatched'`, aa);
        }
        // Three earlier attempts + six at 14:00 + 91 later = default 100.
        assert.equal(begin(op(107), fp, auth(STORE_A, PRINCIPAL_A, MEMBERSHIP_A, '2026-09-29T17:00:00.000Z')).outcome, 'quota_exceeded');
        // Independent connections exercise the real row/advisory-lock race.
        const peers = [new pg.Client({
                host: box.socket, port: box.port, user: 'postgres', database: DB
            }), new pg.Client({
                host: box.socket, port: box.port, user: 'postgres', database: DB
            })];
        await Promise.all(peers.map(p => p.connect()));
        const raceAuth = auth(STORE_A, PRINCIPAL_A, MEMBERSHIP_A, '2026-09-30T12:00:00.000Z');
        async function race(name, extras, authorities = [raceAuth, raceAuth]) {
            return Promise.all(peers.map(async (p, i) => {
                await p.query('BEGIN');
                try {
                    await p.query('SET LOCAL ROLE celebix_saas_app');
                    const r = await p.query(`SELECT * FROM saas.content_authoring_${name}(${authorities[i]},${extras[i]})`);
                    await p.query('COMMIT');
                    return r.rows[0];
                }
                catch (e) {
                    await p.query('ROLLBACK');
                    throw e;
                }
            }));
        }
        try {
            const reservations = await race('begin', [108, 109].map(n => `'${op(n)}','${fp}','${draft}',NULL,'${source}','${config}','deepseek','deepseek-flash',1,'v1'`));
            assert.deepEqual(reservations.map(r => r.outcome).sort(), ['operation_busy', 'pending']);
            const won = reservations.find(r => r.outcome === 'pending').result_payload.id;
            const claims = await race('claim', [`'${won}',1`, `'${won}',1`]);
            assert.deepEqual(claims.map(r => r.outcome).sort(), ['claimed', 'version_conflict']);
            const alternateMember = '30000000-0000-4000-8000-000000000077';
            psql(box, `SET ROLE celebix_saas_owner;INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${alternateMember}','${PRINCIPAL_B}','${STORE_A}','editor','active','2026-01-01','2026-01-01');`);
            assert.equal(invoke('set_daily_limit', '1').outcome, 'updated');
            const boundary = await race('begin', [110, 111].map(n => `'${op(n)}','${fp}','${draft}',NULL,'${source}','${config}','deepseek','deepseek-flash',1,'v1'`), [auth(STORE_A, PRINCIPAL_A, MEMBERSHIP_A, '2026-10-01T12:00:00.000Z'), auth(STORE_A, PRINCIPAL_B, alternateMember, '2026-10-01T12:00:00.000Z')]);
            assert.deepEqual(boundary.map(r => r.outcome).sort(), ['pending', 'quota_exceeded']);
        }
        finally {
            await Promise.all(peers.map(p => p.end()));
        }
        assert.equal(invoke('set_daily_limit', '120').outcome, 'updated');
        psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.memberships SET role='editor' WHERE id='${MEMBERSHIP_A}';`);
        assert.equal(invoke('set_daily_limit', '130').outcome, 'membership_denied');
        psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.memberships SET role='store_owner' WHERE id='${MEMBERSHIP_A}';`);
        assert.equal(psql(box, `SET ROLE celebix_saas_owner;SELECT saas.content_authoring_usage_valid('{"inputTokens":2147483646,"outputTokens":1,"totalTokens":2147483647}'::jsonb),saas.content_authoring_usage_valid(NULL);`).stdout.trim(), 't|t');
        for (const helper of ['content_authoring_object_valid(jsonb,text[],text[])', 'content_authoring_utf16_length(text)', 'content_authoring_text_valid(jsonb,integer,integer)', 'content_authoring_nodes_count(jsonb)', 'content_authoring_draft_valid(jsonb,text)', 'content_authoring_usage_valid(jsonb)']) {
            assert.equal(psql(box, `SELECT has_function_privilege('celebix_saas_app','saas.${helper}','EXECUTE'),has_function_privilege('celebix_saas_workflow','saas.${helper}','EXECUTE'),has_function_privilege('celebix_saas_host_resolver','saas.${helper}','EXECUTE');`).stdout.trim(), 'f|f|f');
        }
        assert.equal(psql(box, `SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN('saas.content_authoring_operations'::regclass,'saas.content_authoring_settings'::regclass,'saas.content_authoring_origin_history'::regclass);`).stdout.trim(), 't');
        assert.notEqual(psql(box, `SET ROLE celebix_saas_app;SELECT * FROM saas.content_authoring_operations;`, DB, true).status, 0);
        const failed = psql(box, readFileSync(path.join(SQL, '202609290170_content_authoring_operations.down.sql'), 'utf8'), DB, true);
        assert.notEqual(failed.status, 0);
        assert.match(failed.stderr, /CONTENT_AUTHORING_ROLLBACK_REQUIRES_EMPTY_HISTORY/);
        console.log('PASS PostgreSQL16 170 up/down, replay, authority, CAS, lease, crash fences, nullable usage, 6/minute and 100/day, RLS, rollback preserves history');
    }
    finally {
        stop(box);
    }
}
await main();
