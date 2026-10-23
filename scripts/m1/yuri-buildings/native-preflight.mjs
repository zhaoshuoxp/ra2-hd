// First focused native observations from the copied Task C app/resource root.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../allied-units/desktop-session.mjs';
import catalog from '../../../desktop/yuri-building-coverage.json' with { type: 'json' };

const density = Number(process.argv[4] ?? 4), snow = process.argv.includes('--snow');
const selected = process.argv.find(a => a.startsWith('--families='))?.slice(11);
const identities = selected ? selected.split(',') : [...new Set(Object.values(catalog).map(e => e.family))];
const session = await startSession(process.argv[2], process.argv[3], 'yr', snow,
    async ({ page, report }) => {
        report.options = await page.evaluate(density => {
            const d = window.__ra2debug, g = d.generalOptions.graphics;
            const before = { enabled: g.hdEnabled.value, density: g.hdDensity.value };
            g.hdEnabled.value = true; g.hdDensity.value = density;
            return { before, selected: density, trainer: d.generalOptions.trainer?.enabled?.value ?? false };
        }, density);
    }, async ({ page, report }) => {
        await page.locator('.country-select .select-value').first().click();
        const yuriIndex = await page.evaluate(() => window.__ra2debug.skirmishLobby.formModel.availablePlayerCountries.indexOf('YuriCountry'));
        assert(yuriIndex >= 0);
        await page.locator('.country-select .select-layer .option').nth(yuriIndex).click();
        await page.waitForFunction(() => window.__ra2debug.skirmishLobby.gameOpts.humanPlayers[0].countryId === 9);
        report.lobby = await page.evaluate(() => window.__ra2debug.skirmishLobby);
    });
const { page, report, stage, close } = session;
let failure;
try {
    report.boundary = 'Copied-resource native HD preflight; controlled legal fixtures followed by native recycler and superweapon actions. Complete four-session acceptance is pending.';
    report.families = {};
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.buildings = {};
        f.sampleBuilding = u => {
            const r = d.renderableManager.getRenderableByGameObject(u);
            const member = o => ({ member: o?.builder?.image?.filename, frame: o?.builder?.getFrame(),
                hd: o?.builder?.hdOverride?.identity, visible: o?.get3DObject().visible });
            return { name: u.name, id: u.id, tick: d.game.currentTick, owner: u.owner.name,
                color: u.owner.color, country: u.owner.country?.name, buildStatus: u.buildStatus,
                health: u.healthTrait.health, currentAnimType: r?.currentAnimType,
                main: member(r?.mainObj), bib: member(r?.bib),
                animations: r && [...r.animObjects].map(([type, objects]) => ({ type, members: objects.map(member) })) };
        };
        f.detailSize = [1000, 1000];
        f.visualTrace = [];
        f.visualTimer = setInterval(() => f.visualTrace.push(Object.values(f.buildings).map(f.sampleBuilding)), 100);
        for (let i = 0; i < 10; i++) f.building('YAPOWR');
    });
    for (const identity of identities) {
        await page.evaluate(identity => {
            const d = window.__ra2debug, f = window.__allied;
            const building = f.building(identity);
            f.actor = building; f.actors[building.id] = building; f.buildings[identity] = building;
            d.worldInteraction.minimapHandler.panToTile(building.tile);
        }, identity);
        await page.waitForFunction(({ identity, density }) => {
            const d = window.__ra2debug, f = window.__allied, r = d.renderableManager.getRenderableByGameObject(f.buildings[identity]);
            const builders = [r?.mainObj?.builder, r?.bib?.builder, ...[...(r?.animObjects.values() ?? [])].flat().map(o => o.builder)].filter(Boolean);
            const loaded = d.sovietUnitsHd.families[identity];
            return loaded?.status === 'READY' && builders.length && builders.every(b => b.hdOverride?.identity.endsWith('/' + loaded.density));
        }, { identity, density }, { timeout: 60000 });
        report.families[identity] = await page.evaluate(identity => ({ ...window.__allied.sampleBuilding(window.__allied.buildings[identity]), allocation: window.__ra2debug.sovietUnitsHd.families[identity] }), identity);
        await stage(identity + '-native-ready');
    }
    report.residency = await page.evaluate(() => window.__ra2debug.sovietUnitsHd);
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.recyclerUnit = f.spawn('INIT', 3, f.buildings.YAGRND.tile);
        f.recycleCredits = f.player.credits;
        f.recycleEvents = [];
        const dispatch = d.game.events.dispatch.bind(d.game.events);
        d.game.events.dispatch = event => {
            if (event.type === 43 || event.target === f.recyclerUnit) f.recycleEvents.push({ type: event.type, tick: d.game.currentTick, recycler: event.recycler?.name });
            return dispatch(event);
        };
        f.actor = f.buildings.YAGRND;
        d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        d.actionsApi.orderUnits([f.recyclerUnit.id], 8, f.actor.id);
    });
    await page.waitForFunction(() => !window.__allied.recyclerUnit.isSpawned, undefined, { timeout: 30000 });
    report.grinder = await page.evaluate(() => ({ creditsBefore: window.__allied.recycleCredits,
        creditsAfter: window.__allied.player.credits, events: window.__allied.recycleEvents,
        trace: window.__allied.visualTrace.flat().filter(s => s.name === 'YAGRND') }));
    await stage('YAGRND-native-intake');
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.actor = f.buildings.YAPPET;
        const sw = f.actor.superWeaponTrait.getSuperWeapon(f.actor); sw.chargeTicks = 120; sw.resumeTimer();
        d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
    });
    await page.waitForFunction(() => window.__allied.buildings.YAPPET.superWeaponTrait.getSuperWeapon(window.__allied.buildings.YAPPET).status === 2,
        undefined, { timeout: 25000 });
    await stage('YAPPET-native-charged');
    report.dominator = await page.evaluate(() => window.__allied.sampleBuilding(window.__allied.buildings.YAPPET));
    await page.evaluate(() => { clearInterval(window.__allied.visualTimer); });
    report.visualTrace = await page.evaluate(() => window.__allied.visualTrace);
    report.statusBoundary = 'PASS_ACTUAL_SELECTED_BINDINGS_ONLY';
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
