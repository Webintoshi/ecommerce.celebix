import type { AnalyticsActiveVisitors } from "@celebix/saas-contracts";

type Timer = ReturnType<typeof setTimeout> | number;

export function createActiveVisitorPoller(
  options: Readonly<{
    visible(): boolean;
    now(): Date;
    load(signal: AbortSignal): Promise<AnalyticsActiveVisitors>;
    publish(value: AnalyticsActiveVisitors): void;
    schedule(callback: () => void, milliseconds: number): Timer;
    cancel(timer: Timer): void;
  }>,
) {
  let disposed = false;
  let generation = 0;
  let timer: Timer | undefined;
  let controller: AbortController | undefined;

  const clear = () => {
    if (timer !== undefined) options.cancel(timer);
    timer = undefined;
    controller?.abort();
    controller = undefined;
  };
  const queue = (selectedGeneration: number) => {
    if (disposed || selectedGeneration !== generation || !options.visible())
      return;
    timer = options.schedule(() => {
      timer = undefined;
      void load(selectedGeneration);
    }, 30_000);
  };
  const load = async (selectedGeneration: number) => {
    if (disposed || selectedGeneration !== generation || !options.visible())
      return;
    const selected = new AbortController();
    controller = selected;
    try {
      const value = await options.load(selected.signal);
      if (
        !disposed &&
        selectedGeneration === generation &&
        !selected.signal.aborted
      )
        options.publish(value);
    } catch {
      if (
        !disposed &&
        selectedGeneration === generation &&
        !selected.signal.aborted
      )
        options.publish(
          Object.freeze({
            schemaVersion: 1,
            status: "unavailable",
            activeVisitors: null,
            asOf: options.now().toISOString(),
          }),
        );
    } finally {
      if (controller === selected) controller = undefined;
      queue(selectedGeneration);
    }
  };
  const restart = () => {
    generation += 1;
    clear();
    if (options.visible()) void load(generation);
  };
  return Object.freeze({
    start: restart,
    visibilityChanged: restart,
    dispose() {
      disposed = true;
      generation += 1;
      clear();
    },
  });
}
