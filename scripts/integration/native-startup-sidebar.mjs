import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/yuri-units/desktop-session.mjs';

const [receipt, output, country = '9', density = '2', delay = '0'] = process.argv.slice(2);
assert(['0', '5', '9'].includes(country));
assert(['1', '2', '4'].includes(density));
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.waitForFunction(() => window.__ra2debug?.uiArt);
    await page.evaluate(({ density, delay, country }) => {
        const d = window.__ra2debug;
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
            if (key.endsWith(':_r_lastCountry')) value = country;
            if (key.endsWith(':_r_hostOpts')) value = value.replace('6;10000;0;', '6;10000;6;');
            return setItem.call(this, key, value);
        };
        d.generalOptions.graphics.hdDensity.value = density;
        d.generalOptions.graphics.hdEnabled.value = density !== '1';
        window.__startupCheck = { frames: [], artwork: [], sidebar: [] };
        const store = d.uiArt, acquire = store.acquire.bind(store);
        store.acquire = (id, ready, immediate) => {
            const before = store.metrics();
            return acquire(id, asset => {
                window.__startupCheck.artwork.push({ id, ready: !!asset, before, at: performance.now() });
                ready(asset);
            }, immediate);
        };
        if (delay) {
            const fetchOriginal = window.fetch.bind(window);
            window.fetch = async (...args) => {
                if (String(args[0]).includes('/local-ui/') && String(args[0]).endsWith('.png'))
                    await new Promise(resolve => setTimeout(resolve, delay));
                return fetchOriginal(...args);
            };
        }
        const install = renderer => {
            if (!renderer || renderer.__startupInstrumented) return;
            renderer.__startupInstrumented = true;
            const render = renderer.render.bind(renderer);
            renderer.render = () => {
                render();
                const state = window.__startupCheck;
                if (!d.game || !renderer.getScenes().includes(d.worldScene)) return;
                if (state.frames.length < 180) {
                    const units = d.localPlayer.getOwnedObjects().filter(o => o.isUnit()).map(unit => {
                        const r = d.renderableManager.getRenderableByGameObject(unit);
                        return { name: unit.name, id: unit.id, vxl: !!r?.unitVxlHd?.active,
                            shp: !!r?.shpRenderable?.builder?.hdOverride, rhino: !!r?.rhinoHd?.active };
                    });
                    state.frames.push({ tick: d.game.currentTick, at: performance.now(), units });
                    if (state.frames.length === 1) state.firstImage = renderer.getCanvas().toDataURL();
                }
                if (state.traceSidebar && state.sidebar.length < 150) {
                    const card = d.gameScreen.hud.sidebarCard;
                    state.sidebar.push({ at: performance.now(), offset: card.pagingOffset,
                        items: card.publishedItems.map((item, i) => ({ name: item.target.rules.name,
                            cameo: item.cameo, hd: card.slotObjects[i].isHdArtwork,
                            label: card.nameObjects[i].getUiObject().get3DObject().visible })),
                        pending: !!card.cancelPreparation, budget: store.metrics() });
                }
            };
        };
        let renderer = d.renderer;
        Object.defineProperty(d, 'renderer', { configurable: true, get: () => renderer,
            set: value => { renderer = value; install(value); } });
        install(renderer);
    }, { density: Number(density), delay: Number(delay), country });
}, async ({ page }) => {
    // Reapply after the edition GUI finishes restoring its saved preferences.
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdDensity.value = Number(density);
        graphics.hdEnabled.value = density !== '1';
    }, density);
});
try {
    await session.page.waitForFunction(() => window.__startupCheck.frames.length >= 90);
    await session.page.evaluate(() => {
        const d = window.__ra2debug;
        const buildings = {
            0: ['GACNST', 'GAPOWR', 'GAREFN', 'GAPILE', 'GAWEAP', 'GATECH'],
            5: ['NACNST', 'NAPOWR', 'NAREFN', 'NAHAND', 'NAWEAP', 'NATECH'],
            9: ['YACNST', 'YAPOWR', 'YAREFN', 'YABRCK', 'YAWEAP', 'YATECH'],
        };
        for (const name of buildings[d.localPlayer.country.id])
            window.__allied.building(name);
    });
    await session.page.waitForTimeout(1500);
    for (const tab of [2, 3, 1, 0]) {
        await session.page.evaluate(tab => window.__ra2debug.gameScreen.sidebarModel.selectTab(tab), tab);
        await session.page.waitForTimeout(900);
    }
    await session.page.evaluate(() => {
        const d = window.__ra2debug;
        window.__startupCheck.traceSidebar = true;
        d.trainer.setEnabled(true);
        if (!d.trainer.send({ type: 'effect', effect: 'technology', enabled: true })) throw Error('Trainer command rejected');
    });
    await session.page.waitForTimeout(5000);
    await session.page.screenshot({ path: path.join(session.out, 'technology-no-scroll.png') });
    const snapshot = await session.page.evaluate(() => {
        const d = window.__ra2debug, state = window.__startupCheck;
        const reports = ['DiskDrain', 'BlimpBomb', 'DiskLaser'].map(name => ({ name,
            rules: d.game.rules.getWeapon(name) }));
        return { ...state, sound: reports.map(({name, rules}) => ({name, report: rules.report})),
            country: d.localPlayer.country.id, graphics: d.generalOptions.graphics.hdDensity.value };
    });
    if (snapshot.firstImage) {
        await fs.writeFile(path.join(session.out, 'first-visible.png'), Buffer.from(snapshot.firstImage.split(',')[1], 'base64'));
        delete snapshot.firstImage;
    }
    await fs.writeFile(path.join(session.out, 'first-frame-sidebar.json'), JSON.stringify(snapshot, null, 2));
    session.report.observation = path.join(session.out, 'first-frame-sidebar.json');
    assert.equal(snapshot.country, Number(country));
    const starting = snapshot.frames[0].units;
    assert(starting.length > 1, 'A native initial army is required');
    const hd = unit => unit.vxl || unit.shp || unit.rhino;
    assert(starting.every(unit => hd(unit) === (density !== '1')), 'Initial units must use the selected graphics in the first draw');
    const ids = new Set(starting.map(unit => unit.id));
    assert(snapshot.frames.every(frame => frame.units.filter(unit => ids.has(unit.id))
        .every(unit => hd(unit) === (density !== '1'))), 'Initial graphics must remain stable');
    const finalItems = snapshot.sidebar.at(-1).items;
    assert.equal(finalItems.length, 24);
    assert(finalItems.every(item => item.hd === (density !== '1') && item.label === (density !== '1')),
        'All-technology cameos and labels must settle without scrolling');
    assert(snapshot.sidebar.every(frame => frame.offset === 0 && frame.budget.reservedBytes <= frame.budget.budget));
    assert.deepEqual(snapshot.sound[0].report, ['KirovAttack']);
    assert.deepEqual(snapshot.sound[0].report, snapshot.sound[1].report);
    session.report.firstDrawUnits = starting;
    session.report.sound = snapshot.sound;
    session.report.noScrollItems = finalItems;
    await session.page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
    await session.page.waitForFunction(() => window.__ra2debug.uiArt.metrics().reservedBytes === 0);
    session.report.uiAfterOff = await session.page.evaluate(() => window.__ra2debug.uiArt.metrics());
    await session.close();
} catch (error) { await session.close(error); throw error; }
