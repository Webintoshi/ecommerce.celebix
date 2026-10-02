const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('production starts an approved reconciliation runner and waits for it during web shutdown', async () => {
  const children = [], exits = [];
  const processFixture = new EventEmitter();
  Object.assign(processFixture, {
    argv: ['node', 'start-production.cjs'], execPath: process.execPath,
    env: { PORT: '3450', CELEBIX_SEO_WORKER_ENABLED: 'false' },
    exit: code => exits.push(code), kill: () => {}, pid: 1000,
  });
  const loader = name => {
    if (name === 'node:child_process') return {
      spawn: (command, args, options) => {
        const child = new EventEmitter(); child.signals = []; child.kill = signal => child.signals.push(signal);
        children.push({ command, args, options, child }); return child;
      }, spawnSync: () => { throw new Error('unexpected synchronous gate'); },
    };
    return require(name);
  };
  loader.resolve = () => '/next/bin/next';
  vm.runInNewContext(readFileSync(path.join(__dirname, 'start-production.cjs'), 'utf8'), {
    require: loader, __dirname, process: processFixture, console: { error: () => {} },
  });
  const reconciliation = children.find(entry => entry.args.some(value => value.endsWith('standard-checkout-supervisor-run.cjs')));
  assert.ok(reconciliation, 'production must start automatic standard checkout reconciliation');
  assert.ok(reconciliation.args.includes('--conditions=react-server'));
  assert.ok(reconciliation.args.includes('--experimental-transform-types'));
  const web = children.find(entry => entry.args.includes('/next/bin/next'));
  processFixture.emit('SIGTERM');
  assert.deepEqual(reconciliation.child.signals, ['SIGTERM']);
  assert.deepEqual(web.child.signals, ['SIGTERM']);
  web.child.emit('exit', 0);
  await Promise.resolve();
  assert.deepEqual(exits, [], 'web exit must wait for the payment worker');
  reconciliation.child.emit('exit', 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(exits, [0]);
});
