import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const SQL = path.join(ROOT, 'apps/owner/scripts/sql/saas');
const HARNESS = path.join(import.meta.dirname, 'postgres-harness.mjs');
const ARCHIVE_UP = '202609090127_orders_qa_archive.up.sql';
const REPLACEMENT_UP = '202609140128_store_domain_replacement_bundles.up.sql';

function expectedPrerequisites(maximum) {
  return readdirSync(SQL)
    .filter(file => /^\d{12}/.test(file)
      && !file.includes('.down.')
      && file !== ARCHIVE_UP
      && Number(file.slice(8, 12)) <= maximum
      && /(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(file))
    .sort((left, right) => Number(left.slice(8, 12)) - Number(right.slice(8, 12)) || left.localeCompare(right));
}

test('optional rehearsal loads the real migration 128 before archive 127 while default remains at 126', () => {
  const source = readFileSync(HARNESS, 'utf8');
  const defaults = expectedPrerequisites(126);
  const rehearsal = expectedPrerequisites(128);

  assert.equal(defaults.includes(REPLACEMENT_UP), false);
  assert.equal(defaults.includes(ARCHIVE_UP), false);
  assert.equal(rehearsal.includes(REPLACEMENT_UP), true);
  assert.equal(rehearsal.includes(ARCHIVE_UP), false);
  assert.match(source, /process\.env\.ARCHIVE_REHEARSE_AFTER_128 === '1'/);
  assert.match(source, /rehearseAfter128 \? 128 : 126/);
  assert.match(source, /f !== UP/);
  assert.ok(source.indexOf('for(const f of files') < source.indexOf("sql(readFileSync(path.join(SQL,UP),'utf8'))"));
});
