// Native legal fixtures in the copied package, followed by genuine owner changes and orders.
import assert from 'node:assert/strict';
import { startSession } from './desktop-session.mjs';

const [receipt, output, edition = 'yr', densityArg = '4', theater = 'temperate'] = process.argv.slice(2);
const density = Number(densityArg);
const session = await startSession(receipt, output, edition, theater === 'snow', async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true; graphics.hdDensity.value = density;
    }, density);
});
const { page, report, stage, close } = session;
let failure;
try {
    report.density = density;
    report.country = await page.evaluate(() => ({ name: window.__ra2debug.localPlayer.country.name,
        id: window.__ra2debug.localPlayer.country.id, side: window.__ra2debug.localPlayer.country.side }));
    const names = edition === 'yr'
        ? ['INIT', 'BRUTE', 'VIRUS', 'YURIPR', 'YURI', 'CCOMAND', 'PTROOP', 'CIVAN', 'YENGINEER',
            'LTNK', 'YHVR', 'PCV', 'SMIN', 'YTNK', 'TELE', 'CAOS', 'BSUB', 'MIND', 'DISK']
        : ['YURIPR', 'YURI', 'ENGINEER', 'LTNK'];
    await page.evaluate(names => {
        const d = window.__ra2debug, f = window.__allied;
        const infantry = new Set(['INIT', 'BRUTE', 'VIRUS', 'YURIPR', 'YURI', 'CCOMAND', 'PTROOP', 'CIVAN', 'YENGINEER', 'ENGINEER']);
        const ore = d.game.map.tiles.getAll().filter(t => d.game.map.getObjectsOnTile(t).some(o => o.isOverlay() && o.isTiberium()));
        const minerSite = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t) && !t.rampType
            && d.game.map.getTileZone(t) === 0).sort((a, b) =>
            Math.min(...ore.map(o => Math.hypot(b.rx - o.rx, b.ry - o.ry)))
            - Math.min(...ore.map(o => Math.hypot(a.rx - o.rx, a.ry - o.ry))))[0];
        f.combined = names.map(name => f.spawn(name, infantry.has(name) ? 3 : 7,
            name === 'SMIN' ? minerSite : { rx: f.center.rx - 6, ry: f.center.ry - 6 }));
        for (const u of f.combined) u.attackTrait?.setDisabled(true);
        f.controls = [f.spawn('E2', 3), f.spawn('MTNK', 7), f.spawn('TTNK', 7)];
        f.buildingControls = [f.building('GAPOWR'), f.building('NAPOWR')];
        d.worldInteraction.minimapHandler.panToTile(f.center);
    }, names);
    if (edition === 'yr') await page.waitForFunction(() => {
        const f = window.__allied;
        return f.combined.every(u => {
            const s = f.sample(u); return s.shpHd || s.vxlHd;
        });
    }, undefined, { timeout: 45000 });
    else await page.waitForFunction(() => {
        const f = window.__allied; return f.sample(f.combined.find(u => u.name === 'YURI')).shpHd;
    }, undefined, { timeout: 45000 });
    report.bindings = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        return f.combined.map(u => {
            const r = d.renderableManager.getRenderableByGameObject(u), builder = r?.shpRenderable?.builder;
            return { ...f.sample(u), owner: u.owner.name, ownerColor: u.owner.color,
                shpIdentity: builder?.hdOverride?.identity, nativeImage: builder?.shpFile?.filename,
                nativeShadow: builder?.hasShadow, vxlIdentity: r?.unitVxlHd?.family?.identity };
        });
    });
    if (edition === 'ra2') {
        assert(report.bindings.find(u => u.name === 'YURIPR').shpHd === false);
        assert(report.bindings.find(u => u.name === 'LTNK').vxlHd === false);
        assert(report.bindings.find(u => u.name === 'YURI').shpHd);
        report.editionIsolation = 'PASS_NO_YR_HERO_OR_VEHICLE_BINDING';
    } else {
        report.minerNativeTrace = await page.evaluate(() => window.__allied.traces.flat().filter(s => s.name === 'SMIN'));
        assert(report.minerNativeTrace.some(s => s.vxlHd), 'Mobile native miner must actually bind HD before deployment');
        for (const name of names.filter(n => n !== 'SMIN')) {
            const row = report.bindings.find(u => u.name === name); assert(row.shpHd || row.vxlHd, name);
        }
        report.allocations = await page.evaluate(() => window.__ra2debug.sovietUnitsHd);
        for (const name of ['INIT', 'BRUTE', 'VIRUS', 'YURIPR', 'LTNK', 'YHVR', 'PCV', 'SMIN', 'YTNK', 'TELE', 'CAOS', 'BSUB', 'MIND', 'DISK'])
            assert.equal(report.allocations.families[name].density, density, name);
    }
    await stage('mixed-native-bindings');
    if (edition === 'yr') {
        report.ownerChanges = [];
        const colors = await page.evaluate(() => {
            const all = [...window.__ra2debug.game.rules.colors.entries()].map(([name, c]) => ({ name, rgb: [c.r, c.g, c.b] }));
            return [all.find(c => c.rgb[2] > c.rgb[0] && c.rgb[2] > c.rgb[1]),
                all.find(c => c.rgb[0] > c.rgb[1] && c.rgb[2] > c.rgb[1]),
                all.find(c => c.rgb[1] > c.rgb[0] && c.rgb[1] > c.rgb[2])];
        });
        assert(colors.every(Boolean), 'Three existing native non-red colors are required');
        for (const { name: colorName, rgb } of colors) {
            await page.evaluate(colorName => {
                const d = window.__ra2debug, f = window.__allied;
                f.enemy.color = d.game.rules.colors.get(colorName);
                for (const u of f.combined) if (u.isSpawned) {
                    d.game.changeObjectOwner(u, f.player); d.game.changeObjectOwner(u, f.enemy);
                }
            }, colorName);
            await page.waitForTimeout(200);
            await stage('owner-' + rgb.join('-'));
            report.ownerChanges.push({ colorName, rgb, samples: await page.evaluate(() => window.__allied.combined
                .filter(u => u.isSpawned).map(window.__allied.sample)), disclosure: 'Existing native color, disabled fixture attacks, and native owner-change event; no color definitions or gameplay rules modified.' });
        }
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            for (const u of f.combined) if (u.isSpawned) d.game.changeObjectOwner(u, f.player);
        });
    }
    if (edition === 'yr') {
        report.beforeRelease = await page.evaluate(() => window.__ra2debug.sovietUnitsHd.gpuBytes);
        report.beforeReleaseGame = await page.evaluate(() => ({ status: window.__ra2debug.game.status,
            tick: window.__ra2debug.game.currentTick, players: window.__ra2debug.game.getCombatants().map(p =>
                ({ name: p.name, defeated: p.defeated, objects: p.getOwnedObjects().length })) }));
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            for (const unit of [...f.combined, ...f.controls, ...f.buildingControls]) if (unit.isSpawned) d.game.unspawnObject(unit);
        });
        await page.waitForTimeout(1000);
        await page.evaluate(() => {
            const f = window.__allied;
            f.evictionProbe = f.spawn('V3', 7);
            window.__ra2debug.worldInteraction.minimapHandler.panToTile(f.evictionProbe.tile);
        });
        await stage('eviction-probe-created');
        report.probeGame = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            return { status: d.game.status, tick: d.game.currentTick,
                renderable: !!d.renderableManager.getRenderableByGameObject(f.evictionProbe), sample: f.sample(f.evictionProbe) };
        });
        await page.waitForFunction(() => window.__allied.sample(window.__allied.evictionProbe).vxlHd
            || window.__allied.sample(window.__allied.evictionProbe).shpHd);
        report.afterRelease = await page.evaluate(() => window.__ra2debug.sovietUnitsHd.gpuBytes);
        assert(report.afterRelease < report.beforeRelease, 'Unit demand must release unused resources');
    }
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
