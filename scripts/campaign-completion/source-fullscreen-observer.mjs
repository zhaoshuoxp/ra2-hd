// Read-only source-action observation. The temporary ordinary pause gate below
// belongs to validation; it never alters the movie's campaign pause flag.
export async function observeSourceFullscreen(page) {
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, c = g.campaign, submit = c.uiAction;
        window.__sourceFullscreenAudit = [];
        c.uiAction = action => {
            const result = submit(action);
            if ([10, 117].includes(action.opcode)) queueMicrotask(() => {
                const placement = action.opcode === 10 ? 'fullscreen' : 'transmission-paused';
                const video = document.querySelector(action.opcode === 10
                    ? '[data-campaign-media][style*="position: fixed"] video' : '[data-sidebar-radar] [data-campaign-media] video');
                if (!video) throw Error('Original paused movie action did not create its decoder at the source placement');
                const entry = { action: { ...action }, placement, tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(),
                    sourceTrace: c.trace.slice(-20), pending: c.captureMedia().movies };
                window.__sourceFullscreenAudit.push(entry);
                let observed = false;
                video.addEventListener('timeupdate', () => {
                    if (observed || video.currentTime < .7) return;
                    observed = true;
                    const manager = d.gameScreen.gameTurnMgr, wasPaused = manager.paused;
                    const before = { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot() };
                    manager.setPaused(false);
                    try { for (let i = 0; i < 100; i++) manager.doGameTurn(performance.now()); }
                    finally { manager.setPaused(wasPaused); }
                    entry.playback = { time: video.currentTime, duration: video.duration,
                        size: [video.videoWidth, video.videoHeight], volume: video.volume,
                        objectFit: getComputedStyle(video).objectFit, before,
                        after: { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot() },
                        worldInputEnabled: d.gameScreen.playerUi.worldInteraction.isEnabled(),
                        campaignPaused: manager.campaignPaused,
                        subtitle: document.querySelector('[data-campaign-movie-subtitle]')?.textContent,
                        music: d.music?.getPlaybackState() };
                    console.log('[original-paused-movie-proof] decoded-and-paused ' + placement);
                });
                video.addEventListener('ended', () => {
                    entry.ended = { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), outcomes: [...c.movieOutcomes] };
                }, { once: true });
            });
            return result;
        };
    });
}
