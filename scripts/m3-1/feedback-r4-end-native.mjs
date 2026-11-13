import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), receipt = JSON.parse(await fs.readFile(path.resolve(process.argv[2]), 'utf8'));
const out = path.resolve(process.argv[3]), mode = process.argv[4] ?? 'victory';
const baseline = JSON.parse(await fs.readFile(path.join(root, '.artifacts/m3-1/input-final/report.json')));
const checkpoint = JSON.parse(await fs.readFile(path.join(root, 'scripts/m3-1/fixtures/mid-mission-checkpoint.json')));
await fs.mkdir(out, { recursive: false });
await fs.copyFile(import.meta.filename, path.join(out, 'harness.mjs'));
const report = { status: 'RUNNING', app: receipt.app, mode, screenshots: [], phases: [], errors: [], failedResources: [],
    harnessSha256: createHash('sha256').update(await fs.readFile(import.meta.filename)).digest('hex'),
    scope: mode === 'victory' ? 'Restore the accepted physical-input checkpoint and replay its ordinary serialized commands under accelerated simulation to the authentic original victory trigger. Trainer remains OFF. This is assisted replay, not a new physical-input full mission.'
        : 'Fresh Normal mission with accelerated ordinary force-attack and move commands to the original defeat condition. No result, trigger, damage, ownership or health injection.' };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app, page, browserWindow, labels;
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
async function step(ticks) {
    for (let left = ticks; left > 0; left -= 120) {
        const state = await page.evaluate(count => {
            const d = window.__ra2debug, g = d.game, m = d.gameScreen.gameTurnMgr;
            m.setCampaignPaused(false);
            try { for (let i = 0; i < count && !g.campaign.result && !g.campaign.failure; i++) m.doGameTurn(performance.now()); }
            finally { m.setCampaignPaused(true); }
            return { tick: g.currentTick, result: g.campaign.result, failure: g.campaign.failure };
        }, Math.min(left, 120));
        if (state.failure) throw new Error(state.failure);
        if (state.result) return state;
    }
}
async function scoreState() {
    return page.evaluate(() => {
        const root = document.querySelector('[data-campaign-score]'), canvas = root.querySelector('canvas'), menu = window.__ra2debug.mainMenu;
        const sidebarX = menu.sidebarContainer.getPosition().x;
        const effectiveScale = root.querySelector('[data-campaign-result-content]').getBoundingClientRect().width / (632 * .78);
        return { result: root.dataset.campaignResult, phase: root.dataset.scorePhase,
            title: root.querySelector('[data-score-title]').textContent, message: root.querySelector('[data-score-message]').textContent,
            panelFrame: canvas.dataset.panelFrame, emblemFrame: canvas.dataset.emblemFrame,
            backdrop: canvas.dataset.campaignBackdrop, surfacePixels: canvas.width * canvas.height, ui: window.__ra2debug.uiArt.metrics(),
            bounds: root.getBoundingClientRect().toJSON(), sidebar: { left: sidebarX * effectiveScale,
                right: (sidebarX + menu.getImage('sdtp.shp').width) * effectiveScale },
            viewport: [innerWidth, innerHeight] };
    });
}
try {
    app = await electron.launch({ executablePath: path.join(receipt.app, 'Contents/MacOS', receipt.executable), cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))), RA2_DESKTOP_USER_DATA: path.join(out, 'profile') } });
    page = await app.firstWindow(); browserWindow = await app.browserWindow(page);
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
    app.process().stderr?.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    const language = await page.evaluate(() => document.documentElement.lang);
    labels = { ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${language}.json`))).labels,
        ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`))) };
    await page.evaluate(() => {
        const d = window.__ra2debug, screen = d.mainMenuController.screens.get(22).rootController.screens.get(1), sound = screen.sound;
        window.__proofCheers = [];
        const play = sound.play.bind(sound);
        sound.play = (key, channel) => {
            const handle = play(key, channel);
            if (key === 10) {
                const row = { key, channel, handle: !!handle, playing: handle?.isPlaying(), completion: 'pending' };
                window.__proofCheers.push(row); handle?.completed.then(reason => row.completion = reason);
            }
            return handle;
        };
        d.generalOptions.graphics.hdEnabled.value = true;
    });
    if (mode === 'victory') {
        await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22).launchMission(checkpoint), checkpoint);
        await page.waitForFunction(tick => window.__ra2debug.gameScreen?.menu?.getCurrentScreen() && window.__ra2debug.game.currentTick === tick,
            checkpoint.tick, { timeout: 180000 });
        report.checkpoint = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            window.__endProofGame = g; d.gameScreen.menu.close(); d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true);
            return { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), mission: g.campaign.checkpointState(), world: g.debugGetState(),
                trainerEnabled: d.trainer.preferences.enabled, trainerModified: d.trainer.session.modified };
        });
        report.checkpoint = JSON.parse(JSON.stringify(report.checkpoint));
        assert.equal(report.checkpoint.hash, checkpoint.expected.worldHash); assert.deepEqual(report.checkpoint.rng, checkpoint.expected.rng);
        assert.deepEqual(report.checkpoint.mission, checkpoint.expected.mission);
        const aliases = { Zs: 'HealthTrait', ws: 'GarrisonTrait', qs: 'DeployerTrait', Fc: 'HarvesterTrait', R: 'PowerTrait' };
        const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
            ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'traits'
                ? Object.fromEntries(Object.entries(item).map(([name, state]) => [aliases[name] ?? name, canonical(state)])) : canonical(item)])) : value;
        assert.deepEqual(report.checkpoint.world, canonical(checkpoint.expected.world));
        assert(!report.checkpoint.trainerEnabled && !report.checkpoint.trainerModified);
        delete report.checkpoint.world; delete report.checkpoint.rng; delete report.checkpoint.mission;
        await page.evaluate(commands => window.__proofCommands = commands, baseline.final.commands.filter(command => command.tick >= checkpoint.tick));
        for (let batch = 0; batch < 100; batch++) {
            const state = await page.evaluate(() => {
                const d = window.__ra2debug, g = d.game, m = d.gameScreen.gameTurnMgr; m.setCampaignPaused(false);
                try { for (let i = 0; i < 240 && !g.campaign.result && !g.campaign.failure; i++) {
                    for (const command of window.__proofCommands.filter(command => command.tick === g.currentTick)) {
                        const action = d.actionFactory.create(command.type); action.unserialize(new Uint8Array(command.data)); action.player = g.getPlayer(command.player);
                        g.campaign.journal.record(g, action.player, [action]); action.process();
                    }
                    m.doGameTurn(performance.now());
                } } finally { m.setCampaignPaused(true); }
                return { tick: g.currentTick, result: g.campaign.result, failure: g.campaign.failure, trace: g.campaign.trace, hash: g.getHash() };
            });
            if (state.failure) throw new Error(state.failure);
            if (state.result) { report.result = state; break; }
        }
        assert.equal(report.result?.result, 'victory'); assert.equal(report.result.tick, baseline.final.tick);
        assert(report.result.trace.some(action => action.key === '0A301C50' && action.opcode === 1));
    } else {
        await page.locator('[data-campaign-faction=soviet]').click();
        await page.waitForSelector('[data-campaign-media] video'); await page.locator('[data-campaign-media] button').click();
        await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 180000 });
        await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game; window.__endProofGame = g;
            const m = d.gameScreen.gameTurnMgr; m.setCampaignPaused(false);
            try { if (!g.currentTick) m.doGameTurn(performance.now()); for (let i = 0; i < 3000 && g.campaign.inputLocked; i++) m.doGameTurn(performance.now()); }
            finally { m.setCampaignPaused(true); d.gameScreen.pointer.unlock(true); }
        });
        await page.evaluate(() => { const d = window.__ra2debug, yard = [...d.localPlayer.buildings].find(b => b.rules.constructionYard);
            d.actionsApi.orderUnits(d.localPlayer.getOwnedObjects().filter(o => o.isUnit() && o.attackTrait).map(o => o.id), 3, yard.id); });
        for (let i = 0; i < 60; i++) { await step(150); if (!await page.evaluate(() => [...window.__ra2debug.localPlayer.buildings].some(o => o.rules.constructionYard))) break; }
        assert(!await page.evaluate(() => [...window.__ra2debug.localPlayer.buildings].some(o => o.rules.constructionYard)));
        await step(1200);
        for (let i = 0; i < 65; i++) {
            const target = await page.evaluate(() => {
                const d = window.__ra2debug, units = d.localPlayer.getOwnedObjects().filter(o => o.isUnit() && o.isSpawned && o.zone !== 2);
                const shooters = units.filter(o => o.attackTrait), engineers = units.filter(o => o.rules.engineer);
                if (shooters.length <= 1 && engineers.length <= 1) return;
                const target = engineers.length > 1 ? engineers[0] : shooters[0]; if (!target) return;
                d.actionsApi.orderUnits(shooters.filter(o => o !== target).map(o => o.id), 3, target.id); return target.id;
            });
            if (!target) break; await step(90);
        }
        await page.evaluate(() => { const d = window.__ra2debug;
            d.actionsApi.orderUnits(d.localPlayer.getOwnedObjects().filter(o => o.isUnit() && o.isSpawned).map(o => o.id), 1, 98, 83); });
        for (let i = 0; i < 50; i++) { const state = await step(150); if (state?.result) break; }
        report.result = await page.evaluate(() => { const g = window.__ra2debug.game;
            return { tick: g.currentTick, result: g.campaign.result, failure: g.campaign.failure, trace: g.campaign.trace }; });
        assert.equal(report.result.result, 'defeat'); assert(report.result.trace.some(action => action.key === '0A115A1C' && action.opcode === 2));
    }
    // Drain the original trigger's afterTick game-end callback through one ordinary turn.
    await page.evaluate(() => { const m = window.__ra2debug.gameScreen.gameTurnMgr;
        m.setCampaignPaused(false); try { m.doGameTurn(performance.now()); } finally { m.setCampaignPaused(true); } });
    await save(); console.log('authentic', mode, report.result.tick, 'waiting for final media');
    await page.locator('[data-campaign-score=retail]').waitFor({ timeout: 240000 });
    const started = performance.now();
    while (performance.now() - started < 7500) { report.phases.push(await scoreState()); await page.waitForTimeout(140); }
    await page.waitForFunction(() => document.querySelector('[data-score-phase=complete]'), undefined, { timeout: 20000 });
    report.complete = await scoreState();
    report.scoreArtwork = await page.evaluate(() => {
        const root = document.querySelector('[data-campaign-score]'), canvas = root.querySelector('canvas');
        const content = root.querySelector('[data-campaign-result-content]');
        const p = window.__ra2debug.mainMenuController.screens.get(12).campaignPresentation;
        const reference = document.createElement('canvas'); reference.width = canvas.width; reference.height = canvas.height;
        const ctx = reference.getContext('2d'), image = p.backdrop.image, inset = p.backdrop.inset;
        const sourceWidth = image.naturalWidth - 2 * inset, sourceHeight = image.naturalHeight - 2 * inset;
        const w = sourceWidth * canvas.height / sourceHeight, left = (canvas.width - w) / 2;
        ctx.drawImage(image, inset, inset, sourceWidth, sourceHeight, left, 0, w, canvas.height);
        if (left > 0) {
            ctx.save(); ctx.translate(left, 0); ctx.scale(-1, 1);
            ctx.drawImage(image, inset, inset, 16, sourceHeight, 0, 0, left, canvas.height); ctx.restore();
            ctx.save(); ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
            ctx.drawImage(image, image.naturalWidth - inset - 16, inset, 16, sourceHeight, 0, 0, left, canvas.height); ctx.restore();
        }
        const scaleX = canvas.width / canvas.clientWidth, scaleY = canvas.height / canvas.clientHeight;
        const x = Math.floor((canvas.clientWidth / 2 + (80 - 316) * .78) * scaleX);
        const y = Math.floor((canvas.clientHeight / 2 + (60 + 200 - 284) * .78) * scaleY);
        const read = node => [...node.getContext('2d').getImageData(x, y, 1, 1).data];
        return { subjectScale: Number(content.dataset.scoreContentScale), sample: [x,y], actual: read(canvas), expectedBackground: read(reference), bounds: content.getBoundingClientRect().toJSON() };
    });
    assert.equal(report.scoreArtwork.subjectScale, .78);
    assert(report.scoreArtwork.actual.every((v,i) => Math.abs(v - report.scoreArtwork.expectedBackground[i]) < 5), JSON.stringify(report.scoreArtwork));
    if (mode === 'victory') {
        assert(new Set(report.phases.map(phase => phase.emblemFrame)).size > 5);
        assert(report.phases.some(phase => phase.title !== report.complete.title));
        assert.equal(report.complete.title, labels['gui:partitlesov01']);
    }
    report.speech = await page.evaluate(() => window.__endProofGame.campaign.speechOutcomes);
    const voice = mode === 'victory' ? 'EVA_MissionAccomplished' : 'EVA_MissionFailed';
    assert(report.speech.some(row => row.id === voice && row.reason === 'ended'));
    if (mode === 'victory') assert(report.speech.some(row => row.id === 'Mis_S1_SofiaVictorySpeech' && row.reason === 'ended'));
    report.cheers = await page.evaluate(() => window.__proofCheers);
    if (mode === 'victory') { assert.equal(report.cheers.length, 1); assert.equal(report.cheers[0].completion, 'ended'); }
    else assert.equal(report.cheers.length, 0);
    for (const dimensions of [[800, 600], [1280, 720], [1680, 720], [720, 900]]) {
        await browserWindow.evaluate((window, dimensions) => { window.unmaximize(); window.setContentSize(...dimensions); }, dimensions);
        await page.waitForTimeout(350); const state = await scoreState();
        assert(Math.abs(state.sidebar.right - state.viewport[0]) < 2);
        assert(Math.abs(state.bounds.left) < 2 && Math.abs(state.bounds.right - state.sidebar.left) < 2);
        assert.equal(state.backdrop, 'campaign-backdrop-soviet-score-original-r4.png');
        assert(state.surfacePixels <= 1700000); assert(state.ui.reservedBytes <= state.ui.budget);
        report.phases.push({ name: 'Responsive result', ...state }); await shot('score-' + mode + '-' + dimensions.join('x'));
    }
    await page.getByRole('button', { name: labels['gui:continue'], exact: true }).click();
    await page.waitForSelector('[data-campaign-ready=true]'); report.returnedToCampaign = true;
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); report.status = 'PASS_ORIGINAL_' + mode.toUpperCase() + '_AUDIO_AND_RESPONSIVE_SCORE';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; if (page) await shot('failure').catch(() => {}); }
finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
