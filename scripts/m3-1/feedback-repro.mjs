import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]);
const receipt = JSON.parse(await fs.readFile(path.join(root, '.artifacts/m3-1/campaign-entry-r1/extracted.json'), 'utf8'));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', app: receipt.app, errors: [], shots: [] };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app;
try {
    app = await electron.launch({ executablePath: path.join(receipt.app, 'Contents/MacOS', receipt.executable), cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))), RA2_DESKTOP_USER_DATA: path.join(out, 'profile') } });
    const page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    const language = await page.evaluate(() => document.documentElement.lang);
    const labels = { ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${language}.json`))).labels,
        ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`))) };
    await page.locator('[data-campaign-faction=allied]').click();
    await page.locator('[data-campaign-faction=soviet]').hover();
    await page.waitForFunction(() => ['allied', 'soviet'].every(faction => Number(document.querySelector(`[data-campaign-faction=${faction}] svg`).dataset.frame) > 0));
    report.arrowFrames = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-campaign-faction]')]
        .map(node => [node.dataset.campaignFaction, node.querySelector('svg').dataset.frame])));
    await page.screenshot({ path: path.join(out, '01-r1-stuck-arrow-focus.png') }); report.shots.push('01-r1-stuck-arrow-focus.png'); await save();
    await page.getByRole('button', { name: labels['gui:back'], exact: true }).click();
    await page.getByRole('button', { name: labels['hd:menuoptions'], exact: true }).click();
    await page.getByRole('checkbox', { name: labels['trainer:enable'], exact: true }).check();
    await page.getByRole('button', { name: labels['gui:back'], exact: true }).click();
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForSelector('[data-campaign-ready=true]'); await page.locator('[data-campaign-faction=soviet]').click();
    await page.waitForFunction(() => document.querySelector('[data-campaign-media] video')?.currentTime > .5);
    await page.locator('[data-campaign-media] button').click();
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 180000 });
    report.opening = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, m = d.gameScreen.gameTurnMgr;
        m.setCampaignPaused(false);
        try { if (!g.currentTick) m.doGameTurn(performance.now()); for (let i = 0; i < 3000 && g.campaign.inputLocked; i++) m.doGameTurn(performance.now()); }
        finally { m.setCampaignPaused(true); d.gameScreen.pointer.unlock(true); }
        return { tick: g.currentTick, inputLocked: g.campaign.inputLocked };
    });
    assert(!report.opening.inputLocked);
    await page.getByRole('button', { name: labels['trainer:economy'], exact: true }).click();
    report.trainer = await page.locator('[data-trainer-action]').evaluateAll(buttons => buttons.map(button => {
        const r = button.getBoundingClientRect(); return { text: button.textContent, disabled: button.disabled,
            receivesPointer: button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
    }));
    assert(report.trainer.length > 0); assert(report.trainer.every(button => button.disabled));
    await page.screenshot({ path: path.join(out, '02-r1-campaign-trainer-disabled.png') }); report.shots.push('02-r1-campaign-trainer-disabled.png');
    assert.deepEqual(report.errors, []); report.status = 'PASS_REPRODUCED_STUCK_ARROWS_AND_DISABLED_CAMPAIGN_TRAINER';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
