import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../allied-units/desktop-session.mjs';

const density = process.argv.includes('--2x') ? 2 : 4;
const yuri = process.argv.includes('--yuri');
const session = await startSession(process.argv[2], process.argv[3], 'yr', process.argv.includes('--snow'),
    async ({ page }) => page.evaluate(density => {
        window.__ra2debug.generalOptions.graphics.hdDensity.value = density;
    }, density),
    async ({ page }) => page.evaluate(yuri => {
        const d = window.__ra2debug;
        const store = d.uiArt, acquire = store.acquire;
        window.__sovietUiRequests = [];
        store.acquire = function (id, ready, ...rest) {
            const record = { id, present: this.manifest?.assets.some(a => a.id === id), enabled: this.enabled,
                reservedBefore: this.metrics().reservedBytes };
            window.__sovietUiRequests.push(record);
            const release = acquire.call(this, id, asset => { record.decoded = !!asset; ready(asset); }, ...rest);
            return () => { record.released = true; release(); };
        };
        const form = window.__ra2debug.mainMenuController.getCurrentScreen().buildFormProps();
        const country = yuri ? /Yuri/i : /Russian/i;
        form.onCountrySelect(form.availablePlayerCountries.find(name => country.test(name)), 0);
    }, yuri));
const { page, report, out, stage, close } = session;
let failure;
try {
    report.spawned = await page.evaluate(() => {
        const f = window.__allied;
        f.regressionBuildings = [];
        for (const name of ['NACNST', 'NAPOWR', 'NAHAND', 'NAREFN', 'NAWEAP', 'NARADR', 'NADEPT',
            'NATECH', 'NANRCT', 'NAPSIS', 'NALASR', 'NAFLAK', 'TESLA', 'NAIRON', 'NAMISL', 'NAINDP', 'NABNKR']) {
            const building = f.building(name); f.regressionBuildings.push(building);
        }
        f.regressionUnits = [];
        for (const name of ['E2', 'SHK', 'IVAN', 'BORIS', 'ENGINEER', 'DOG', 'DESO', 'TERROR'])
            f.regressionUnits.push(f.spawn(name, 3));
        for (const name of ['HTNK', 'APOC', 'V3', 'TTNK', 'HARV', 'DTRUCK', 'HTK', 'DRON', 'SCHP'])
            f.regressionUnits.push(f.spawn(name, 7));
        return [...f.regressionBuildings, ...f.regressionUnits].map(u => u.name);
    });
    await page.waitForFunction(() => Object.values(window.__ra2debug.sovietUnitsHd.families)
        .every(f => f.status !== 'LOADING_COMPLETE_FAMILY'), undefined, { timeout: 60000 });
    // Wait for the asynchronous queue, including bindings added on later frames.
    await page.waitForFunction(() => window.__allied.regressionBuildings.every(u => {
        const r = window.__ra2debug.renderableManager.getRenderableByGameObject(u);
        return r?.mainObj;
    }));
    await page.waitForTimeout(5000);
    report.sidebar = [];
    const tabs = await page.evaluate(() => window.__ra2debug.gameScreen.playerUi.sidebarModel.tabs.length);
    for (let tab = 0; tab < tabs; tab++) {
        const counts = await page.evaluate(tab => {
            const screen = window.__ra2debug.gameScreen, model = screen.playerUi.sidebarModel, card = screen.hud.sidebarCard;
            model.selectTab(tab);
            return { items: model.activeTab.items.length, slots: card.slotObjects.length };
        }, tab);
        for (let offset = 0; offset < counts.items; offset += counts.slots) {
            await page.evaluate(offset => {
                const screen = window.__ra2debug.gameScreen, card = screen.hud.sidebarCard;
                card.pagingOffset = offset; screen.playerUi.sidebarModel.activeTab.needsUpdate = true;
            }, offset);
            await page.waitForTimeout(1000);
            report.sidebar.push(await page.evaluate(() => {
                const d = window.__ra2debug, card = d.gameScreen.hud.sidebarCard;
                return { metrics: d.uiArt.metrics(), items: card.publishedItems.map((item, index) => ({
                    name: item.target?.rules?.name, cameo: item.cameo,
                    hd: card.slotObjects[index].isHdArtwork,
                })) };
            }));
        }
    }
    report.world = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        const sample = u => {
            const r = d.renderableManager.getRenderableByGameObject(u);
            return { name: u.name, allocation: d.sovietUnitsHd.families[u.name], sample: f.sample(u),
                bodyHd: !!r?.mainObj?.builder?.hdOverride, rhinoHd: !!r?.rhinoHd };
        };
        return { theater: d.theater.type, country: f.player.country.name,
            demand: d.sovietUnitsHd, buildings: f.regressionBuildings.map(sample), units: f.regressionUnits.map(sample),
            cache: d.preparedHdCache, ui: d.uiArt.metrics(), requests: window.__sovietUiRequests,
            rhino: { loaded: !!d.worldView.rhinoHd, parts: d.worldView.rhinoHd?.parts.size } };
    });
    await stage('soviet-mixed-roster');
    assert(report.world.buildings.every(b => b.bodyHd), 'A representative Soviet building fell back to Original');
    assert(report.world.units.every(u => u.sample.shpHd || u.sample.vxlHd || u.rhinoHd),
        'A representative Soviet unit fell back to Original');
    report.originalCameos = report.sidebar.flatMap(p => p.items.filter(item => !item.hd));
    report.boundary = 'Representative mixed roster in a fresh isolated copied-app profile; no claim about the user match. Five absent YR Soviet cameo identities retain existing Original fallback. No E artwork changed.';
    report.status = 'DIAGNOSED_REPRESENTATIVE_SOVIET_BINDINGS';
    assert.equal(await page.evaluate(() => window.__ra2debug.renderer.renderer.getContext().getError()), 0);
} catch (error) { failure = error; report.status = 'FAILED'; report.failure = error.stack; }
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await close(failure);
if (failure) throw failure;
console.log(report.status);
