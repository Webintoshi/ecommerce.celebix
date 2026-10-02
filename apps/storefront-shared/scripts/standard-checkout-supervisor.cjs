function superviseStandardCheckoutWorker({ spawn, schedule = setTimeout, cancel = clearTimeout, log = console.error }) {
  let child, timer, deadline, forceStop, stopped = false, finishStop;
  let stopping;
  const clear = () => {
    for (const id of [timer, deadline, forceStop]) if (id !== undefined) cancel(id);
    timer = deadline = forceStop = undefined;
  };
  const terminate = (signal) => {
    if (!child) return;
    child.kill(signal);
    forceStop = schedule(() => { forceStop = undefined; child?.kill('SIGKILL'); }, 5000);
  };
  function start() {
    if (stopped || child) return;
    timer = undefined;
    let settled = false, degraded = false;
    const fail = () => { if (!degraded) { degraded = true; log('standard_checkout_worker_degraded'); } };
    const complete = (code) => {
      if (settled) return;
      settled = true;
      if (code !== 0 && !stopped) fail();
      clear(); child = undefined;
      if (stopped) finishStop?.();
      else timer = schedule(start, 60000);
    };
    try {
      child = spawn();
      child.once('error', () => { fail(); if (!child?.pid) complete(1); });
      child.once('exit', complete);
      deadline = schedule(() => {
        deadline = undefined;
        log('standard_checkout_worker_timeout');
        terminate('SIGTERM');
      }, 75000);
    } catch { fail(); complete(1); }
  }
  start();
  return { stop(signal = 'SIGTERM') {
    if (stopping) return stopping;
    stopped = true;
    clear();
    stopping = new Promise(resolve => { finishStop = resolve; if (!child) resolve(); else terminate(signal); });
    return stopping;
  } };
}
module.exports = { superviseStandardCheckoutWorker };
