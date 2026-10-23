// One bounded shared-path check: saved selection, next match and atomic failure.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';
import { startSession } from '../allied-units/desktop-session.mjs';
import catalog from '../../../desktop/yuri-building-coverage.json' with { type: 'json' };

const receipt = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const session = await startSession(process.argv[2], process.argv[3], 'yr', false, async ({ page, report }) => {
    report.default = await page.evaluate(() => ({ enabled: window.__ra2debug.generalOptions.graphics.hdEnabled.value,
        density: window.__ra2debug.generalOptions.graphics.hdDensity.value }));
    assert.deepEqual(report.default, { enabled: true, density: 4 });
    const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
    await page.getByRole('button', { name: locale['hd:menuoptions'], exact: true }).click();
    const row = page.locator('[data-hd-family=all]');
    await row.locator('.select-value').click(); await row.getByText('2×', { exact: true }).click();
    await page.locator('.menu-button:visible').last().click();
    report.saved2x = await page.evaluate(() => localStorage.getItem('_edition:yr:_r_opts_v3'));
    assert(report.saved2x);
});
const { page, out, report, stage, close } = session;
const selection = async value => {
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.locator('.menu-button:visible').first().click();
    const row = page.locator('[data-hd-family=all]');
    await row.locator('.select-value').click(); await row.getByText(value, { exact: true }).click();
    await page.locator('.menu-button:visible').last().click();
    await page.locator('.menu-button:visible').last().click();
    return page.evaluate(() => localStorage.getItem('_edition:yr:_r_opts_v3'));
};
const reset = async () => {
    await page.evaluate(() => {
        clearInterval(window.__allied.timer);
        const d = window.__ra2debug;
        window.__oldCGame = d.game; window.__oldCWorld = d.worldView; window.__oldCDemand = d.sovietUnitsHd;
    });
    await page.evaluate(async () => { await window.r.reset; });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 &&
        window.__ra2debug.game !== window.__oldCGame, undefined, { timeout: 90000 });
    const disposed = await page.evaluate(() => ({ demandBytes: window.__oldCDemand.gpuBytes,
        disposed: window.__oldCWorld.sovietUnitsHd === undefined }));
    assert.deepEqual(disposed, { demandBytes: 0, disposed: true });
    await page.evaluate(() => window.__installAlliedFixtures()); return disposed;
};
const fixture = async (density, failed = false) => {
    await page.evaluate(() => {
        const f = window.__allied;
        f.probes = [f.building('YAGRND'), f.building('YAPOWR')]; f.peer = f.spawn('E1', 3);
        f.probes.forEach(u => f.actors[u.id] = u);
        window.__ra2debug.worldInteraction.minimapHandler.panToTile(f.center);
    });
    await page.waitForFunction(({ density, failed }) => {
        const d = window.__ra2debug, f = window.__allied;
        const parts = u => { const r = d.renderableManager.getRenderableByGameObject(u);
            return [r?.mainObj?.builder, ...[...(r?.animObjects.values() ?? [])].flat().map(o => o.builder)].filter(Boolean); };
        if (density === 1) return f.probes.every(u => parts(u).every(b => !b.hdOverride)) && !f.sample(f.peer).shpHd;
        return f.probes.every(u => {
            const requested = failed && u.name === 'YAGRND' ? 2 : density;
            return d.sovietUnitsHd.families[u.name]?.density === requested &&
                parts(u).every(b => b.hdOverride?.identity.endsWith('/' + requested));
        }) && f.sample(f.peer).shpHd;
    }, { density, failed }, { timeout: 60000 });
    return page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        return { buildings: f.probes.map(u => {
            const r = d.renderableManager.getRenderableByGameObject(u);
            return { name: u.name, size: r.mainObj.builder.getSize(), scale: r.mainObj.builder.scale,
                allocation: d.sovietUnitsHd.families[u.name] };
        }), peer: f.sample(f.peer), gl: d.renderer.renderer.getContext().getError() };
    });
};
let failure;
try {
    report.initial2x = await fixture(2); await stage('saved-2x-native-binding');
    report.saved4x = await selection('4×'); assert.notEqual(report.saved4x, report.saved2x);
    report.currentMatchAfter4x = await page.evaluate(() => window.__ra2debug.sovietUnitsHd.families.YAGRND.density);
    assert.equal(report.currentMatchAfter4x, 2);
    report.to4xDisposal = await reset(); report.nextMatch4x = await fixture(4);
    for (let i = 0; i < 2; i++) {
        assert.deepEqual(report.initial2x.buildings[i].size, report.nextMatch4x.buildings[i].size);
        assert.equal(report.initial2x.buildings[i].scale, report.nextMatch4x.buildings[i].scale);
    }
    const entry = Object.values(catalog).find(e => e.family === 'YAGRND' && e.theater === 'TEMPERATE');
    const family = JSON.parse(await fs.readFile(path.join(receipt.resources, entry.familyPath), 'utf8'));
    const binding = family.members.find(b => b.member === 'yggrnd_b.shp');
    const manifest = JSON.parse(await fs.readFile(path.join(receipt.resources, 'hd-packs', binding.packId, binding.revision, 'manifest.json'), 'utf8'));
    const pageInfo = manifest.variants.find(v => v.density === 4).pages.find(p => p.map);
    const route = `/local-hd/${binding.sha256}/4/${pageInfo.id}/map.png`;
    await page.evaluate(route => {
        window.__cOriginalFetch = window.fetch; window.__cInjected = 0;
        window.fetch = (input, init) => {
            const url = typeof input === 'string' ? input : input.url ?? String(input);
            if (url.endsWith(route)) { window.__cInjected++; return Promise.resolve(new Response('', { status: 404 })); }
            return window.__cOriginalFetch(input, init);
        };
    }, route);
    report.failureDisposal = await reset(); report.requiredMapFailure = await fixture(4, true);
    assert(report.requiredMapFailure.buildings[0].allocation.attempts.some(a => a.density === 4 && a.reason === 'missing-building-page'));
    report.injected = await page.evaluate(() => window.__cInjected); assert(report.injected > 0);
    assert(report.requiredMapFailure.peer.shpHd);
    await stage('whole-2x-family-with-explicit-4x-failure-and-healthy-peer');
    await page.evaluate(() => window.fetch = window.__cOriginalFetch);
    report.savedOriginal = await selection('Original'); report.toOriginalDisposal = await reset();
    report.original = await fixture(1); await stage('saved-original-native-binding');
    report.savedRecovered4x = await selection('4×'); report.recoveryDisposal = await reset();
    report.recovered = await fixture(4); await stage('recovered-complete-4x-family');
    report.boundary = 'One affected shared-path session: native UI persistence, unchanged current-match density, next-match replacement, complete family map failure with explicit 2X fallback, healthy accepted peer, Original, recovery and teardown. No accepted-faction matrix replay.';
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
const app = await electron.launch({ executablePath: path.join(receipt.app, 'Contents/MacOS/RA2 HD Editions'),
    cwd: '/private/tmp', timeout: 60000, env: { ...process.env, RA2_DESKTOP_USER_DATA: path.join(out, 'profile'), RA2_DESKTOP_NO_DISCOVERY: '1' } });
try {
    const page = await app.firstWindow(); await page.locator('[data-edition=yr]').click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
    report.relaunchSaved4x = await page.evaluate(() => ({ enabled: window.__ra2debug.generalOptions.graphics.hdEnabled.value,
        density: window.__ra2debug.generalOptions.graphics.hdDensity.value, saved: localStorage.getItem('_edition:yr:_r_opts_v3') }));
    assert.equal(report.relaunchSaved4x.density, 4); assert(report.relaunchSaved4x.enabled);
    assert.equal(report.relaunchSaved4x.saved, report.savedRecovered4x);
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app.close(); }
