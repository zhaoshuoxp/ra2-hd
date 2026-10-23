// Optional local readout; observes frames/ticks without changing game state or input queues.
export function installFrameStats(): void {
    const panel = document.createElement('output');
    panel.id = 'offline-frame-stats';
    panel.setAttribute('aria-live', 'off');
    panel.title = 'FPS: browser animation frames. Ticks/s: simulation updates. Frame p95: 95th percentile frame interval. These are not network or click-to-photon latency.';
    panel.style.cssText = 'position:fixed;top:8px;left:8px;z-index:100000;pointer-events:none;background:#101820df;color:#fff;padding:6px 10px;border-radius:4px;font:14px/1.4 monospace';
    document.body.append(panel);
    let lastFrame: number | undefined;
    let started = performance.now();
    let game: any;
    let tick = 0;
    let intervals: number[] = [];
    let raf: number;
    const sample = (now: number) => {
        const current = (window as any).__ra2debug?.game;
        if (current !== game) {
            game = current;
            tick = game?.currentTick ?? 0;
            started = now;
            intervals = [];
            lastFrame = undefined;
        }
        if (lastFrame !== undefined) intervals.push(now - lastFrame);
        lastFrame = now;
        if (now - started >= 1000 && intervals.length) {
            const elapsed = now - started;
            const fps = intervals.length * 1000 / elapsed;
            const tps = game?.status === 1 ? (game.currentTick - tick) * 1000 / elapsed : 0;
            intervals.sort((a, b) => a - b);
            const p95 = intervals[Math.floor(intervals.length * 0.95)];
            panel.textContent = `${fps.toFixed(0)} FPS · ${tps.toFixed(0)} ticks/s · p95 ${p95.toFixed(0)} ms`;
            tick = game?.currentTick ?? 0;
            started = now;
            intervals = [];
        }
        raf = requestAnimationFrame(sample);
    };
    panel.textContent = 'Measuring frame rate…';
    raf = requestAnimationFrame(sample);
    addEventListener('visibilitychange', () => {
        lastFrame = undefined;
        started = performance.now();
        tick = game?.currentTick ?? 0;
        intervals = [];
    });
    addEventListener('pagehide', () => cancelAnimationFrame(raf), { once: true });
}
