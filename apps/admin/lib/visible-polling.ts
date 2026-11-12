export function pollWhileVisible(
  task: (signal: AbortSignal) => Promise<void>,
  intervalMs: number,
  { immediate = true } = {},
): () => void {
  let timer: number | undefined;
  let activeRequest: AbortController | undefined;

  function pause() {
    window.clearTimeout(timer);
    timer = undefined;
    activeRequest?.abort();
    activeRequest = undefined;
  }

  function schedule() {
    timer = window.setTimeout(run, intervalMs);
  }

  async function run() {
    timer = undefined;
    if (document.visibilityState !== "visible" || activeRequest) return;

    const request = new AbortController();
    activeRequest = request;
    try {
      await task(request.signal);
    } finally {
      if (activeRequest === request) {
        activeRequest = undefined;
        schedule();
      }
    }
  }

  function onVisibilityChange() {
    pause();
    if (document.visibilityState === "visible") void run();
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  if (document.visibilityState === "visible") {
    if (immediate) void run();
    else schedule();
  }

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    pause();
  };
}
