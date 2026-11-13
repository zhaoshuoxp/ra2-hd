export const measurementContract = Object.freeze({
    schema: 'm4-frame-contract-v1', seconds: 120, targetFps: 60, frameBudgetMs: 1000 / 60,
    cadenceToleranceMs: 0.35, perSecondToleranceFps: 0.5, longStallMs: 50,
    onePercentLow: '1000 / arithmetic mean of slowest ceil(0.01 * N) intervals',
    quantiles: 'Nearest rank; every positive interval retained, including first-use and stalls.',
    validity: 'Foreground throughout; live seven AI; same production runtime/resources/settings/scenario.',
    gate: 'At least 99% elapsed interval time within 17.0167ms; no two consecutive complete bins below 59.5 callbacks/s; simulation >=99% nominal.',
    presentation: 'rAF callback cadence is not an independently measured screen-present counter.',
    caches: 'Fresh process/profile is cold application cache; OS/driver caches are not flushed.',
});

export function distribution(values) {
    if (!values.length) return { n: 0 };
    const sorted = values.slice().sort((a, b) => a - b), sum = values.reduce((a, b) => a + b, 0);
    const q = p => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
    return { n: values.length, mean: sum / values.length, p50: q(.5), p95: q(.95), p99: q(.99), max: sorted.at(-1) };
}

export function summarizeFrames(raw, contract = measurementContract) {
    const { intervals, timestamps, ticks, durationMs, nominalTickMs } = raw;
    const sum = intervals.reduce((a, b) => a + b, 0), slow = intervals.slice().sort((a, b) => b - a);
    const slowest = slow.slice(0, Math.max(1, Math.ceil(slow.length * .01)));
    const perSecond = Array.from({ length: Math.floor(durationMs / 1000) }, (_, i) => ({ second: i, callbacks: 0 }));
    for (const t of timestamps) if (perSecond[Math.floor(t / 1000)]) perSecond[Math.floor(t / 1000)].callbacks++;
    const segments = [], longStalls = [];
    let start;
    perSecond.forEach(({ second, callbacks }, i) => {
        if (callbacks < contract.targetFps - contract.perSecondToleranceFps && start === undefined) start = second;
        if (start !== undefined && (callbacks >= contract.targetFps - contract.perSecondToleranceFps || i === perSecond.length - 1)) {
            const end = callbacks < contract.targetFps - contract.perSecondToleranceFps ? second + 1 : second;
            segments.push({ startSecond: start, endSecond: end, seconds: end - start }); start = undefined;
        }
    });
    intervals.forEach((ms, i) => { if (ms >= contract.longStallMs) longStalls.push({ atMs: timestamps[i], ms, tick: ticks[i] }); });
    const timeAbove = budget => intervals.reduce((sum, dt) => sum + (dt > budget ? dt : 0), 0) / sum;
    const below60TimeFraction = timeAbove(contract.frameBudgetMs);
    const belowCadenceTimeFraction = timeAbove(contract.frameBudgetMs + contract.cadenceToleranceMs);
    const ticksAdvanced = ticks.at(-1) - raw.startTick, nominalTicks = durationMs / nominalTickMs;
    const simulationRatio = ticksAdvanced / nominalTicks;
    return { callbackFps: intervals.length * 1000 / sum, onePercentLow: 1000 / (slowest.reduce((a, b) => a + b, 0) / slowest.length),
        frameMs: distribution(intervals), perSecond, below60TimeFraction, belowCadenceTimeFraction,
        continuousLowBins: segments, longStalls, ticksAdvanced, nominalTicks, simulationRatio,
        ticksPerSecond: ticksAdvanced * 1000 / durationMs, elapsedTickDeficit: nominalTicks - ticksAdvanced,
        cpuUpdateMs: distribution(raw.updateMs), cpuRenderSubmissionMs: distribution(raw.renderMs),
        cpuSimulationMs: distribution(raw.simulationMs), callbackWorkMs: distribution(raw.workMs),
        callbackGate: belowCadenceTimeFraction <= .01 && !segments.some(s => s.seconds >= 2) && simulationRatio >= .99,
        screenPresentation: 'UNAVAILABLE', gpuTime: 'UNAVAILABLE', actualVram: 'UNAVAILABLE' };
}
