// Observe real source-triggered playback without changing clocks, media or orders.
export async function observeMissionMedia(page) {
    await page.evaluate(() => {
        if (window.__yrMissionMediaAudit) throw Error('A mission media observer is already active');
        const audit = window.__yrMissionMediaAudit = { clips: [], urls: [], errors: [] };
        const attached = new WeakSet(), players = new Set(), cleanups = [];
        const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
        const createObserved = function(blob) {
            const url = create.call(URL, blob);
            if (blob.type === 'video/webm') audit.urls.push({ url, bytes: blob.size, revoked: false });
            return url;
        };
        const revokeObserved = function(url) {
            const row = audit.urls.find(row => row.url === url);
            if (row) row.revoked = true;
            return revoke.call(URL, url);
        };
        URL.createObjectURL = createObserved; URL.revokeObjectURL = revokeObserved;
        const clock = () => {
            const d = window.__ra2debug;
            return { tick: d.game?.currentTick ?? null, wallTime: performance.now(),
                mission: d.game?.campaign?.launch.mission ?? null };
        };
        const bounds = element => {
            if (!element) return null;
            const r = element.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        const attach = () => {
            const d = window.__ra2debug;
            for (const video of document.querySelectorAll('[data-campaign-media] video')) {
                if (attached.has(video)) continue;
                attached.add(video);
                const candidates = [d.gameScreen?.campaignMediaPlayer,
                    ...[...(d.mainMenuController?.screens?.values() ?? [])].map(screen => screen.media)].filter(Boolean);
                const player = candidates.find(player => player.current?.video === video);
                if (!player) { audit.errors.push('A displayed campaign video has no matching player'); continue; }
                players.add(player);
                const request = player.current.request, holder = video.closest('[data-campaign-media]');
                const subtitle = [...document.querySelectorAll('[data-campaign-movie-subtitle]')]
                    .find(element => element.dataset.campaignMovieSubtitle === request.id);
                const cues = request.subtitles ?? [];
                const row = { id: request.id, placement: request.placement, url: request.url,
                    start: clock(), startTime: video.currentTime, requestedStartTime: request.startTime ?? 0,
                    cueCount: cues.length, seenCues: [],
                    mismatches: [], seeks: 0, rates: [], minimumVolume: 1, maximumVolume: 0,
                    tickRange: [], radarSamples: [], ended: null, removed: null, decoderError: null };
                audit.clips.push(row);
                let stopped = false, lastRadarTick, animationFrame;
                const sample = () => {
                    if (stopped) return;
                    const time = video.currentTime, now = clock();
                    row.last = { ...now, time };
                    row.minimumVolume = Math.min(row.minimumVolume, video.volume);
                    row.maximumVolume = Math.max(row.maximumVolume, video.volume);
                    if (!row.rates.includes(video.playbackRate)) row.rates.push(video.playbackRate);
                    if (now.tick !== null) row.tickRange = row.tickRange.length
                        ? [Math.min(row.tickRange[0], now.tick), Math.max(row.tickRange[1], now.tick)] : [now.tick, now.tick];
                    if (time > .1) row.musicDuring ??= d.music?.getPlaybackState();
                    for (const [index, cue] of cues.entries()) if (video.readyState >= 2
                        && time >= Math.max(.03, request.startTime ?? 0, cue.start) && time < cue.end) {
                        const actual = subtitle?.textContent.trim() ?? '';
                        if (actual === cue.text.trim() && !row.seenCues.some(seen => seen.index === index))
                            row.seenCues.push({ index, time, text: actual });
                        else if (time > cue.start+.15 && time < cue.end-.15 && actual !== cue.text.trim()
                            && !row.mismatches.some(mismatch => mismatch.index === index))
                            row.mismatches.push({ index, time, expected: cue.text, actual });
                    }
                    if (request.placement !== 'fullscreen' && lastRadarTick !== now.tick) {
                        lastRadarTick = now.tick;
                        const radar = d.gameScreen?.hud?.getCampaignRadarHost();
                        row.radarSamples.push({ tick: now.tick, attachedToCurrentRadar: holder.parentElement === radar,
                            holder: bounds(holder), radar: bounds(radar) });
                    }
                };
                const seeking = () => { if (!stopped) row.seeks++; };
                const ended = () => {
                    sample();
                    const quality = video.getVideoPlaybackQuality();
                    row.ended = { ...clock(), time: video.currentTime, duration: video.duration, ended: video.ended,
                        dimensions: [video.videoWidth, video.videoHeight], totalVideoFrames: quality.totalVideoFrames,
                        droppedVideoFrames: quality.droppedVideoFrames, volume: video.volume, muted: video.muted };
                };
                const error = () => { row.decoderError = video.error?.message ?? 'Unknown decoder error'; };
                video.addEventListener('seeking', seeking, true);
                video.addEventListener('ended', ended, true);
                video.addEventListener('error', error, true);
                const frame = () => {
                    if (!video.isConnected) { row.removed = clock(); stopped = true; return; }
                    sample(); animationFrame = requestAnimationFrame(frame);
                };
                frame();
                cleanups.push(() => {
                    stopped = true; cancelAnimationFrame(animationFrame);
                    video.removeEventListener('seeking', seeking, true);
                    video.removeEventListener('ended', ended, true);
                    video.removeEventListener('error', error, true);
                });
            }
        };
        const observer = new MutationObserver(attach);
        observer.observe(document.body, { childList: true, subtree: true }); attach();
        audit.stop = () => {
            observer.disconnect(); cleanups.forEach(cleanup => cleanup());
            audit.outcomes = [...players].flatMap(player => player.outcomes);
            audit.pending = [...players].flatMap(player => player.pending);
            audit.remainingHolders = document.querySelectorAll('[data-campaign-media]').length;
            audit.remainingSubtitles = document.querySelectorAll('[data-campaign-movie-subtitle]').length;
            if (URL.createObjectURL === createObserved) URL.createObjectURL = create;
            if (URL.revokeObjectURL === revokeObserved) URL.revokeObjectURL = revoke;
        };
    });
    return async () => page.evaluate(() => {
        const audit = window.__yrMissionMediaAudit;
        audit.stop(); delete audit.stop; delete window.__yrMissionMediaAudit;
        return audit;
    });
}
