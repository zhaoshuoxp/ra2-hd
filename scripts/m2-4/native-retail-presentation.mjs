// Incremental native checks for catalog publication, languages, names and result/hover text.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const [artifactArgument, outputArgument] = process.argv.slice(2);
const outlineOnly = process.argv.includes('--outline-only');
const shadowOnly = process.argv.includes('--shadow-only');
const incrementalLettering = outlineOnly || shadowOnly;
const letteringOnly = process.argv.includes('--lettering-only') || incrementalLettering;
const letteringTag = letteringOnly ? (await fs.readFile('src/gui/screen/game/component/ResultBannerLettering.tsx', 'utf8'))
    .match(/data-result-lettering="([^"]+)"/)[1] : undefined;
const shadowStyle = letteringTag === 'retail-gold-r5' ? { color: '#484438', spread: '1.2', blur: '1.4' }
    : { color: '#625e52', spread: '0.65', blur: '0.8' };
const out = path.resolve(outputArgument);
await fs.mkdir(out, { recursive: false });
const artifact = artifactArgument.endsWith('.json') ? JSON.parse(await fs.readFile(artifactArgument, 'utf8'))
    : { build: path.resolve(artifactArgument), resources: path.resolve('.local'), uiRoot: path.resolve('.local') };
const audit = JSON.parse(await fs.readFile('.artifacts/m2-4/retail-presentation-v1/audit.json', 'utf8'));
const json = async name => JSON.parse(await fs.readFile(`public/res/locale/${name}.json`, 'utf8'));
const lower = object => Object.fromEntries(Object.entries(object).map(([key, value]) => [key.toLowerCase(), value]));
const labels = async (edition, language) => ({ ...(await json(`retail-${edition}-${language}`)).labels, ...lower(await json(language)) });
const report = { status: 'RUNNING', artifact, cases: [], errors: [], disclosure: letteringOnly
    ? 'Targeted actual Electron/Mac checks from an isolated executable payload; no new app package is delivered. Two native outcomes cover 2X/4X lettering, v0.2, localized startup notice and release. Prior six-case tooltip/catalog/language and complete-family failure evidence is reused. Original maps/rules are unchanged; native asset destruction triggers the standard result path. Campaign slots remain standby.'
    : 'Actual Electron/Mac runtime. UI language controls reload the edition; edited names reach native simulation. Original map bytes and standard rules are used. A legal factory fixture and stopped AI isolate tooltip inspection; native asset destruction triggers the unmodified victory/defeat path. Campaign banner slots are retained as standby, not campaign execution.' };
if (incrementalLettering) {
    report.disclosure = (shadowOnly
        ? 'Incremental actual Mac 4X native outcome for a wider, stronger glyph shadow. Face geometry, thin edge, palette, all background/source pins and accepted startup notice are unchanged. '
        : 'Incremental actual Mac 4X native outcome for a glyph-stroke color-only correction. Font geometry, palette, gray shadow, all background/source pins and accepted startup notice are unchanged. ')
        + 'Reuse the prior two native 2X/4X cases, catalog/tooltip/fallback and release evidence. This run uses an isolated executable payload and does not create a new game package.';
    report.reusedNativeReceipt = '.artifacts/m2-4/result-lettering-r2-native-v2/report.json';
}
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const cases = {
    ra2: [
        { language: 'en-US', map: 'mp33u4.map', density: 4, victory: true },
        { language: 'zh-TW', map: 'mp26s6.map', density: 2, victory: false },
        { language: 'zh-CN', map: 'mp01t4.map', density: 4, victory: true },
    ],
    yr: [
        { language: 'en-US', map: 'dunepatr.map', density: 2, victory: false },
        { language: 'zh-TW', map: 'rushhr.map', density: 4, victory: true },
        { language: 'zh-CN', map: 'saharamimw.map', density: 4, victory: false },
    ],
};

async function inspectHover(page, row, targetId, kind) {
    row.hoverAttempts ??= [];
    const point = await page.evaluate(id => {
        const d = window.__ra2debug, target = d.game.getWorld().getAllObjects().find(object => object.id === id);
        const renderable = d.renderableManager.getRenderableByGameObject(target);
        const projected = renderable.getPosition().clone().project(d.worldScene.camera), viewport = d.worldScene.viewport;
        const canvas = d.renderer.getCanvas(), rect = canvas.getBoundingClientRect();
        const logicalWidth = Number(canvas.dataset.logicalWidth), logicalHeight = Number(canvas.dataset.logicalHeight);
        return { x: rect.x + (viewport.x + (projected.x + 1) * viewport.width / 2) * rect.width / logicalWidth,
            y: rect.y + (viewport.y + (1 - projected.y) * viewport.height / 2) * rect.height / logicalHeight };
    }, targetId);
    let found = false;
    for (const dy of (kind === 'factory' ? [35, 55, 15, 75, 0, -25] : [-12, -25, 0, 12])) {
        for (const dx of [0, 20, -20, 40]) {
            await page.mouse.move(point.x + dx, point.y + dy);
            await page.waitForTimeout(120);
            found = await page.evaluate(id => window.__ra2debug.worldInteraction.mapHoverHandler.getCurrentHover()?.entity?.gameObject?.id === id, targetId);
            row.hoverAttempts.push(await page.evaluate(({ point, dx, dy, kind }) => {
                const w = window.__ra2debug.worldInteraction, handler = w.mapHoverHandler;
                return { kind, point, offset: [dx, dy], pointer: w.pointer.getPosition(), active: handler.isActive,
                    hover: handler.getCurrentHover()?.entity?.gameObject?.id,
                    tile: handler.getCurrentHover()?.tile?.rx, documentFocus: document.hasFocus() };
            }, { point, dx, dy, kind }));
            await save();
            if (found) break;
        }
        if (found) break;
    }
    assert(found, `Pointer must hover the actual ${kind}`);
    await page.waitForFunction(() => window.__ra2debug.worldInteraction.tooltipHandler.tooltip?.texture, undefined, { timeout: 4000 });
    const hover = await page.evaluate(() => {
        const d = window.__ra2debug, tooltip = d.worldInteraction.tooltipHandler.tooltip, texture = tooltip.texture;
        window.__presentationHover = { texture, mesh: tooltip.mesh, textureDisposals: 0, geometryDisposals: 0 };
        texture.addEventListener('dispose', () => window.__presentationHover.textureDisposals++);
        tooltip.mesh.geometry.addEventListener('dispose', () => window.__presentationHover.geometryDisposals++);
        return { text: tooltip.text, raster: [texture.image.width, texture.image.height], ...texture.userData,
            pointer: tooltip.pointer.getPosition(), position: tooltip.mesh.position.toArray(), png: texture.image.toDataURL() };
    });
    assert(hover.rasterScale >= 2);
    assert.equal(hover.raster[0], hover.logicalWidth * hover.rasterScale);
    assert.equal(hover.raster[1], hover.logicalHeight * hover.rasterScale);
    const stem = `${row.edition}-${row.language}-${kind}`;
    await fs.writeFile(path.join(out, stem + '-texture.png'), Buffer.from(hover.png.split(',')[1], 'base64'));
    delete hover.png;
    await page.screenshot({ path: path.join(out, stem + '.png') });
    await page.mouse.move(300, 180);
    await page.waitForFunction(() => window.__presentationHover.textureDisposals === 1, undefined, { timeout: 4000 });
    const release = await page.evaluate(() => ({ texture: window.__presentationHover.textureDisposals,
        geometry: window.__presentationHover.geometryDisposals }));
    assert.deepEqual(release, { texture: 1, geometry: 1 });
    return { ...hover, release };
}

try {
    for (const edition of (process.argv.includes('--quick') || incrementalLettering ? ['ra2'] : ['ra2', 'yr'])) {
        const profile = path.join(out, `profile-${edition}`);
        await fs.mkdir(profile);
        await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: artifact.resources }));
        const app = await electron.launch({ executablePath: artifact.app ? path.join(artifact.app, 'Contents/MacOS/RA2 HD Editions')
            : await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
            args: artifact.app ? [] : [artifact.build], cwd: '/private/tmp', timeout: 60000,
            env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1', RA2_UI_RESOURCE_ROOT: artifact.uiRoot } });
        let page;
        let previousSavedName;
        try {
            page = await app.firstWindow();
            page.on('pageerror', error => report.errors.push(error.stack));
            if (letteringOnly) await page.addInitScript(() => {
                window.__startupPresentation = [];
                new MutationObserver(() => {
                    const left = document.querySelector('[data-startup-disclaimer]');
                    const right = document.querySelector('[data-startup-copyright]');
                    if (!left?.textContent || !right?.textContent) return;
                    const rows = window.__startupPresentation;
                    if (rows.at(-1)?.disclaimer === left.textContent && rows.at(-1)?.copyright === right.textContent) return;
                    rows.push({ disclaimer: left.textContent, copyright: right.textContent,
                        left: left.getBoundingClientRect().toJSON(), right: right.getBoundingClientRect().toJSON() });
                }).observe(document, { childList: true, subtree: true, characterData: true });
            });
            await page.locator(`[data-edition=${edition}]`).click({ timeout: 60000 });
            await page.waitForFunction(() => window.__ra2debug?.mainMenuController && document.querySelector('.hd-menu-scene'), undefined, { timeout: 90000 });
            const selectedCases = incrementalLettering ? [{ ...cases.ra2[0], language: 'zh-TW', density: 4 }]
                : letteringOnly ? [{ ...(edition === 'ra2' ? cases.ra2[2] : cases.yr[0]),
                density: edition === 'ra2' ? 2 : 4 }]
                : process.argv.includes('--quick') ? cases[edition].slice(0, 1) : cases[edition];
            for (const item of selectedCases) {
                const row = { edition, ...item };
                report.cases.push(row); await save();
                const currentLanguage = await page.evaluate(() => document.documentElement.lang);
                const current = await labels(edition, currentLanguage), text = await labels(edition, row.language);
                await page.evaluate(() => window.__ra2debug.mainMenuController.goToScreenBlocking(16));
                await page.locator('[data-language-options] .select-value').click();
                assert.equal(await page.locator('[data-language-options] .option').count(), 3);
                const languageLabel = row.language === 'en-US' ? 'English' : current[row.language === 'zh-CN' ? 'hd:chinese' : 'hd:traditionalchinese'];
                await page.locator('[data-language-options] .select-layer').getByText(languageLabel, { exact: true }).click();
                await page.waitForFunction(language => document.documentElement.lang === language
                    && window.__ra2debug?.mainMenuController && document.querySelector('.hd-menu-scene'), row.language, { timeout: 90000 });
                if (letteringOnly) {
                    await page.waitForFunction(() => document.querySelector('.menu-version-string')?.textContent.trim() === 'v0.2',
                        undefined, { timeout: 15000 });
                    row.version = (await page.locator('.menu-version-string').textContent()).trim();
                    assert.equal(row.version, 'v0.2');
                    assert((await page.title()).includes('v0.2'));
                    row.splash = await page.evaluate(() => window.__startupPresentation.at(-1));
                    assert(row.splash?.disclaimer.includes('Chrono Divide'));
                    assert.equal(row.splash.disclaimer.replaceAll('\n', ''), text['ts:disclaimer'].replaceAll('\n', ''));
                    assert(row.splash.copyright.includes('v0.2'));
                    assert(row.splash.left.right <= row.splash.right.left);
                }
                row.home = `${edition}-${row.language}-home.png`;
                await page.screenshot({ path: path.join(out, `${edition}-${row.language}-home.png`) });
                await page.evaluate(({ edition, row, letteringOnly }) => {
                    const graphics = window.__ra2debug.generalOptions.graphics;
                    graphics.hdEnabled.value = true; graphics.hdDensity.value = row.density;
                    graphics.renderResolution.value = row.density === 4 ? '4k' : letteringOnly ? '1080p' : 'native';
                    const bots = Array(8).fill(null); bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
                    const values = { _r_lastMap: row.map, _r_lastMode: '1', _r_lastCountry: '0', _r_lastColor: '1',
                        _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
                        _r_lastBots: JSON.stringify(bots) };
                    if (!localStorage.getItem(`_edition:${edition}:_r_originalCatalogOrder_v1`)) values._r_lastSortMap = 'nameAsc';
                    for (const [key, value] of Object.entries(values)) localStorage.setItem(`_edition:${edition}:${key}`, value);
                    return window.__ra2debug.mainMenuController.goToScreenBlocking(1);
                }, { edition, row, letteringOnly });
                await page.waitForFunction(() => window.__ra2debug.skirmishLobby, undefined, { timeout: 60000 });
                const input = page.locator('input.player-name');
                row.previousName = await input.inputValue();
                if (previousSavedName) assert.equal(row.previousName, previousSavedName);
                const name = row.language === 'en-US' ? `${edition.toUpperCase()} Commander` : `${edition.toUpperCase()} 指挥官`;
                await input.fill('  ' + name + '  '); await input.press('Tab');
                assert.equal(await input.inputValue(), name);
                previousSavedName = name;
                assert.equal(await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts.humanPlayers[0].name), name);
                await page.getByRole('button', { name: text['gui:choosemap'], exact: true }).click();
                await page.waitForSelector('.map-list .list-item');
                const published = await page.evaluate(() => {
                    const screen = window.__ra2debug.mainMenuController.screens.get(1);
                    return screen.mapList.getAll().map(map => ({ fileName: map.fileName,
                        title: map.getFullMapTitle(screen.strings), maxSlots: map.maxSlots }));
                });
                const expected = audit.records.find(record => record.edition === edition).rows
                    .filter(row => row.status === 'VISIBLE_ORIGINAL_CATALOG').map(row => row.filename.toLowerCase());
                assert.deepEqual(published.map(map => map.fileName.toLowerCase()), expected);
                assert.equal(await page.locator('.map-list .list-item').count(), expected.length);
                assert.deepEqual((await page.locator('.map-list .list-item').allTextContents()).map(value => value.trim()),
                    published.map(map => map.title));
                row.catalog = { count: published.length, maps: published };
                await page.screenshot({ path: path.join(out, `${edition}-${row.language}-maps.png`) });
                await page.getByRole('button', { name: text['gui:usemap'], exact: true }).click();
                await page.waitForSelector('input.player-name');
                assert.equal(await input.inputValue(), name);
                await page.screenshot({ path: path.join(out, `${edition}-${row.language}-lobby.png`) });
                await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
                await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
                row.initial = await page.evaluate(() => {
                    const d = window.__ra2debug, g = d.game;
                    for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
                    g.mapShroudTrait.revealMap(d.localPlayer, g);
                    const mcv = d.localPlayer.getOwnedObjects().find(object => /MCV$/.test(object.name));
                    const worker = g.getConstructionWorker(d.localPlayer), center = mcv.tile;
                    const tile = g.map.tiles.getAll().filter(tile => g.map.isWithinBounds(tile)
                        && worker.canPlaceAt('GACNST', tile, { normalizedTile: true, ignoreAdjacent: true }))
                        .sort((a, b) => Math.hypot(a.rx - center.rx, a.ry - center.ry) - Math.hypot(b.rx - center.rx, b.ry - center.ry))[0];
                    const factory = g.createObject(2, 'GACNST');
                    g.changeObjectOwner(factory, d.localPlayer); g.spawnObject(factory, tile);
                    window.__presentationOld = { terrain: d.terrainHd, environment: d.environmentHd, tick: g.currentTick };
                    return { map: g.gameOpts.mapName, mapTitle: g.gameOpts.mapTitle, name: d.localPlayer.name,
                        mode: g.gameModeType, credits: g.gameOpts.credits, maxSlots: g.gameOpts.maxSlots,
                        players: g.getCombatants().length, tick: g.currentTick, mcv: mcv.id, factory: factory.id,
                        strings: ['TXT_VICTORIOUS', 'TXT_LOST', 'Name:GACNST'].map(key => d.gameScreen.strings.get(key)) };
                });
                await save();
                assert.equal(row.initial.name, name);
                assert.equal(row.initial.map.toLowerCase(), row.map);
                assert.equal(row.initial.mode, 0); assert.equal(row.initial.credits, 10000);
                assert(row.initial.players <= row.initial.maxSlots);
                await page.waitForFunction(tick => window.__ra2debug.game.currentTick >= tick + 12, row.initial.tick);
                if (!letteringOnly) {
                    row.factoryHover = await inspectHover(page, row, row.initial.factory, 'factory');
                    row.unitHover = await inspectHover(page, row, row.initial.mcv, 'mcv');
                    assert.equal(row.factoryHover.text, text['name:gacnst']);
                }
                await page.evaluate(victory => {
                    const d = window.__ra2debug, g = d.game;
                    const losers = victory ? g.getCombatants().filter(player => player !== d.localPlayer) : [d.localPlayer];
                    for (const player of losers) for (const object of [...player.getOwnedObjects()]) g.destroyObject(object, undefined, true);
                }, row.victory);
                await page.waitForSelector(`[data-game-result-banner=${row.victory ? 'victory' : 'defeat'}]`, { timeout: 15000 });
                await page.waitForFunction(() => document.querySelector('[data-game-result-banner] canvas')?.hidden === false, undefined, { timeout: 3500 });
                row.result = await page.evaluate(() => {
                    const d = window.__ra2debug, banner = document.querySelector('[data-game-result-banner]'), canvas = banner.querySelector('canvas');
                    return { text: banner.textContent, purpose: banner.dataset.resultPurpose, source: canvas.dataset.resultSource,
                        pixels: [canvas.width, canvas.height], ui: d.uiArt.metrics(), gameStatus: d.game.status,
                        defeated: d.localPlayer.defeated, rect: banner.querySelector('svg').getBoundingClientRect().toJSON(),
                        lettering: banner.querySelector('svg').dataset.resultLettering,
                        svg: banner.querySelector('svg').outerHTML };
                });
                assert.equal(row.result.text, text[row.victory ? 'txt_victorious' : 'txt_lost']);
                assert.equal(row.result.purpose, 'skirmish');
                assert(row.result.pixels[0] >= 872);
                assert(row.result.ui.reservedBytes <= row.result.ui.budget);
                row.capture = `${edition}-${row.language}-result.png`;
                await page.screenshot({ path: path.join(out, row.capture) });
                if (letteringOnly) {
                    assert.equal(row.result.lettering, letteringTag);
                    if (outlineOnly) assert(row.result.svg.includes('stroke="#303024"') && row.result.svg.includes('flood-color="#808080"'));
                    if (shadowOnly) assert(row.result.svg.includes('stroke="#303024"') && row.result.svg.includes(`flood-color="${shadowStyle.color}"`)
                        && row.result.svg.includes(`radius="${shadowStyle.spread}"`) && row.result.svg.includes(`stdDeviation="${shadowStyle.blur}"`));
                    assert.equal(row.result.pixels[0], 436 * row.density);
                    row.crop = `${edition}-${row.language}-result-crop.png`;
                    await page.locator('[data-game-result-banner] svg').screenshot({ path: path.join(out, row.crop) });
                }
                if (row.language === 'en-US' && !letteringOnly) {
                    await page.evaluate(edition => {
                        const art = window.__ra2debug.uiArt;
                        window.__resultReader = art.readEnabled;
                        window.__resultFetch = window.fetch;
                        if (edition === 'ra2') art.readEnabled = () => false;
                        else window.fetch = (input, options) => String(input).endsWith('result-victory-hd-v1-2x.png')
                            ? Promise.resolve(new Response(new Uint8Array([1, 2, 3]))) : window.__resultFetch(input, options);
                        art.changed();
                    }, edition);
                    const expectedState = edition === 'ra2' ? 'original' : 'unavailable';
                    await page.waitForFunction(state => document.querySelector('[data-game-result-banner] canvas')?.dataset.resultState === state,
                        expectedState, { timeout: 1800 });
                    row.fallback = await page.evaluate(() => {
                        const banner = document.querySelector('[data-game-result-banner]'), canvas = banner.querySelector('canvas');
                        return { state: canvas.dataset.resultState, hidden: canvas.hidden, text: banner.textContent,
                            reservations: [...window.__ra2debug.uiArt.surfaces.keys()]
                                .filter(owner => owner.dataset?.uiArt === 'localized-result-banner').length };
                    });
                    assert(row.fallback.hidden && row.fallback.reservations === 0);
                    assert.equal(row.fallback.text, row.result.text);
                    await page.screenshot({ path: path.join(out, `${edition}-${row.language}-result-fallback.png`) });
                    await page.evaluate(() => {
                        window.fetch = window.__resultFetch;
                        window.__ra2debug.uiArt.readEnabled = window.__resultReader;
                        window.__ra2debug.uiArt.changed();
                    });
                }
                await page.waitForSelector('.score-scene', { timeout: 15000 });
                row.release = await page.evaluate(() => ({ terrain: { disposed: window.__presentationOld.terrain.disposed,
                    worldChargeBytes: window.__presentationOld.terrain.worldChargeBytes },
                    environment: { disposed: window.__presentationOld.environment.disposed,
                        worldChargeBytes: window.__presentationOld.environment.worldChargeBytes }, ui: window.__ra2debug.uiArt.metrics(),
                    resultCanvases: document.querySelectorAll('[data-game-result-banner]').length,
                    resultReservations: [...window.__ra2debug.uiArt.surfaces.keys()]
                        .filter(owner => owner.dataset?.uiArt === 'localized-result-banner').length }));
                assert(row.release.terrain.disposed && row.release.terrain.worldChargeBytes === 0);
                assert(row.release.environment.disposed && row.release.environment.worldChargeBytes === 0);
                assert.equal(row.release.resultCanvases, 0);
                assert.equal(row.release.resultReservations, 0);
                await page.screenshot({ path: path.join(out, `${edition}-${row.language}-score.png`) });
                await page.evaluate(() => window.__ra2debug.mainMenuController.goToScreenBlocking(0));
                row.status = 'PASS'; await save();
                console.log(`${edition}/${row.language}: PASS ${letteringOnly
                    ? `${row.density}X native lettering, v0.2, startup notice and release`
                    : 'original catalog, name, native tooltips, result and release'}`);
            }
        } catch (error) {
            report.failure = error.stack;
            if (page) {
                report.failurePage = await page.evaluate(() => document.body.innerText.slice(-5000)).catch(() => 'unavailable');
                await page.screenshot({ path: path.join(out, `${edition}-failure.png`) }).catch(() => {});
            }
            throw error;
        } finally { await app.close(); }
    }
    assert.deepEqual(report.errors, []);
    report.status = shadowOnly ? 'PASS_INCREMENTAL_NATIVE_SHADOW_4X_AND_ACCEPTED_STARTUP'
        : outlineOnly ? 'PASS_INCREMENTAL_NATIVE_OUTLINE_4X_AND_ACCEPTED_STARTUP'
        : letteringOnly ? 'PASS_NATIVE_RESULT_LETTERING_BOTH_DENSITIES_AND_V02'
        : 'PASS_NATIVE_CATALOG_LANGUAGES_NAMES_TOOLTIPS_RESULTS';
} catch (error) { report.status = 'FAIL'; report.failure ??= error.stack; process.exitCode = 1; console.error(error); }
await save();
console.log(JSON.stringify({ status: report.status, cases: report.cases.length }));
