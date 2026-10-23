import { canonicalAlliedBuildingHdFamily } from './alliedBuildingHdFamilies';
import type { Production } from '@/game/player/production/Production';

export const constructionYardForMcv: Readonly<Record<string, string>> = { MCV: 'GACNST', AMCV: 'GACNST', SMCV: 'NACNST', PCV: 'YACNST' };

// Preparation is observational: native queues, credits and completion ticks
// remain unchanged. Leases cancel with orders or transfer to real renderers.
export function productionHdPrewarm(productions: Production[], warm: (identity: string) => () => void): () => void {
    const subscriptions = productions.map(production => {
        const leases = new Map<string, () => void>();
        const pending = new Set<() => void>();
        const releaseAfterRender = (release: () => void) => {
            let frame: number | undefined, timer: ReturnType<typeof setTimeout> | undefined;
            const finish = () => {
                if (!pending.delete(finish)) return;
                if (frame !== undefined) cancelAnimationFrame(frame);
                clearTimeout(timer); release();
            };
            pending.add(finish);
            // Queue completion precedes render-queue creation. Keep the warm
            // allocation through that frame so another load cannot evict it.
            if (typeof requestAnimationFrame === 'function') {
                frame = requestAnimationFrame(() => { frame = requestAnimationFrame(finish); });
                timer = setTimeout(finish, 250);
            } else finish();
        };
        const update = () => {
            const queued = new Set(production.getAllQueues().flatMap(queue => queue.getAll().flatMap(item => {
                return [item.rules.name, constructionYardForMcv[item.rules.name], item.rules.freeUnit]
                    .filter((name): name is string => !!name).map(canonicalAlliedBuildingHdFamily);
            })));
            for (const [name, release] of leases) if (!queued.has(name)) { releaseAfterRender(release); leases.delete(name); }
            for (const name of queued) if (!leases.has(name)) leases.set(name, warm(name));
        };
        production.onQueueUpdate.subscribe(update);
        update();
        return () => {
            production.onQueueUpdate.unsubscribe(update);
            leases.forEach(release => release());
            leases.clear();
            pending.forEach(finish => finish());
        };
    });
    return () => subscriptions.forEach(dispose => dispose());
}
