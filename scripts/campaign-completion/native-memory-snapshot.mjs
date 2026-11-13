import os from 'node:os';

// Read-only observations. Resident process totals may include shared pages;
// they do not certify a run on the target physical-memory configuration.
export async function nativeMemorySnapshot(app, page) {
    const processes = await app.evaluate(({ app }) => app.getAppMetrics().map(metric => ({
        type: metric.type, name: metric.name, pid: metric.pid, memoryKiB: metric.memory,
    })));
    const renderer = await page.evaluate(() => {
        const d = window.__ra2debug, graphics = d.generalOptions.graphics;
        const actors = d.worldView?.sovietUnitsHd?.report, terrain = d.worldView?.theater?.terrainHd?.report;
        return { density: graphics.hdDensity.value, enabled: graphics.hdEnabled.value,
            jsHeap: performance.memory && { usedBytes: performance.memory.usedJSHeapSize,
                totalBytes: performance.memory.totalJSHeapSize, limitBytes: performance.memory.jsHeapSizeLimit },
            actors: actors && { bytes: actors.gpuBytes, peakBytes: actors.peakBytes, limitBytes: actors.budget,
                statusCounts: Object.values(actors.families).reduce((counts, family) =>
                    (counts[family.status] = (counts[family.status] ?? 0) + 1, counts), {}),
                readyBudgetFallbacks: Object.entries(actors.families).filter(([, family]) => family.status === 'READY'
                    && family.density < graphics.hdDensity.value
                    && family.attempts?.some(attempt => /budget/.test(attempt.reason))),
                failedFamilies: Object.entries(actors.families).filter(([, family]) => family.status === 'FAILED') },
            terrain, environment: d.environmentHd && { bytes: d.environmentHd.gpuBytes, disposed: d.environmentHd.disposed } };
    });
    return { platform: process.platform, hostPhysicalBytes: os.totalmem(), targetPhysicalGiB: renderer.density === 2 ? 8 : 16,
        observation: 'Process working sets, renderer heap and owned HD allocations at this boundary. Shared pages may be counted twice; this is not a target-memory hardware or pressure test.',
        processes, renderer };
}
