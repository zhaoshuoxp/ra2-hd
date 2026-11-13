import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, returnCampaignHome, root } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]);
const language = process.argv.find(value => value.startsWith('--language='))?.slice(11) ?? 'en-US';
assert(['en-US', 'zh-CN', 'zh-TW'].includes(language));
const catalog = JSON.parse(await fs.readFile('.local/media/movie-library-v51/catalog.json'));
const bound = JSON.parse(await fs.readFile('scripts/yr-campaign/subtitles/missions-en.json'));
const movies = catalog.entries.filter(movie => movie.edition === 'yr'
    && (Object.hasOwn(bound, movie.id) || movie.role === 'introduction'))
    .sort((a, b) => a.durationSeconds - b.durationSeconds || a.id.localeCompare(b.id));
assert.equal(movies.length, 50);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], language, clips: [],
    scope: 'Public YR movie-library controls play all 49 source-bound cuts and the original introduction at natural speed through their actual end events. DOM captions, actual decoder frames, audio volume, music state, source identities, streaming routes and decoder release are observed. This is library playback evidence; mission-event timing and mission opening order require their separate source-event checks.' };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    ({ app, page, labels } = await campaignSession(out, report, { edition: 'yr', density: 0 }));
    await page.evaluate(() => localStorage.setItem('_edition:yr:ra2hd.hdMovies.v1', '0'));
    await returnCampaignHome(page, labels);
    if (await page.evaluate(() => document.documentElement.lang) !== language) {
        await page.evaluate(language => localStorage.setItem('ra2hd.interfaceLanguage', language), language);
        await page.reload();
        if (await page.locator('[data-edition=yr]').count()) await page.locator('[data-edition=yr]').click();
        await page.waitForFunction(language => document.documentElement.lang === language
            && !!window.__ra2debug?.mainMenuController, language, { timeout: 90000 });
        labels = { ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-yr-${language}.json`))).labels,
            ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`))) };
        if (await page.locator('[data-campaign-selection]').count()) await returnCampaignHome(page, labels);
    }
    await page.getByRole('button', { name: labels['hd:menumovies'], exact: true }).click();
    await page.waitForSelector('[data-movie-library-ready=true]');
    assert.equal(await page.locator('[data-movie-id]').count(), 56);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        const audit = window.__yrLibraryAudit = { clips: [], urls: [], errors: [], expected: undefined };
        const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
        URL.createObjectURL = blob => {
            const url = create(blob);
            if (blob.type === 'video/webm') audit.urls.push({ url, bytes: blob.size, revoked: false });
            return url;
        };
        URL.revokeObjectURL = url => {
            const row = audit.urls.find(row => row.url === url);
            if (row) row.revoked = true;
            revoke(url);
        };
        const attached = new WeakSet();
        const attach = () => {
            for (const video of document.querySelectorAll('[data-campaign-media] video')) {
                if (attached.has(video)) continue;
                attached.add(video);
                const player = d.mainMenuController.screens.get(25).media, current = player.current;
                if (current?.video !== video) { audit.errors.push('Unexpected library video binding'); continue; }
                const id = video.closest('[data-campaign-media]').dataset.campaignMedia;
                const subtitle = document.querySelector(`[data-campaign-movie-subtitle="${id}"]`);
                const cues = current.request.subtitles ?? [];
                const row = { id, expected: audit.expected, startTime: video.currentTime, seeks: 0,
                    rates: [], cueCount: cues.length, seen: [], mismatches: [], ended: undefined,
                    musicDuring: undefined, minimumVolume: 1, maximumVolume: 0, backwards: 0 };
                audit.clips.push(row);
                let lastTime = 0, stopped = false;
                const sample = () => {
                    if (stopped || !video.isConnected) return;
                    const time = video.currentTime;
                    if (time + .02 < lastTime) row.backwards++;
                    lastTime = Math.max(time, lastTime);
                    if (!row.rates.includes(video.playbackRate)) row.rates.push(video.playbackRate);
                    row.minimumVolume = Math.min(row.minimumVolume, video.volume);
                    row.maximumVolume = Math.max(row.maximumVolume, video.volume);
                    row.musicDuring ??= time > .1 ? d.music.getPlaybackState() : undefined;
                    for (const [index, cue] of cues.entries()) if (time >= cue.start && time < cue.end) {
                        const actual = subtitle?.textContent.trim() ?? '';
                        if (actual === cue.text.trim() && !row.seen.some(seen => seen.index === index))
                            row.seen.push({ index, time, start: cue.start, end: cue.end, text: actual });
                        else if (time > cue.start + .15 && time < cue.end - .15 && actual !== cue.text.trim())
                            row.mismatches.push({ index, time, expected: cue.text, actual });
                    }
                };
                const observer = new MutationObserver(sample);
                if (subtitle) observer.observe(subtitle, { childList: true, characterData: true, subtree: true });
                video.addEventListener('seeking', () => { if (!stopped) row.seeks++; }, true);
                video.addEventListener('ended', () => {
                    sample(); stopped = true; observer.disconnect();
                    const quality = video.getVideoPlaybackQuality();
                    row.ended = { time: video.currentTime, duration: video.duration, ended: video.ended,
                        dimensions: [video.videoWidth, video.videoHeight], rate: video.playbackRate,
                        totalVideoFrames: quality.totalVideoFrames, droppedVideoFrames: quality.droppedVideoFrames,
                        audioDecodedBytes: video.webkitAudioDecodedByteCount ?? null,
                        volume: video.volume, muted: video.muted, sourceUrl: video.currentSrc };
                }, { capture: true, once: true });
                const frame = () => { sample(); if (!stopped && video.isConnected) requestAnimationFrame(frame); };
                frame();
            }
        };
        const observer = new MutationObserver(attach);
        observer.observe(document.body, { childList: true, subtree: true });
        audit.stop = () => observer.disconnect();
    });
    const captureIds = new Set(['a00_f00e', 's01_f00e', 's06_p01e', 's07_p01e', 'a01_f00e', 'a06_f00e', 'a07_f00e']);
    for (const [index, movie] of movies.entries()) {
        const mediaId = movie.role === 'introduction' ? 'yr-introduction' : 'yr-' + movie.id;
        await page.evaluate(id => { window.__yrLibraryAudit.expected = id; }, mediaId);
        await page.locator(`[data-movie-id="${movie.id}"]`).click();
        await page.getByRole('button', { name: labels['hd:movieplay'], exact: true }).click();
        await page.waitForSelector(`[data-campaign-media="${mediaId}"] video`, { timeout: 30000 });
        let screenshot = false, heartbeat = 0;
        const deadline = Date.now() + (movie.durationSeconds + 45) * 1000;
        while (await page.locator(`[data-campaign-media="${mediaId}"]`).count()) {
            assert(Date.now() < deadline, 'Natural library playback exceeded its source duration allowance');
            const state = await page.evaluate(() => {
                const audit = window.__yrLibraryAudit, row = audit.clips.at(-1);
                return { id: row?.id, captions: row?.seen.length ?? 0, ended: !!row?.ended, errors: audit.errors };
            });
            assert.deepEqual(state.errors, []);
            if (!screenshot && captureIds.has(movie.id) && state.captions > 0) {
                await page.screenshot({ path: path.join(out, movie.id + '-natural-caption.png') }); screenshot = true;
            }
            if (Date.now() > heartbeat) {
                console.log(JSON.stringify({ clip: index + 1, total: movies.length, id: movie.id, captions: state.captions }));
                heartbeat = Date.now() + 30000;
            }
            await page.waitForTimeout(1000);
        }
        await page.waitForSelector('[data-movie-library-ready=true]');
        const result = await page.evaluate(() => {
            const audit = window.__yrLibraryAudit, player = window.__ra2debug.mainMenuController.screens.get(25).media;
            return { ...audit.clips.at(-1), outcome: player.outcomes.at(-1), pending: player.pending,
                unreleasedUrls: audit.urls.filter(row => !row.revoked), url: audit.urls.at(-1),
                subtitleElements: document.querySelectorAll('[data-campaign-movie-subtitle]').length };
        });
        assert.equal(result.id, mediaId); assert.equal(result.expected, mediaId);
        assert(result.startTime < .2); assert.equal(result.seeks, 0); assert.equal(result.backwards, 0);
        assert.deepEqual(result.rates, [1]); assert.deepEqual(result.mismatches, []);
        assert(result.cueCount > 0); assert.equal(result.seen.length, result.cueCount);
        assert(result.ended?.ended); assert(Math.abs(result.ended.duration - movie.durationSeconds) < .15);
        assert(result.ended.time >= result.ended.duration - .1); assert(result.ended.totalVideoFrames > 0);
        assert.deepEqual(result.ended.dimensions, [movie.width, movie.height]);
        assert(result.minimumVolume > 0 && result.maximumVolume <= 1 && !result.ended.muted);
        if (result.musicDuring) assert.equal(result.musicDuring.playing, false);
        assert.deepEqual(result.outcome, { id: mediaId, outcome: 'ended' });
        assert.deepEqual(result.pending, []); assert.deepEqual(result.unreleasedUrls, []);
        assert.equal(result.subtitleElements, 0);
        assert.equal(result.ended.sourceUrl, 'ra2://game' + movie.file.route);
        report.clips.push({ id: movie.id, edition: movie.edition, role: movie.role, source: movie.original,
            file: movie.file, ...result });
        await save();
        console.log(JSON.stringify({ completed: report.clips.length, total: movies.length, id: movie.id,
            duration: result.ended.duration, captions: result.seen.length, outcome: result.outcome.outcome }));
    }
    report.release = await page.evaluate(() => {
        const audit = window.__yrLibraryAudit; audit.stop();
        return { urls: audit.urls.length, unreleased: audit.urls.filter(row => !row.revoked).length };
    });
    assert.equal(report.release.urls, 0); assert.equal(report.release.unreleased, 0);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_50_YR_LIBRARY_CUTS_NATURAL_COMPLETE_CAPTIONS_AND_RELEASE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) {
        report.observer = await page.evaluate(() => {
            const audit = window.__yrLibraryAudit;
            return audit && { last: audit.clips.at(-1), errors: audit.errors, urls: audit.urls };
        }).catch(() => undefined);
        await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, completed: report.clips.length, out }));
