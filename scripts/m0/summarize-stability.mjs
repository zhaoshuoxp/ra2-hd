import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '.artifacts/m0-2';
const stats = values => {
    if (!values.length) return { count: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    return { count: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
        p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1) };
};
const summaries = [];
for (const dir of fs.readdirSync(root)) {
    const file = path.join(root, dir, 'result.json');
    if (!fs.existsSync(file)) continue;
    const r = JSON.parse(fs.readFileSync(file)), m = r.measurement;
    const s = { run: dir, source: r.source, fixture: r.fixture, browser: r.browser,
        harnessError: r.harnessError, scenarioError: r.scenarioError, runtimeErrors: r.errors.length,
        consoleErrors: r.console.filter(e => e.type === 'error'), external: r.external.length,
        websockets: r.websockets.length, workers: r.workers.length, final: r.final,
        initialTick: r.initial?.tick, aircraft: r.aircraft?.production, environment: r.environment };
    if (m) {
        const frames = m.frames, intervals = frames.map(f => f.interval);
        s.frames = stats(intervals);
        s.frames.fps = 1000 / s.frames.mean;
        s.frames.hidden = frames.filter(f => f.hidden).length;
        s.thresholds = [33.3, 50].map(ms => ({ ms, budgetMultiple: ms / (1000 / 60),
            count: intervals.filter(v => v > ms).length, rate: intervals.filter(v => v > ms).length / intervals.length }));
        s.cpu = Object.fromEntries(['simulation', 'update', 'render'].map(label =>
            [label, stats(m.spans.filter(e => e.label === label).map(e => e.end - e.start))]));
        s.longFrames = frames.filter(f => f.interval > 33.3).map(f => {
            const overlaps = m.spans.filter(e => e.start < f.end && e.end > f.start);
            const cpuMs = Object.fromEntries(['simulation', 'update', 'render'].map(label => [label,
                overlaps.filter(e => e.label === label).reduce((n, e) => n + Math.min(e.end, f.end) - Math.max(e.start, f.start), 0)]));
            return { ...f, cpuMs, spans: overlaps, longTasks: m.longTasks.filter(e => e.start < f.end && e.start + e.duration > f.start) };
        });
        s.input = { events: m.inputs, commands: m.commands, responses: m.responses,
            queueMs: stats(m.commands.filter(c => c.apply !== undefined).map(c => c.apply - c.enqueue)),
            domReceiptToApplyMs: stats(m.commands.filter(c => c.apply !== undefined && c.inputIndex !== undefined)
                .map(c => c.apply - m.inputs[c.inputIndex].receipt)),
            visualMs: stats(m.responses.map(v => v.firstObservedRenderablePositionChange - v.issued)),
            endpointLimit: 'Browser-delivered synthetic input; visual endpoint observes renderable position, not GPU completion or photons.' };
        s.input.temporalAssociations = m.commands.filter(c => !c.scripted && c.apply !== undefined).flatMap(c => {
            const e = m.inputs.filter(e => e.type === 'mouseup' && e.receipt <= c.enqueue && c.enqueue - e.receipt < 100).at(-1);
            return e ? [{ receipt: e.receipt, enqueue: c.enqueue, apply: c.apply, receiptToEnqueue: c.enqueue - e.receipt,
                receiptToApply: c.apply - e.receipt, note: 'Closest preceding mouseup within 100 ms; temporal association, not a propagated event ID.' }] : [];
        });
        s.tickRate = (r.final.tick - m.startTick) / ((r.final.now - m.start) / 1000);
    }
    summaries.push(s);
}
fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(summaries, null, 2));
console.log(JSON.stringify(summaries.map(({ run, frames, thresholds, cpu, input, runtimeErrors, consoleErrors,
    tickRate, scenarioError, final }) => ({ run, frames, thresholds, cpu, queue: input?.queueMs,
        receiptToApply: input?.domReceiptToApplyMs, visual: input?.visualMs, runtimeErrors,
        consoleErrors: consoleErrors.map(e => e.text.slice(0, 200)), tickRate, scenarioError,
        final: final && { tick: final.tick, elapsedMs: final.elapsedMs, end: final.end, defeated: final.players.map(p => p.defeated) } })), null, 2));
