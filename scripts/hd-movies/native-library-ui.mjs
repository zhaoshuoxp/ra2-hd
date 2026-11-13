import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { campaignSession, returnCampaignHome } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], editions: [],
    scope: 'Actual Movie Library UI in both editions: scrolled mouse/keyboard selection, stable list and focus, playback return, complete counts, bound-caption HD playback, source-cue-only library clips, skip/natural completion and release. Source-cue-only clips retain their existing no-runtime-caption qualification.' };
let session;
async function listPosition(page, remember = false) {
    return page.evaluate(remember => {
        const list = document.querySelector('[data-movie-library] > div');
        if (remember) window.__movieLibraryListBefore = list;
        return { top: list.scrollTop, sameElement: list === window.__movieLibraryListBefore,
            selected: document.querySelector('[data-movie-id][aria-pressed="true"]')?.dataset.movieId,
            focused: document.activeElement?.dataset.movieId };
    }, remember);
}
async function selectWithoutScrollReset(page, id, keyboard = false) {
    const button = page.locator(`[data-movie-id="${id}"]`);
    await button.scrollIntoViewIfNeeded();
    if (keyboard) await button.focus();
    const before = await listPosition(page, true);
    assert(before.top > 100, 'Exercise an actual scrolled list');
    if (keyboard) await button.press('Space'); else await button.click();
    await page.waitForSelector(`[data-movie-id="${id}"][aria-pressed="true"]`);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await listPosition(page);
    assert(after.sameElement, 'Selection replaced the scroll container');
    assert(Math.abs(after.top - before.top) <= 1, `Selection reset scroll: ${before.top} -> ${after.top}`);
    assert.equal(after.focused, id);
    return { id, input: keyboard ? 'keyboard' : 'mouse', before, after };
}
try {
    for (const edition of ['ra2', 'yr']) {
        const directory = path.join(out, edition); await fs.mkdir(directory);
        session = await campaignSession(directory, report, { edition, beforeCampaign: async ({ page }) => {
            await page.evaluate(edition => localStorage.setItem(`_edition:${edition}:ra2hd.hdMovies.v1`, '1'), edition);
        } });
        const { page, labels } = session;
        await returnCampaignHome(page, labels);
        await page.getByRole('button', { name: labels['hd:menumovies'], exact: true }).click();
        await page.waitForSelector('[data-movie-library-ready="true"]');
        const count = await page.locator('[data-movie-id]').count(); assert.equal(count, edition === 'ra2' ? 80 : 56);
        const result = { edition, count, clips: [], scrollSelections: [] }; report.editions.push(result);
        const ids = await page.locator('[data-movie-id]').evaluateAll(buttons => buttons.map(button => button.dataset.movieId));
        const middle = Math.floor(ids.length * .7);
        result.scrollSelections.push(await selectWithoutScrollReset(page, ids[middle]));
        result.scrollSelections.push(await selectWithoutScrollReset(page, ids[middle + 1], true));
        result.scrollSelections.push(await selectWithoutScrollReset(page, ids[middle]));
        await page.screenshot({ path: path.join(out, edition + '-complete-library.png') });
        for (const id of ['s03_p01e', 'a05_p02e']) {
            result.scrollSelections.push(await selectWithoutScrollReset(page, id));
            const listBeforePlayback = await listPosition(page, true);
            await page.getByRole('button', { name: labels['hd:movieplay'], exact: true }).click();
            await page.waitForFunction(() => document.querySelector('[data-campaign-media] video')?.currentTime > .5);
            const state = await page.evaluate(() => {
                const holder = document.querySelector('[data-campaign-media]'), video = holder.querySelector('video');
                const subtitle = document.querySelector('[data-campaign-movie-subtitle]');
                return { id: holder.dataset.campaignMedia, kind: holder.dataset.movieSource, url: video.currentSrc,
                    dimensions: [video.videoWidth, video.videoHeight], subtitle: subtitle?.textContent,
                    audioDecodedBytes: video.webkitAudioDecodedByteCount };
            });
            assert.equal(state.kind, 'hd'); assert.deepEqual(state.dimensions, [560, 440]);
            assert(state.url.startsWith('ra2://game/local-hd-movies/') && state.audioDecodedBytes > 0);
            if (id === 's03_p01e') await page.locator('[data-campaign-media] button').click();
            else assert.equal(state.subtitle, '');
            await page.waitForSelector('[data-movie-library-ready="true"]', { timeout: 30000 });
            assert.equal(await page.locator('[data-campaign-media]').count(), 0);
            assert.equal(await page.locator('[data-campaign-movie-subtitle]').count(), 0);
            const listAfterPlayback = await listPosition(page);
            assert(listAfterPlayback.sameElement && Math.abs(listAfterPlayback.top - listBeforePlayback.top) <= 1);
            assert.equal(listAfterPlayback.selected, id);
            result.clips.push({ id, outcome: id === 's03_p01e' ? 'skipped' : 'natural-end', ...state,
                listBeforePlayback, listAfterPlayback });
        }
        await page.getByRole('button', { name: labels['gui:back'], exact: true }).click();
        await page.getByRole('button', { name: labels['hd:menuedition'], exact: true }).waitFor();
        await page.getByRole('button', { name: labels['hd:menumovies'], exact: true }).click();
        await page.waitForSelector('[data-movie-library-ready="true"]');
        assert.equal(await page.locator('[data-movie-id]').count(), count);
        result.scrollSelections.push(await selectWithoutScrollReset(page, ids[middle]));
        result.reentered = true;
        await session.app.close(); session = undefined;
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_COMPLETE_LIBRARY_UI_BOTH_EDITIONS_HD_CAPTION_POLICY_AND_RELEASE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await session?.page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await session?.app.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error }));
