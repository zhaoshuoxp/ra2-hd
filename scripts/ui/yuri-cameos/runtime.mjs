// Incremental native sidebar evidence in the copied task app, using read-only imports.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateProfile } from '../../../desktop/profile.mjs';

const delivery = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const output = path.resolve(process.argv[3]), coreRoot = await fs.realpath(process.argv[4]);
const inventory = JSON.parse(await fs.readFile('docs/yuri-cameos-inventory.json', 'utf8'));
const psychicRevealOnly = process.argv.includes('--psychic-reveal-only');
const combinedSmoke = process.argv.includes('--combined-smoke');
const integrationSmoke = process.argv.includes('--integration-smoke') || combinedSmoke;
const loadingAndShield = process.argv.includes('--loading-and-force-shield') || integrationSmoke;
const manifestBytes = await fs.readFile(path.join(delivery.resources, `ui-packs/${delivery.uiRevision}/manifest.json`));
const manifest = JSON.parse(manifestBytes);
assert.equal(createHash('sha256').update(manifestBytes).digest('hex'), delivery.uiManifestSha256);
const native = await validateProfile(coreRoot);
assert.equal(native.selections.get('/local-assets/yr/manifest.json').files.length, 7);
await fs.mkdir(output, { recursive: false });
const report = { status: 'RUNNING', taskId: 'E', app: delivery.app, uiRoot: delivery.resources,
    scope: integrationSmoke ? 'MAIN_INTEGRATION_FOCUSED_CAMEOS_POWERS_AND_LOADING'
        : loadingAndShield ? 'YURI_LOADING_AND_THREE_FACTION_FORCE_SHIELD' : psychicRevealOnly ? 'PSYCHIC_REVEAL_ONLY' : 'FULL_NATIVE_CAMEO_MATRIX',
    coreRoot, uiManifestSha256: delivery.uiManifestSha256, nativeArchivesCopied: false, cases: [], errors: [],
    disclosure: 'Real native matches with revealed legal prerequisite fixtures and native stolen/veteran production grants. Rules, tech eligibility, camera and renderer geometry are unchanged. Not an organic full-tech playthrough.',
    peerSidebarFix: combinedSmoke ? 'Integrated; coherent publication checked with the accepted E catalog'
        : 'Not certified by this validation mode' };
const save = () => fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const roots = [...new Set(inventory.entries.flatMap(entry => entry.uses))];
let app;

async function inspect(page, name, wait = true) {
    await page.evaluate(name => window.__ra2debug.helpers.getSidebarTechnoDebugStateByName(name), name);
    if (wait) await page.waitForFunction(name => {
        const d = window.__ra2debug, state = d.helpers.getSidebarTechnoDebugStateByName(name);
        const card = d.gameScreen.hud.sidebarCard, item = card.publishedItems?.[state.slotIndex]
            ?? card.props.sidebarModel.activeTab.items[state.itemIndex];
        const builder = card.slotObjects[state.slotIndex].builder;
        return item?.target.rules.name === name && builder.isHdActive
            && builder.frames[builder.native.getFrame()]?.id === item.cameo + '.shp';
    }, name, { timeout: 10000 });
    return page.evaluate(name => {
        const d = window.__ra2debug, state = d.helpers.getSidebarTechnoDebugStateByName(name);
        const card = d.gameScreen.hud.sidebarCard, slot = state.slotIndex;
        const item = card.publishedItems?.[slot] ?? card.props.sidebarModel.activeTab.items[state.itemIndex];
        const object = card.slotObjects[slot], b = object.builder;
        const frame = b.frames[b.native.getFrame()], entry = d.uiArt.manifest.assets.find(e => e.id === frame.id);
        const image = b.source.getImage(b.native.getFrame()), uv = b.overlay?.geometry.getAttribute('uv');
        const us = uv ? Array.from({ length: uv.count }, (_, i) => uv.getX(i)) : [];
        const vs = uv ? Array.from({ length: uv.count }, (_, i) => uv.getY(i)) : [];
        return { name, cameo: item.cameo + '.shp', entryId: frame.id, entry,
            hd: b.isHdActive, originalVisible: b.original.visible, light: b.light,
            textureSize: b.asset && [b.asset.bitmap.width, b.asset.bitmap.height],
            rankTexture: !!b.asset?.overlayTexture, frame: b.native.getFrame(),
            geometry: [frame.width, frame.height], aggregateCanvas: [state.width, state.height],
            nativeTrim: { x: image.x, y: image.y, width: image.width, height: image.height },
            hdPositions: b.overlay && Array.from(b.overlay.geometry.getAttribute('position').array),
            nativePositions: Array.from(b.original.geometry.getAttribute('position').array),
            uvBounds: uv && [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)],
            tab: state.tabId, slot,
            disabled: item.disabled, progress: item.progress, quantity: item.quantity, status: item.status,
            nameVisible: card.nameObjects[slot].getUiObject().get3DObject().visible,
            clockVisible: card.progressOverlays[slot].get3DObject().visible,
            quantityVisible: card.quantityObjects[slot].getUiObject().get3DObject().visible,
            gl: d.renderer.renderer.getContext().getError(), ui: d.uiArt.metrics() };
    }, name);
}

function checkBinding(binding) {
    assert.equal(binding.entryId, binding.cameo, binding.name);
    assert(binding.hd && !binding.originalVisible, binding.name);
    assert.deepEqual(binding.textureSize, [240, 192]); assert.deepEqual(binding.geometry, [60, 48]);
    assert.deepEqual(binding.hdPositions, binding.nativePositions, `Native geometry changed: ${binding.name}`);
    const trim = binding.nativeTrim;
    const expectedUv = [trim.x / 60, (trim.x + trim.width) / 60,
        1 - (trim.y + trim.height) / 48, 1 - trim.y / 48];
    assert(binding.uvBounds.every((value, index) => Math.abs(value - expectedUv[index]) < 1e-6),
        `Native UV crop changed: ${binding.name}`);
    assert.deepEqual(binding.entry, manifest.assets.find(e => e.id === binding.cameo));
    assert(binding.nameVisible, `Dynamic name missing: ${binding.name}`);
    assert.equal(binding.gl, 0); assert(binding.ui.reservedBytes <= 16 * 1024 * 1024);
}

try {
    const cases = integrationSmoke ? [['yr-yuri', 'yr', 9, ['YABRCK', 'YAPOWR', 'INIT', 'LTNK']]]
        : loadingAndShield ? [['yr-allied', 'yr', 0, []], ['yr-soviet', 'yr', 5, []], ['yr-yuri', 'yr', 9, []]] : psychicRevealOnly ? [['yr-yuri', 'yr', 9, []]] : [
        ['yr-yuri', 'yr', 9, roots], ['ra2-allied-control', 'ra2', 0, ['GAPOWR', 'E1']],
        ['ra2-soviet-control', 'ra2', 5, ['NAPOWR', 'E2']],
    ];
    for (const [key, edition, country, checks] of cases) {
        const out = path.join(output, key), profile = path.join(out, 'profile');
        await fs.mkdir(profile, { recursive: true });
        await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: coreRoot }));
        app = await electron.launch({ executablePath: path.join(delivery.app, 'Contents/MacOS', delivery.executable),
            cwd: '/private/tmp', args: [], timeout: 60000,
            env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1',
                RA2_UI_RESOURCE_ROOT: delivery.resources, RA2_UI_REVIEW: '1', TMPDIR: out } });
        const page = await app.firstWindow(), result = { key, edition, country, bindings: [], status: 'RUNNING' };
        report.cases.push(result);
        page.on('pageerror', error => report.errors.push({ key, error: error.stack }));
        await page.locator(`[data-edition=${edition}]`).click({ timeout: 60000 });
        await page.waitForFunction(revision => window.__ra2debug?.uiArt?.revision === revision, delivery.uiRevision, { timeout: 90000 });
        assert.deepEqual(await page.evaluate(() => window.__ra2debug.uiArt.manifest), manifest);
        result.packaged = await app.evaluate(({ app }) => app.isPackaged); assert(result.packaged);
        await page.evaluate(({ edition, country }) => {
            const d = window.__ra2debug; d.generalOptions.graphics.hdEnabled.value = true;
            d.generalOptions.graphics.renderResolution.value = '1080p';
            const prefs = { _r_lastMap: (edition === 'yr' ? 'X' : '') + 'MP01T4.map', _r_lastMode: '1',
                _r_lastCountry: String(country), _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
                _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
                _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: country === 5 ? 0 : 5, co: 2, s: 3, t: 1 }, null, null, null, null]) };
            for (const [key, value] of Object.entries(prefs)) localStorage.setItem(`_edition:${edition}:${key}`, value);
        }, { edition, country });
        await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).click();
        await page.waitForFunction(() => window.__ra2debug.skirmishLobby);
        if (loadingAndShield && country === 9) {
            await page.evaluate(() => {
                const d = window.__ra2debug, root = d.mainMenuController.getCurrentScreen().rootController;
                const screen = [...root.screens.values()].find(s => s.gameLoader), loader = screen.gameLoader;
                window.__loadingFollowupScreen = screen;
                const original = loader.load, held = new Promise(resolve => { window.__releaseLoadingFollowup = resolve; });
                loader.load = async function(...args) {
                    const value = await original.apply(this, args); await held; loader.load = original; return value;
                };
                void d.skirmishLobby.startGame(1700000000000);
            });
            const background = page.locator('canvas[data-loading-backdrop]');
            await page.waitForFunction(() => document.querySelector('[data-loading-backdrop]')?.dataset.loadingSource === 'hd', undefined, { timeout: 90000 });
            result.loading = await background.evaluate(canvas => ({ source: canvas.dataset.loadingSource,
                id: canvas.dataset.loadingArtId, dimensions: [canvas.width, canvas.height],
                ui: window.__ra2debug.uiArt.metrics() }));
            assert.equal(result.loading.id, 'loading-background-yuri');
            assert(result.loading.ui.reservedBytes <= 16 * 1024 * 1024);
            await page.screenshot({ path: path.join(out, 'yuri-loading-hd.png') });
            const binding = manifest.assets.find(a => a.id === result.loading.id);
            result.loading.entry = binding;
            const hash = await page.evaluate(async file => {
                const bytes = await (await fetch(file)).arrayBuffer();
                return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
            }, `/local-ui/${manifest.revision}/${binding.file}`);
            assert.equal(hash, binding.sha256); result.loading.fetchedSha256 = hash;
            await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
            await page.waitForFunction(() => document.querySelector('[data-loading-backdrop]')?.dataset.loadingSource === 'original');
            await page.screenshot({ path: path.join(out, 'yuri-loading-original.png') });
            await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = true; });
            await page.waitForFunction(() => document.querySelector('[data-loading-backdrop]')?.dataset.loadingSource === 'hd');
            await page.evaluate(() => window.__releaseLoadingFollowup());
        } else await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
        await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
        result.startingUnits = await page.evaluate(() => window.__ra2debug.localPlayer.getOwnedObjects().map(u => u.name));
        await page.evaluate(() => {
            const d = window.__ra2debug;
            for (const bot of d.game.botManager.bots.values()) bot.onGameTick = () => {};
            const mcv = d.localPlayer.getOwnedObjects().find(u => u.name === 'PCV' || /MCV$/.test(u.name));
            if (!mcv) throw Error('Native starting construction vehicle was not found');
            d.actionsApi.orderUnits([mcv.id], 10);
        });
        await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.rules.constructionYard && u.buildStatus === 1));
        result.fixtures = await page.evaluate(({ edition, country, loadingAndShield, integrationSmoke }) => {
            const d = window.__ra2debug, g = d.game, p = d.localPlayer, base = p.getOwnedObjects().find(u => u.rules.constructionYard);
            g.mapShroudTrait.revealMap(p, g);
            const worker = g.getConstructionWorker(p), placed = [];
            const tiles = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t))
                .sort((a, b) => Math.hypot(a.rx - base.tile.rx, a.ry - base.tile.ry) - Math.hypot(b.rx - base.tile.rx, b.ry - base.tile.ry));
            const names = integrationSmoke
                ? ['YAPOWR', 'YABRCK', 'YAREFN', 'YAWEAP', 'YATECH', 'NAPSIS', 'YAGNTC', 'YAPPET', ...Array(8).fill('YAPOWR')]
                : loadingAndShield && country !== 9 ? country === 0
                ? ['GAPOWR', 'GAPILE', 'GAREFN', 'GAWEAP', 'GATECH', ...Array(6).fill('GAPOWR')]
                : ['NAPOWR', 'NAHAND', 'NAREFN', 'NAWEAP', 'NATECH', ...Array(6).fill('NAPOWR')]
                : edition === 'yr' ? ['YAPOWR', 'YABRCK', 'YAREFN', 'YAWEAP', 'YATECH', 'YAYARD',
                'NAPSIS', 'NACLON', 'GAFWLL', 'YAGGUN', 'YAPSYT', 'YAGRND', 'YAGNTC', 'YAPPET', 'NATBNK',
                ...Array(8).fill('YAPOWR')] : p.country.side === 0 ? ['GAPOWR', 'GAPILE'] : ['NAPOWR', 'NAHAND'];
            for (const name of names) {
                const tile = tiles.find(t => worker.canPlaceAt(name, t, { ignoreAdjacent: true, normalizedTile: true }));
                if (!tile) throw Error(`No legal ${name} foundation`);
                const units = worker.placeAt(name, tile, true); placed.push(...units.map(u => ({ name, id: u.id, tile: [tile.rx, tile.ry] })));
            }
            window.__yuriCameoFixtures = placed;
            if (edition === 'yr') for (const side of [0, 1, 4]) p.production.addStolenTech(side);
            return placed;
        }, { edition, country, loadingAndShield, integrationSmoke });
        await page.waitForFunction(() => window.__yuriCameoFixtures.every(f => {
            const u = window.__ra2debug.localPlayer.getOwnedObjects().find(u => u.id === f.id);
            return u?.buildStatus === 1;
        }), undefined, { timeout: 30000 });
        await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.hud.sidebarCard.props.sidebarModel.updateAvailableObjects(d.game.art); });
        result.available = await page.evaluate(() => window.__ra2debug.localPlayer.production.getAvailableObjects().map(r => r.name));
        assert(checks.every(name => result.available.includes(name)), `Missing eligible sidebar roots: ${checks.filter(n => !result.available.includes(n))}`);
        for (const name of checks) {
            const binding = await inspect(page, name); checkBinding(binding); result.bindings.push(binding);
        }
        await page.screenshot({ path: path.join(out, 'sidebar.png') });
        if (edition === 'yr') {
            result.powers = [];
            const powers = integrationSmoke
                ? ['ForceShieldSpecial', 'PsychicRevealSpecial', 'GeneticConverterSpecial', 'PsychicDominatorSpecial']
                : loadingAndShield ? ['ForceShieldSpecial'] : psychicRevealOnly ? ['PsychicRevealSpecial'] : ['PsychicRevealSpecial', 'ForceShieldSpecial', 'GeneticConverterSpecial', 'PsychicDominatorSpecial'];
            for (const name of powers) {
                const binding = await inspect(page, name); checkBinding(binding); result.powers.push(binding);
            }
            if ((psychicRevealOnly || loadingAndShield) && !combinedSmoke) {
                assert.equal(result.powers[0].entryId, loadingAndShield ? 'forcicon.shp' : 'psyricon.shp');
                const entry = result.powers[0].entry;
                result.fetchedSha256 = await page.evaluate(async file => {
                    const bytes = await (await fetch(file)).arrayBuffer();
                    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
                }, `/local-ui/${manifest.revision}/${entry.file}`);
                assert.equal(result.fetchedSha256, entry.sha256);
                result.peakUiBytes = result.powers[0].ui.reservedBytes;
                await page.screenshot({ path: path.join(out, loadingAndShield ? 'force-shield.png' : 'psychic-reveal.png') });
                await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
                await page.waitForFunction(() => window.__ra2debug.uiArt.metrics().reservedBytes === 0);
                result.off = await page.evaluate(() => window.__ra2debug.uiArt.metrics());
                const original = await inspect(page, powers[0], false);
                assert(!original.hd && original.originalVisible);
                await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = true; });
                result.reacquired = await inspect(page, powers[0]); checkBinding(result.reacquired);
                result.status = loadingAndShield ? 'PASS_COPIED_APP_FORCE_SHIELD_BINDING_OFF_ON' : 'PASS_COPIED_APP_PSYCHIC_REVEAL_BINDING_OFF_ON';
                await save(); await app.close(); app = undefined;
                continue;
            }
            await page.evaluate(() => {
                const d = window.__ra2debug, c = d.gameScreen.hud.sidebarCard;
                const state = d.helpers.getSidebarTechnoDebugStateByName('INIT');
                const item = c.props.sidebarModel.activeTab.items[state.itemIndex];
                for (let i = 0; i < 2; i++) c.props.onSlotClick(c.createSlotClickEvent(item, { button: 0, isTouch: false }));
            });
            await page.waitForFunction(() => {
                const d = window.__ra2debug, c = d.gameScreen.hud.sidebarCard, s = d.helpers.getSidebarTechnoDebugStateByName('INIT');
                return c.props.sidebarModel.activeTab.items[s.itemIndex].progress > 0;
            }, undefined, { timeout: 10000 });
            result.queued = await inspect(page, 'INIT'); checkBinding(result.queued);
            assert(result.queued.progress > 0 && result.queued.quantity >= 2 && result.queued.clockVisible && result.queued.quantityVisible);
            await page.screenshot({ path: path.join(out, 'queued-progress.png') });
            await page.evaluate(() => {
                const d = window.__ra2debug, c = d.gameScreen.hud.sidebarCard;
                const s = d.helpers.getSidebarTechnoDebugStateByName('YAPOWR'), item = c.props.sidebarModel.activeTab.items[s.itemIndex];
                c.props.onSlotClick(c.createSlotClickEvent(item, { button: 0, isTouch: false }));
            });
            await page.waitForFunction(() => {
                const d = window.__ra2debug, c = d.gameScreen.hud.sidebarCard;
                const s = d.helpers.getSidebarTechnoDebugStateByName('YABRCK');
                return c.props.sidebarModel.activeTab.items[s.itemIndex].disabled;
            }, undefined, { timeout: 10000 });
            result.disabled = await inspect(page, 'YABRCK'); checkBinding(result.disabled);
            assert(result.disabled.disabled && result.disabled.light === 0.5);
            await page.screenshot({ path: path.join(out, 'disabled-building.png') });
            await page.evaluate(() => {
                const d = window.__ra2debug, p = d.localPlayer;
                for (const name of ['YABRCK', 'YAWEAP', 'YAYARD']) {
                    const factory = p.getOwnedObjects().find(u => u.name === name)?.factoryTrait;
                    if (!factory) continue;
                    p.production.addVeteranType(factory.type);
                }
                d.gameScreen.hud.sidebarCard.props.sidebarModel.updateAvailableObjects(d.game.art);
            });
            result.alternates = [];
            const aliases = inventory.alternatePairs.filter(a => a.export && !a.status.startsWith('ACCEPTED'));
            for (const alias of combinedSmoke ? aliases.filter(a => a.runtimeTrainable).slice(0, 2) : aliases) {
                const nativeEntry = inventory.entries.find(e => e.member === alias.normal), name = nativeEntry.uses.find(n => !n.startsWith('YAREFN')) ?? nativeEntry.uses[0];
                const binding = await inspect(page, name); checkBinding(binding);
                if (alias.runtimeTrainable) { assert.equal(binding.cameo, alias.alternate); assert(binding.rankTexture); }
                else assert.equal(binding.cameo, alias.normal);
                result.alternates.push({ ...binding, nativeAlternate: alias.alternate, runtimeTrainable: alias.runtimeTrainable });
            }
            await page.screenshot({ path: path.join(out, 'ranked-sidebar.png') });
            result.rapidSwitch = await page.evaluate(async () => {
                const d = window.__ra2debug, c = d.gameScreen.hud.sidebarCard, m = c.props.sidebarModel, samples = [];
                for (let i = 0; i < 16; i++) {
                    m.selectTab(i % 4); c.scrollToOffset(0); c.updateSlots(m.activeTab.items, c.props.slots);
                    await new Promise(requestAnimationFrame);
                    samples.push({ tab: i % 4, visible: c.slotObjects.flatMap((o, slot) => o.get3DObject().visible
                        ? [{ hd: o.builder.isHdActive, id: o.builder.frames[o.builder.native.getFrame()]?.id,
                            target: c.publishedItems?.[slot]?.target.rules.name,
                            expected: c.publishedItems?.[slot]?.cameo + '.shp' }] : []), ui: d.uiArt.metrics() });
                }
                return samples;
            });
            assert(result.rapidSwitch.every(s => s.ui.reservedBytes <= 16 * 1024 * 1024));
            checkBinding(await inspect(page, 'INIT'));
            result.rapidSwitchTransientOriginal = result.rapidSwitch.some(s => s.visible.some(o => !o.hd));
            if (combinedSmoke) assert(result.rapidSwitch.every(sample => sample.visible.every(item =>
                item.target && item.id === item.expected && (!manifest.assets.some(asset => asset.id === item.id) || item.hd))));
            result.peerFixStatus = combinedSmoke ? 'PASS_COHERENT_RAPID_PUBLICATION' : 'NOT_CERTIFIED';
        } else {
            const ids = inventory.entries.filter(e => e.status === 'NEW_ART_REQUIRED').map(e => e.member);
            result.yuriLookupLeak = await page.evaluate(ids => {
                const names = window.__ra2debug.gameScreen.hud.sidebarCard.props.cameoNameToIdMap;
                return ids.filter(id => names.has(id));
            }, ids);
            assert.deepEqual(result.yuriLookupLeak, []);
        }
        const samples = [...result.bindings, ...(result.powers ?? []), ...(result.alternates ?? []),
            ...[result.queued, result.disabled].filter(Boolean), ...(result.rapidSwitch ?? [])];
        result.peakUiBytes = Math.max(...samples.map(sample => sample.ui.reservedBytes));
        await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
        await page.waitForFunction(() => window.__ra2debug.uiArt.metrics().reservedBytes === 0);
        result.off = await page.evaluate(() => window.__ra2debug.uiArt.metrics());
        const original = await inspect(page, checks[0], false); assert(!original.hd && original.originalVisible);
        await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = true; });
        checkBinding(await inspect(page, checks[0]));
        result.status = 'PASS_COPIED_APP_NATIVE_BINDINGS_AND_UI_STATES';
        await save(); await app.close(); app = undefined;
    }
    assert.deepEqual(report.errors, []);
    report.status = combinedSmoke ? 'PASS_COMBINED_E_RANK_POWERS_SIDEBAR_AND_LOADING'
        : integrationSmoke ? 'PASS_MAIN_E_FOCUSED_BINDINGS_AND_YURI_LOADING'
        : loadingAndShield ? 'PASS_NATIVE_THREE_FACTION_FORCE_SHIELD_AND_YURI_LOADING'
        : psychicRevealOnly ? 'PASS_NATIVE_PSYCHIC_REVEAL_INCREMENTAL' : 'PASS_NATIVE_YR_CAMEOS_AND_RA2_NEGATIVE_CONTROLS';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1; console.error(error);
} finally {
    if (app) await app.close(); await save(); console.log(report.status);
}
