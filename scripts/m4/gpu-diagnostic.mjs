// Separate diagnostic only: asynchronous native GPU queries around render submission.
export function installGpuDiagnostic() {
    const renderer = window.__ra2debug.renderer, g = window.__ra2debug.game;
    const gl = renderer.renderer.getContext(), extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!extension) { window.__m4Gpu = { finish: async () => ({ status: 'UNAVAILABLE' }) }; return; }
    const original = renderer.render, pending = [], samples = [], started = performance.now();
    let omitted = 0, peakPending = 0;
    const poll = () => {
        const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
        for (let i = pending.length - 1; i >= 0; i--) {
            const entry = pending[i]; entry.disjoint ||= disjoint;
            if (!gl.getQueryParameter(entry.query, gl.QUERY_RESULT_AVAILABLE)) continue;
            const ms = gl.getQueryParameter(entry.query, gl.QUERY_RESULT) / 1000000;
            samples.push({ atMs: entry.atMs, tick: entry.tick, ms, disjoint: entry.disjoint });
            gl.deleteQuery(entry.query); pending.splice(i, 1);
        }
    };
    renderer.render = function(...args) {
        poll();
        if (pending.length >= 8) { omitted++; return original.apply(this, args); }
        const query = gl.createQuery(), entry = { query, tick: g.currentTick,
            atMs: performance.now() - started, disjoint: !!gl.getParameter(extension.GPU_DISJOINT_EXT) };
        gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
        try { return original.apply(this, args); }
        finally {
            gl.endQuery(extension.TIME_ELAPSED_EXT); pending.push(entry);
            peakPending = Math.max(peakPending, pending.length);
        }
    };
    window.__m4Gpu = { async finish() {
        renderer.render = original;
        const deadline = performance.now() + 2000;
        while (pending.length && performance.now() < deadline) {
            poll(); if (pending.length) await new Promise(resolve => setTimeout(resolve, 10));
        }
        for (const entry of pending) gl.deleteQuery(entry.query);
        const windowMs = performance.now() - started, totalReportedMs = samples.reduce((sum, sample) => sum + sample.ms, 0);
        const reliable = !pending.length && !samples.some(sample => sample.disjoint || sample.ms <= 0)
            && totalReportedMs <= windowMs * 1.05;
        return { status: pending.length ? 'INCOMPLETE' : reliable ? 'CAPTURED' : 'CAPTURED_UNRELIABLE',
            samples, unresolved: pending.length, omitted, peakPending, windowMs, totalReportedMs, reliable,
            validation: 'Disjoint/zero checks and aggregate non-overlapping elapsed time must fit the observed query window within 5%. Failed checks leave GPU work unavailable; all raw samples remain.',
            scope: 'GPU render elapsed queries in a separate live-game diagnostic. CPU query/poll overhead is included in diagnostic callback samples; these FPS values are not formal acceptance.' };
    } };
}
