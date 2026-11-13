import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, openMissionSelection } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]);
const edition = process.argv.includes('--yr') ? 'yr'
    : process.argv.slice(3).find(value => value === 'ra2' || value === 'yr') ?? 'ra2';
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', edition, errors: [], failedResources: [],
    scope: 'Public edition introduction with its own original subtitle track and normal Skip; RA2 mission-list node/scroll continuity during ordinary mission selection. No mission08-12 playthrough is claimed.' };
let app, page;
try {
    const session = await campaignSession(out, report, { edition, density: 4, observeIntroduction: async running => {
        app = running.app; page = running.page;
        const video = page.locator('[data-campaign-media$="-introduction"] video');
        await video.evaluate(v => { v.currentTime = 12; });
        await page.waitForFunction(() => document.querySelector('[data-campaign-media$="-introduction"] video')?.currentTime >= 12
            && document.querySelector('[data-campaign-movie-subtitle]')?.textContent.trim(), undefined, { timeout: 30000 });
        report.introduction = await page.evaluate(() => ({ language: document.documentElement.lang,
            movie: document.querySelector('[data-campaign-media]')?.getAttribute('data-campaign-media'),
            time: document.querySelector('[data-campaign-media] video')?.currentTime,
            subtitle: document.querySelector('[data-campaign-movie-subtitle]')?.textContent,
            skip: !!document.querySelector('[data-campaign-media] button') }));
        assert(report.introduction.skip && !report.introduction.subtitle.startsWith('hd:'));
        if (report.introduction.language.startsWith('zh')) assert(/[\u3400-\u9fff]/.test(report.introduction.subtitle));
        await page.screenshot({ path: path.join(out, 'native-introduction-subtitles.png') });
    } });
    ({ app, page } = session);
    if (edition === 'ra2') {
        await openMissionSelection(page, session.labels, 'allied');
        const row = page.locator('[data-campaign-mission="all07t.map"]'); await row.scrollIntoViewIfNeeded();
        const before = await page.evaluate(() => {
            const list = window.__selectedMissionList = document.querySelector('[data-campaign-mission-list]');
            return { scrollTop: list.scrollTop, height: list.clientHeight, total: list.scrollHeight };
        });
        assert(before.scrollTop > 0);
        await row.click();
        await page.waitForFunction(() => {
            const row = document.querySelector('[data-campaign-mission="all07t.map"]');
            return row?.getAttribute('aria-pressed') === 'true' && !row.disabled;
        });
        const after = await page.evaluate(() => ({ sameNode: window.__selectedMissionList === document.querySelector('[data-campaign-mission-list]'),
            scrollTop: document.querySelector('[data-campaign-mission-list]').scrollTop }));
        assert(after.sameNode); assert.equal(after.scrollTop, before.scrollTop);
        report.missionList = { before, after };
        await page.screenshot({ path: path.join(out, 'native-retained-mission-scroll.png') });
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_PUBLIC_INTRODUCTION_CAPTIONS_AND_SELECTION';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
