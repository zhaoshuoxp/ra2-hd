import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const origin = process.env.M11_STATE_ORIGIN ?? 'http://127.0.0.1:4188';
const output = process.env.M11_STATE_OUTPUT ?? `.artifacts/m1-1/state-validation/run-${Date.now()}`;
await fs.mkdir(output, { recursive: true });
const result = { status: 'FAIL', errors: [], consoleErrors: [], external: [], captures: [], checks: {} };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
let page;
try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const url = route.request().url();
        if (!url.startsWith(origin + '/') && !/^(blob|data):/.test(url)) { result.external.push(url); return route.abort(); }
        return route.continue();
    });
    await context.addInitScript(() => {
        const prefs = { _r_lastMap: 'MP23T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1',
            _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null, null, null, { d: 2, c: 0, co: 2, s: 3, t: 1 }, null, null, null, null]) };
        Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
    });
    page = await context.newPage();
    page.on('pageerror', e => result.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') result.consoleErrors.push(m.text()); });
    await page.goto(`${origin}/?conscript-hd=4`);
    await page.getByText('Offline Skirmish', { exact: true }).click({ timeout: 45000 });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => { const d = window.__ra2debug; d.generalOptions.graphics.renderResolution.value = '4k';
        d.skirmishLobby.startGame(1700000000000); });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 60000 });
    result.map = await page.evaluate(() => window.__installConscriptStates());
    console.log('MAP', JSON.stringify({ ...result.map, warheads: result.map.warheads.length }));
    await page.evaluate(() => window.__conscriptStates.spawn());
    const capture = async label => {
        const pair = await page.evaluate(label => { const s = window.__conscriptStates; s.label = label; return s.pair(); }, label);
        assert(pair.restored, `${label}: same-state restoration`);
        const row = pair.hd;
        await fs.writeFile(`${output}/${label}-hd.png`, Buffer.from(row.png.split(',')[1], 'base64'));
        await fs.writeFile(`${output}/${label}-original.png`, Buffer.from(pair.originalPng.split(',')[1], 'base64'));
        delete row.png; result.captures.push({ label, ...row });
        assert.deepEqual(row.buffer, [3840, 2160]); assert(row.hd && row.pageMatches && row.gl === 0);
        console.log('CAPTURE', label);
    };
    const step = async (ticks, label) => {
        const rows = await page.evaluate(({ ticks, label }) => window.__conscriptStates.step(ticks, label), { ticks, label });
        await fs.writeFile(`${output}/${label}-trace.json`, JSON.stringify(rows, null, 2));
        assert(rows.every(r => r.gl === 0 && (!r.rendererPresent || (r.hd && r.pageMatches))), label);
        return rows;
    };
    await capture('flat');
    await page.evaluate(() => { const s = window.__conscriptStates; s.relocate(s.high, true); });
    await capture('high-bridge-on');
    await page.evaluate(() => { const s = window.__conscriptStates; s.relocate(s.high, false); });
    await capture('high-bridge-under');
    result.checks.bridgeOcclusion = await page.evaluate(() => window.__conscriptStates.occlusion());
    console.log('OCCLUSION', result.checks.bridgeOcclusion);
    assert(result.checks.bridgeOcclusion.hidden > 0 && result.checks.bridgeOcclusion.leaked === 0,
        'HD coverage must not leak through the native bridge deck');
    await page.evaluate(() => { const s=window.__conscriptStates;s.u.warpedOutTrait.setActive(true,true,s.g); });
    await capture('high-bridge-under-warped');
    result.checks.bridgeWarpOcclusion = await page.evaluate(() => window.__conscriptStates.occlusion());
    assert(result.checks.bridgeWarpOcclusion.hidden>0&&result.checks.bridgeWarpOcclusion.leaked===0,
        'Half-transparent HD body must stay behind the bridge');
    await page.evaluate(() => { const s=window.__conscriptStates;s.u.warpedOutTrait.expire(s.g); });
    await fs.writeFile(`${output}/checkpoint.json`, JSON.stringify(result, null, 2));
    if (process.env.M11_STATE_PROBE !== '1') {
        await page.evaluate(() => window.__conscriptStates.startVideo());
        const { runConscriptScenarios } = await import('./run-conscript-scenarios.mjs');
        try { Object.assign(result.checks, await runConscriptScenarios(page, output, { step, capture })); }
        finally {
            const video = await page.evaluate(() => window.__conscriptStates.stopVideo());
            await fs.writeFile(`${output}/scenarios.webm`, Buffer.from(video.split(',')[1], 'base64'));
        }
    }
    result.effects = await page.evaluate(() => window.__conscriptStates.effects);
    const milestones = await page.evaluate(() => window.__conscriptStates.milestones);
    for (const [label,pair] of Object.entries(milestones)) {
        assert(pair.restored,`${label}: moving-frame restoration`);
        await fs.writeFile(`${output}/${label}-moving-hd.png`,Buffer.from(pair.hd.png.split(',')[1],'base64'));
        await fs.writeFile(`${output}/${label}-moving-original.png`,Buffer.from(pair.originalPng.split(',')[1],'base64'));
        delete pair.hd.png;result.captures.push({...pair.hd,label:`${label}-moving`});
    }
    result.disposal = await page.evaluate(async () => {
        const s=window.__conscriptStates, d=s.d, renderer=d.renderer.renderer;
        const textures=s.units[0].r.shpRenderable.builder.hdOverride.pages.flatMap(p=>[p.base,p.data]);
        const allocated=textures.filter(t=>!!renderer.properties.get(t).__webglTexture).length;
        await d.gameScreen.onLeave();
        return {allocated,released:textures.every(t=>!renderer.properties.get(t).__webglTexture),remainingGame:!!d.game};
    });
    assert(result.disposal.released&&!result.disposal.remainingGame,'Match exit must release the HD pack');
    assert.deepEqual(result.errors, []); assert.deepEqual(result.consoleErrors, []); assert.deepEqual(result.external, []);
    result.status = process.env.M11_SKIP_TERRAIN || process.env.M11_STATE_SECTION || process.env.M11_STATE_PROBE
        ? 'PASS_PARTIAL_SCENARIOS' : 'PASS_NATIVE_STATE_SCENARIOS';
} catch (e) {
    result.failure = e.stack; process.exitCode = 1; console.error(e);
    result.diagnostic = await page?.evaluate(() => {
        const s=window.__conscriptStates;if(!s)return null;
        const props=s.r.deadBodyAnimRenderable?.getAnimProps();
        return {sample:s.sample(),effects:s.effects,actors:s.units.filter(x=>x.u.isSpawned).map(({u})=>({name:u.name,
            tile:[u.tile.rx,u.tile.ry],moving:u.isMoving,task:u.unitOrderTrait.getCurrentTask()?.constructor.name,
            moveResult:u.moveTrait.lastMoveResult})),corpse:props&&{rate:props.rate,start:props.start,end:props.end,
            loopStart:props.loopStart,loopEnd:props.loopEnd,loopCount:props.loopCount,
            frame:s.r.deadBodyAnimRenderable.animation?.getCurrentFrame(),state:s.r.deadBodyAnimRenderable.animation?.getState()}};
    }).catch(()=>null);
}
finally { await fs.writeFile(`${output}/result.json`, JSON.stringify(result, null, 2) + '\n'); await browser.close(); }
console.log('OUTPUT', output, result.status);
