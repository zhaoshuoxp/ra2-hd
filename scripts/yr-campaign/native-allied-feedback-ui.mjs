import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld, worldState } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]), mission = 'all06umd.map';
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Original Allied06 opening and pause menu. A separate media-player integration check plays an unchanged original map clip and clicks its Skip button with the normal mouse. It carries no mission-trigger or victory credit.' };
let session;
try {
    session = await campaignSession(out, report, { edition: 'yr', density: 4 });
    const { page } = session;
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), mission);
    await waitWorld(page, mission); await stepWorld(page, 1500);
    await page.screenshot({ path: path.join(out, 'native-bridge-and-parliament.png') });
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.waitForSelector('[data-campaign-objectives]');
    report.objectives = await page.locator('[data-campaign-objectives]').innerText();
    assert(report.objectives.length > 30 && !/GUI:Briefing|MISSING/i.test(report.objectives));
    await page.screenshot({ path: path.join(out, 'native-pause-objectives.png') });
    await page.evaluate(() => {
        const s = window.__ra2debug.gameScreen;
        s.menu.close(); s.gameTurnMgr.setPaused(true);
    });
    const before = await worldState(page);
    const manifest = JSON.parse(await fs.readFile('.local/campaign/yr/all06umd/manifest.json'));
    const clip = manifest.files.find(file => file.name.endsWith('.webm'));
    assert(clip);
    await page.evaluate(async clip => {
        const d = window.__ra2debug, s = d.gameScreen;
        await s.campaignSpeech.whenMissionComplete();
        s.pointer.lock();
        window.__feedbackPointerBefore = { userLock: s.pointer.getUserLockMode(),
            pointerLock: !!document.pointerLockElement };
        window.__feedbackSkipOutcome = s.campaignMediaPlayer.play({ id: 'feedback-pointer-control',
            url: clip.route, placement: 'fullscreen', skipLabel: 'Skip' });
    }, clip);
    const holder = page.locator('[data-campaign-media="feedback-pointer-control"]');
    await holder.waitFor({ timeout: 90000 });
    report.pointer = await page.evaluate(() => ({ before: window.__feedbackPointerBefore,
        lockedDuringMovie: !!document.pointerLockElement,
        cursor: getComputedStyle(document.querySelector('[data-campaign-media="feedback-pointer-control"]')).cursor }));
    assert.equal(report.pointer.lockedDuringMovie, false); assert.equal(report.pointer.cursor, 'default');
    await page.screenshot({ path: path.join(out, 'native-fullscreen-skip-pointer.png') });
    const box = await holder.getByRole('button', { name: 'Skip', exact: true }).boundingBox(); assert(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    report.skip = await page.evaluate(() => window.__feedbackSkipOutcome);
    assert.equal(report.skip, 'skipped');
    assert.deepEqual(await worldState(page), before, 'UI controls must leave the frozen original world unchanged');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ORIGINAL_CAMPAIGN_OBJECTIVES_AND_NATIVE_MOUSE_SKIP_WITH_UNLOCKED_POINTER';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await session?.app.close(); await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify({ status: report.status, error: report.error }));
