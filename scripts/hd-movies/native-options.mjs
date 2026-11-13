// Public checkbox, per-edition persistence and actual introduction source after restart.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { campaignSession, returnCampaignHome } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], introductions: [], options: [],
    scope: 'Actual public HD movies checkbox, isolated-profile process restarts, both edition namespaces, and movie/art-density independence. Introduction sources are actual product playback.' };
let session, startingApplication;
async function open(edition, enabled) {
    session = await campaignSession(out, report, { edition, density: 2,
        beforeCampaign: async ({ app }) => { startingApplication = app; }, observeIntroduction: async ({ page }) => {
        await page.waitForFunction(() => document.querySelector('[data-campaign-media$="-introduction"] video')?.currentTime > .4);
        const movie = await page.evaluate(() => {
            const holder = document.querySelector('[data-campaign-media$="-introduction"]'), video = holder.querySelector('video');
            return { source: holder.dataset.movieSource, url: video.currentSrc, width: video.videoWidth, height: video.videoHeight };
        });
        assert.equal(movie.source, enabled ? 'hd' : 'original');
        assert.equal(movie.url.startsWith('ra2://game/local-hd-movies/'), enabled);
        report.introductions.push({ edition, enabled, ...movie });
    } });
    startingApplication = undefined;
}
async function checkbox(edition, enabled) {
    await returnCampaignHome(session.page, session.labels);
    await session.page.getByRole('button', { name: session.labels['hd:menuoptions'], exact: true }).click();
    const input = session.page.locator('[data-hd-movie-options] input'); await input.waitFor();
    const before = await session.page.evaluate(() => {
        const g = window.__ra2debug.generalOptions.graphics; return { enabled: g.hdEnabled.value, density: g.hdDensity.value };
    });
    await input.setChecked(enabled);
    const after = await session.page.evaluate(edition => {
        const g = window.__ra2debug.generalOptions.graphics;
        return { graphics: { enabled: g.hdEnabled.value, density: g.hdDensity.value },
            value: localStorage.getItem(`_edition:${edition}:ra2hd.hdMovies.v1`),
            other: localStorage.getItem(`_edition:${edition === 'ra2' ? 'yr' : 'ra2'}:ra2hd.hdMovies.v1`) };
    }, edition);
    assert.deepEqual(after.graphics, before); assert.equal(after.value, enabled ? '1' : '0');
    assert.equal(await input.isChecked(), enabled);
    report.options.push({ edition, enabled, beforeGraphics: before, ...after });
    await session.page.screenshot({ path: path.join(out, `${edition}-${enabled ? 'hd' : 'original'}-checkbox.png`) });
    await session.page.getByRole('button', { name: session.labels['gui:back'], exact: true }).click();
    await session.page.getByRole('button', { name: session.labels['hd:menumovies'], exact: true }).click();
    await session.page.waitForSelector('[data-movie-library-ready="true"]');
    await session.page.locator('[data-movie-id="s03_p01e"]').click();
    await session.page.getByRole('button', { name: session.labels['hd:movieplay'], exact: true }).click();
    await session.page.waitForFunction(() => document.querySelector('[data-campaign-media] video')?.currentTime > .3);
    const nextClip = await session.page.evaluate(() => {
        const holder = document.querySelector('[data-campaign-media]'), video = holder.querySelector('video');
        return { kind: holder.dataset.movieSource, url: video.currentSrc, dimensions: [video.videoWidth, video.videoHeight] };
    });
    assert.equal(nextClip.kind, enabled ? 'hd' : 'original');
    report.options.at(-1).nextClipWithoutRestart = nextClip;
    await session.page.locator('[data-campaign-media] button').click();
    await session.page.waitForSelector('[data-movie-library-ready="true"]');
    await session.app.close(); session = undefined;
}
try {
    await open('ra2', true); await checkbox('ra2', false);
    await open('ra2', false); await checkbox('ra2', true);
    await open('yr', true); await checkbox('yr', false);
    assert.equal(report.options.at(-1).other, '1');
    await open('yr', false); await checkbox('yr', true);
    assert.equal(report.options.at(-1).other, '1');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_MOVIE_CHECKBOX_EDITION_PERSISTENCE_RESTART_AND_DENSITY_INDEPENDENCE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await session?.page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await (session?.app ?? startingApplication)?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error }));
