import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const build = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
const allied = process.argv.includes('--allied'), yuri = process.argv.includes('--yuri');
const edition = yuri ? 'yr' : 'ra2';
await fs.mkdir(output, { recursive: false });
const profile = path.join(output, 'profile');
await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const report = { status: 'RUNNING', build, allied, yuri, errors: [], cases: [] };
let app;
try {
    app = await electron.launch({ executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
        cwd: '/private/tmp', args: [build], env: { ...process.env, RA2_UI_REVIEW: '0', RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' } });
    const page = await app.firstWindow();
    page.on('pageerror', e => report.errors.push(e.message));
    report.console = [];
    page.on('console', m => { if (m.type() === 'error' || /wav|BAG|IDX/.test(m.text())) report.console.push(m.text().slice(0, 500)); });
    await page.locator(`[data-edition=${edition}]`).click({ timeout: 60000 });
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(({ allied, yuri, edition }) => {
        const prefs = { _r_lastMap: yuri ? 'XMP01T4.map' : 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: yuri ? '9' : allied ? '0' : '5', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
            _r_hostOpts: '6;10000;10;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) };
        Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(`_edition:${edition}:${k}`, v));
    }, { allied, yuri, edition });
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.skirmishLobby);
    await page.evaluate(() => { void window.__ra2debug.skirmishLobby.startGame(); });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 180000 });
    await page.evaluate(() => {
        const d = window.__ra2debug, sound = d.gameScreen.sound, audio = d.audioSystem;
        window.feedback = { requests: [], buffers: [] };
        const play = sound.playWithOptions;
        sound.playWithOptions = function(spec, ...args) {
            window.feedback.requests.push({ name: spec.name, samples: spec.sounds, control: [...spec.control], limit: spec.limit, tick: d.game.currentTick });
            const handle = play.call(this, spec, ...args);
            window.feedback.requests.at(-1).handle = !!handle;
            return handle;
        };
        const buffer = audio.playAudioBuffer;
        audio.playAudioBuffer = function(handle, pcm, channel, volume, ...args) {
            const samples = pcm.getChannelData(0);
            let peak = 0;
            for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
            window.feedback.buffers.push({ duration: pcm.duration, peak, channel, volume, state: this.audioContext.state });
            return buffer.call(this, handle, pcm, channel, volume, ...args);
        };
        d.actionsApi.orderUnits([d.localPlayer.getOwnedObjects().find(u => d.game.rules.general.baseUnit.includes(u.name)).id], 10);
    });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.rules.constructionYard));
    await page.waitForTimeout(1000);
    report.deploy = await page.evaluate(() => structuredClone(window.feedback));
    assert(report.deploy.requests.some(s => s.name === 'PlaceBuilding'), 'MCV must play the original placement sound');
    assert(report.deploy.buffers.some(s => s.peak > .01 && s.volume > 0 && s.state === 'running'), 'Decoded PCM must reach a running audio context');
    await page.evaluate(({ allied, yuri, edition }) => {
        const d = window.__ra2debug, base = d.localPlayer.getOwnedObjects().find(u => u.rules.constructionYard);
        for (const [id, dx, dy] of [[yuri ? 'YAPOWR' : allied ? 'GAPOWR' : 'NAPOWR', -4, -2], [yuri ? 'YABRCK' : allied ? 'GAPILE' : 'NAHAND', -5, 2]]) {
            const u = d.game.createObject(2, id);
            d.game.changeObjectOwner(u, d.localPlayer);
            d.game.spawnObject(u, d.game.map.tiles.getByMapCoords(base.tile.rx + dx, base.tile.ry + dy));
        }
    }, { allied, yuri, edition });
    const first = yuri ? 'INIT' : allied ? 'E1' : 'E2', second = yuri ? 'YENGINEER' : allied ? 'ENGINEER' : 'SENGINEER';
    await page.waitForFunction(second => window.__ra2debug.gameScreen.hud.sidebarCard.props.sidebarModel.tabs[2].items.some(i => i.target.rules.name === second), second);
    for (const hd of [true, false]) {
        const result = await page.evaluate(async ({ first, second, hd }) => {
            const d = window.__ra2debug, c = d.gameScreen.hud.sidebarCard, m = c.props.sidebarModel;
            d.generalOptions.graphics.hdEnabled.value = hd;
            m.selectTab(2);
            await new Promise(r => setTimeout(r, 500));
            const item = id => m.activeTab.items.find(i => i.target.rules.name === id);
            const click = (id, button = 0) => c.props.onSlotClick(c.createSlotClickEvent(item(id), { button, isTouch: false }));
            const i = m.activeTab.items.findIndex(i => i.target.rules.name === second);
            const initialCount = d.localPlayer.getOwnedObjects().filter(u => u.name === second).length;
            window.feedback.requests.length = 0;
            window.feedback.buffers.length = 0;
            click(first); click(first); click(second);
            const samples = [], start = performance.now();
            while (performance.now() - start < 45000) {
                await new Promise(requestAnimationFrame);
                const p = c.progressOverlays[i], value = item(second);
                samples.push({ status: value.status, progress: value.progress, frame: p.get3DObject().visible ? p.builder.getFrame() : 0 });
                if (d.localPlayer.getOwnedObjects().filter(u => u.name === second).length > initialCount) break;
            }
            await new Promise(r => setTimeout(r, 750));
            return { hd, samples, audio: structuredClone(window.feedback), complete: d.localPlayer.getOwnedObjects().filter(u => u.name === second).length > initialCount,
                fonts: [...c.quantityObjects, ...c.labelObjects].filter(Boolean).map(o => o.ctx?.font ?? o.canvas?.getContext('2d')?.font),
                gl: d.renderer.renderer.getContext().getError() };
        }, { first, second, hd });
        report.cases.push(result);
        await page.screenshot({ path: path.join(output, `queue-${hd ? 'hd' : 'original'}.png`) });
        assert(result.complete, 'The queued unit must actually leave its factory');
        assert(result.samples.some(s => s.progress === 0 && s.frame === 1), 'Waiting item must show full mask');
        assert(result.samples.some(s => s.progress > 0 && s.frame > 1), 'Activated item must sweep');
        assert(result.audio.requests.some(s => /(Eng(All|Sov)Select|EngYuriSelect|YuriEngineerSelect)/.test(s.name)), 'Completed engineer must speak');
        assert(result.audio.buffers.some(s => s.peak > .01 && s.volume > 0 && s.state === 'running'));
        assert(result.fonts.every(f => /^bold /.test(f)), 'Queue and status labels must use bold weight');
        assert.equal(result.gl, 0);
    }
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_NATIVE_QUEUE_AND_AUDIO';
} catch (e) { report.status = 'FAIL'; report.failure = e.stack; process.exitCode = 1; console.error(e); }
finally {
    if (app) await app.close();
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
    console.log(report.status);
}
