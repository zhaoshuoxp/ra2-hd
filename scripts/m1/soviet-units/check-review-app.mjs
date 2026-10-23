import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(process.argv[2]);
const delivery = JSON.parse(await fs.readFile(path.join(root, 'delivery.json'), 'utf8'));
const report = { status: 'RUNNING', errors: [], matches: [] };
const app = await electron.launch({
    executablePath: path.join(delivery.reviewLauncher, 'Contents/MacOS/Launch'),
    cwd: '/private/tmp',
    timeout: 60000,
});
try {
    const page = await app.firstWindow();
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    report.profile = await app.evaluate(({ app }) => app.getPath('userData'));
    assert.equal(report.profile, path.join(root, 'Review Profile'));
    report.defaultHd = await page.evaluate(
        () => window.__ra2debug.generalOptions.graphics.hdEnabled.value,
    );
    if (!process.argv[3]) assert.equal(report.defaultHd, true);
    else report.repeatedDisposableProfile = true;
    for (const enabled of [false, true]) {
        await page.evaluate((enabled) => {
            const d = window.__ra2debug;
            d.generalOptions.graphics.hdEnabled.value = enabled;
            d.generalOptions.graphics.renderResolution.value = '1080p';
            Object.entries({
                _r_lastMap: 'MP01T4.map',
                _r_lastMode: '1',
                _r_lastCountry: '5',
                _r_lastColor: '1',
                _r_lastStartPos: '0',
                _r_lastTeam: '0',
                _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
                _r_lastBots: JSON.stringify([
                    null,
                    null,
                    null,
                    { d: 4, c: 5, co: 2, s: 3, t: 1 },
                    null,
                    null,
                    null,
                    null,
                ]),
            }).forEach(([k, v]) => localStorage.setItem(k, v));
        }, enabled);
        await page.getByText('Offline Skirmish', { exact: true }).click();
        await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
        await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
        await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, {
            timeout: 90000,
        });
        if (enabled)
            await page.waitForFunction(
                () => window.__ra2debug.sovietUnitsHd?.families.SMCV?.status === 'READY',
                undefined,
                { timeout: 30000 },
            );
        const row = await page.evaluate((enabled) => {
            const d = window.__ra2debug,
                u = d.localPlayer.getOwnedObjects().find((u) => u.name === 'SMCV'),
                r = d.renderableManager.getRenderableByGameObject(u);
            return {
                enabled,
                identity: u.name,
                hd: !!r.unitVxlHd?.active,
                units: d.sovietUnitsHd,
                buffer: [
                    d.renderer.renderer.domElement.width,
                    d.renderer.renderer.domElement.height,
                ],
                zoom: d.worldScene.camera.zoom,
                gl: d.renderer.renderer.getContext().getError(),
            };
        }, enabled);
        assert.equal(row.hd, enabled);
        assert.equal(row.gl, 0);
        assert.equal(row.zoom, 1);
        report.matches.push(row);
        await page.screenshot({
            path: path.join(root, enabled ? 'app-hd.png' : 'app-original.png'),
        });
        const returnLabels = await page.evaluate(() =>
            ['GUI:Continue', 'GUI:Back'].map((key) =>
                window.__ra2debug.gameScreen.strings.get(key),
            ),
        );
        const abort = await page.evaluate(() => {
            const d = window.__ra2debug;
            d.gameScreen.menu.open();
            return d.gameScreen.strings.get('GUI:AbortMission');
        });
        await page.getByText(abort, { exact: true }).click();
        await page
            .getByText(
                await page.evaluate(() => window.__ra2debug.gameScreen.strings.get('GUI:Quit')),
                { exact: true },
            )
            .click();
        await page.waitForFunction(() => !window.__ra2debug.game, undefined, { timeout: 45000 });
        for (let attempts = 0; attempts < 40; attempts++) {
            if (await page.getByText('Offline Skirmish', { exact: true }).isVisible()) break;
            for (const label of returnLabels) {
                const button = page.getByText(label, { exact: true });
                if (await button.isVisible()) {
                    await button.click();
                    break;
                }
            }
            await page.waitForTimeout(250);
        }
        await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 10000 });
    }
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_MAC_REVIEW_LAUNCHER_DEFAULT_HD_ORIGINAL_RECOVERY_AND_REENABLE';
} catch (e) {
    report.status = 'FAIL';
    report.failure = e.stack;
    const failedPage = await app.firstWindow();
    report.visibleText = await failedPage.locator('body').innerText();
    await failedPage.screenshot({
        path: path.join(root, (process.argv[3] ?? 'app-check') + '-failure.png'),
    });
    process.exitCode = 1;
} finally {
    await fs.writeFile(
        path.join(root, (process.argv[3] ?? 'app-check') + '.json'),
        JSON.stringify(report, null, 2) + '\n',
    );
    await app.close();
}
console.log(report.status);
