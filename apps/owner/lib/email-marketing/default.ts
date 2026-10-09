import { resolveEmailMarketingWorkerMode, parseEmailMarketingWorkerConfig } from './config.ts';
import { initializeEmailMarketingProductionRuntime } from './production.ts';
export async function startDefaultEmailMarketingProductionWorker(): Promise<Readonly<{
    stop(): Promise<void>;
}>> {
    if (resolveEmailMarketingWorkerMode(process.env) === 'off')
        return Object.freeze({ async stop() { } });
    const runtime = await initializeEmailMarketingProductionRuntime(parseEmailMarketingWorkerConfig(process.env));
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, active: Promise<void> | undefined;
    const run = async () => { try {
        await runtime.runOnce();
    }
    catch {
        console.error('email_marketing_worker_run_failed');
    } if (!stopped)
        timer = setTimeout(() => { active = run(); }, 5000); };
    active = run();
    return Object.freeze({ async stop() { stopped = true; if (timer)
            clearTimeout(timer); await active; await runtime.close(); } });
}
