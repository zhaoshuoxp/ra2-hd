// Faults affect only disposable copies, never accepted artwork or registrations.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const output = path.resolve(`.artifacts/m1-5/fallback-${Date.now()}`), root = path.join(output, 'external data é');
await fs.mkdir(root, { recursive: true });
for (const relative of ['ra2-core-manifest.json', 'assets/ra2/ra2.mix', 'assets/ra2/language.mix', 'assets/ra2/multi.mix',
    'upstream-support/manifest.json', 'upstream-support/general.csf', 'upstream-support/ra2cd.mix']) {
    await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await fs.copyFile(path.resolve('.local', relative), path.join(root, relative), constants.COPYFILE_FICLONE);
}
const names = ['conscript-authored', 'power-plant-authored', 'power-plant-authored-body', 'power-plant-authored-active', 'power-plant-authored-buildup', 'rhino-authored'];
async function copyPacks() {
    for (const name of names) await fs.cp(path.resolve('.local/hd-packs', name, '1'), path.join(root, 'hd-packs', name, '1'), { recursive: true });
}
async function fault(density) {
    for (const name of ['conscript-authored', 'power-plant-authored-active']) {
        const dir = path.join(root, 'hd-packs', name, '1'), m = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json')));
        await fs.writeFile(path.join(dir, m.variants.find(v => v.density === density).pages[0].base), 'deliberately corrupt disposable page');
    }
}
const results = [];
async function run(name, expected, rhino, play = true, registration = root) {
    const profile = path.join(output, name, 'profile'); await fs.mkdir(profile, { recursive: true });
    if (registration) await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: registration }));
    const app = await electron.launch({ executablePath: artifact.executable, cwd: '/private/tmp',
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' }, timeout: 60000 });
    const row = { name, errors: [], consoleErrors: [] }; results.push(row);
    try {
        const page = await app.firstWindow();
        page.on('pageerror', e => row.errors.push(e.stack)); page.on('console', m => { if (m.type() === 'error') row.consoleErrors.push(m.text()); });
        if (!play) {
            await page.getByText('Choose existing local resources', { exact: true }).waitFor({ timeout: 60000 });
            row.selectionFlow = await page.locator('body').innerText();
            await page.screenshot({ path: path.join(output, name, 'selection.png') });
        } else {
            await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
            await page.evaluate(() => {
                const d = window.__ra2debug; d.generalOptions.graphics.conscriptHd.value = true;
                d.generalOptions.graphics.powerPlantHd.value = true; d.generalOptions.graphics.rhinoHd.value = true;
                const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
                    _r_hostOpts: '3;10000;10;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) };
                Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
            });
            await page.getByText('Offline Skirmish', { exact: true }).click();
            await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
            await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
            await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
            await page.waitForTimeout(600);
            row.effective = await page.evaluate(() => {
                const d = window.__ra2debug;
                return { conscript: d.conscriptHd, powerPlant: d.powerPlantHd, rhino: d.rhinoHd,
                    units: d.localPlayer.getOwnedObjects().filter(u => ['E2', 'HTNK'].includes(u.name)).map(u => {
                        const r = d.renderableManager.getRenderableByGameObject(u);
                        return { name: u.name, hd: u.name === 'E2' ? !!r.shpRenderable.builder.hdOverride : !!r.rhinoHd?.active };
                    }), gl: d.renderer.renderer.getContext().getError() };
            });
            assert.equal(row.effective.conscript.density, expected); assert.equal(row.effective.powerPlant.density, expected);
            assert.equal(row.effective.rhino.status, rhino); assert.equal(row.effective.gl, 0);
            assert(row.effective.units.filter(u => u.name === 'E2').every(u => u.hd === (expected > 1)));
            await page.screenshot({ path: path.join(output, name, 'game.png') });
            const route = await page.evaluate(() => fetch('/local-rhino/../not-allowlisted').then(r => r.status)); assert.equal(route, 404);
        }
        assert.deepEqual(row.errors, []); row.status = 'PASS';
    } catch (error) { row.status = 'FAIL'; row.error = error.stack; throw error; }
    finally { await app.close(); await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(results, null, 2)); }
    console.log(name, row.status);
}
try {
    await run('original-only', 1, 'ORIGINAL');
    await copyPacks(); await fault(4); await run('two-x', 2, 'READY');
    await fault(2); await run('shp-original-rhino-valid', 1, 'READY');
    await copyPacks(); await fs.writeFile(path.join(root, 'hd-packs/rhino-authored/1/turret-315.mask'), 'corrupt test mask');
    await run('rhino-original-shp-valid', 4, 'ORIGINAL');
    await run('missing-retail', undefined, undefined, false, null);
    await run('invalid-retail', undefined, undefined, false, output);
} finally { console.log('OUTPUT', output); }
