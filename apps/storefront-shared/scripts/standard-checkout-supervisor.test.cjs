const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
let superviseStandardCheckoutWorker;
try { ({ superviseStandardCheckoutWorker } = require('./standard-checkout-supervisor.cjs')); } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

function fixture() {
  const children = [], timers = new Map(), logs = [];
  let serial = 0;
  return { children, timers, logs,
    spawn() { const child = new EventEmitter(); child.signals = []; child.kill = signal => child.signals.push(signal); children.push(child); return child; },
    schedule(fn, delay) { const id = ++serial; timers.set(id, { fn, delay }); return id; },
    cancel(id) { timers.delete(id); }, log(value) { logs.push(value); },
    fire(delay) { const entry = [...timers].find(([, timer]) => timer.delay === delay); assert.ok(entry, `timer ${delay} scheduled`); timers.delete(entry[0]); entry[1].fn(); },
  };
}

test('one bounded worker runs at a time and successful completion schedules another run after 60 seconds', () => {
  assert.equal(typeof superviseStandardCheckoutWorker, 'function', 'automatic reconciliation supervisor must exist');
  const f = fixture(), worker = superviseStandardCheckoutWorker(f);
  assert.equal(f.children.length, 1);
  assert.deepEqual([...f.timers.values()].map(timer => timer.delay), [75000]);
  f.children[0].emit('exit', 0);
  assert.deepEqual([...f.timers.values()].map(timer => timer.delay), [60000]);
  f.fire(60000);
  assert.equal(f.children.length, 2);
  worker.stop();
  f.children[1].emit('exit', 0);
});

test('failed child schedules one retry and does not print private exception details', () => {
  assert.equal(typeof superviseStandardCheckoutWorker, 'function');
  const f = fixture(), worker = superviseStandardCheckoutWorker(f);
  f.children[0].emit('error', new Error('private credentials'));
  f.children[0].emit('exit', 1);
  assert.deepEqual([...f.timers.values()].map(timer => timer.delay), [60000]);
  assert.deepEqual(f.logs, ['standard_checkout_worker_degraded']);
  worker.stop();
  assert.equal(f.timers.size, 0);
});

test('a hanging child is stopped before another worker can run', () => {
  assert.equal(typeof superviseStandardCheckoutWorker, 'function');
  const f = fixture(), worker = superviseStandardCheckoutWorker(f);
  f.fire(75000);
  assert.deepEqual(f.children[0].signals, ['SIGTERM']);
  assert.equal(f.children.length, 1);
  f.fire(5000);
  assert.deepEqual(f.children[0].signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(f.children.length, 1);
  f.children[0].emit('exit', null, 'SIGKILL');
  assert.deepEqual([...f.timers.values()].map(timer => timer.delay), [60000]);
  worker.stop();
});

test('shutdown waits for the active worker and never starts another one', async () => {
  assert.equal(typeof superviseStandardCheckoutWorker, 'function');
  const f = fixture(), worker = superviseStandardCheckoutWorker(f);
  let resolved = false;
  const stopped = worker.stop('SIGINT').then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.deepEqual(f.children[0].signals, ['SIGINT']);
  f.children[0].emit('exit', 0);
  await stopped;
  assert.equal(resolved, true);
  assert.equal(f.timers.size, 0);
  assert.equal(f.children.length, 1);
});

test('spawn failure is retried after 60 seconds and a stopped supervisor cancels that retry', async () => {
  assert.equal(typeof superviseStandardCheckoutWorker, 'function');
  const f = fixture(); f.spawn = () => { throw new Error('private path'); };
  const worker = superviseStandardCheckoutWorker(f);
  assert.deepEqual([...f.timers.values()].map(timer => timer.delay), [60000]);
  await worker.stop();
  assert.equal(f.timers.size, 0);
});
