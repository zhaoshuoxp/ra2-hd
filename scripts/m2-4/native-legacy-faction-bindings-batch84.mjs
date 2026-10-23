// Verify legacy faction reuse in remaining theaters without repeating accepted artwork/state matrices.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { installNativeObjectBindings } from '../m2/official-maps/native-object-bindings.mjs';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [stage, output] = process.argv.slice(2);
const edition = process.argv.includes('--edition=ra2') ? 'ra2' : 'yr';
const density = process.argv.includes('--density=2') ? 2 : 4;
const requested = process.argv.find(arg => arg.startsWith('--families='))?.split('=')[1].split(',');
const theater = process.argv.find(arg => arg.startsWith('--theater='))?.split('=')[1];
assert(['DESERT', 'NEWURBAN'].includes(theater) && edition === 'yr');
const authorityFile = `.artifacts/m2-4/legacy-faction-reuse-batch84-20261020/${theater.toLowerCase()}-authority-v1.json`;
const bytes = await fs.readFile(authorityFile), authority = JSON.parse(bytes);
const rows = authority.rows.filter(row => row.edition === edition && (!requested || requested.includes(row.family)))
    .sort((a, b) => a.family.localeCompare(b.family));
assert(rows.length && (!requested || rows.length === requested.length));
if (!process.argv.some(arg => arg.startsWith('--map=')))
    process.argv.push(`--map=${theater === 'DESERT' ? 'saharami.map' : 'manhatta.map'}`);
process.argv.push('--bot-slot=1');
const session = await startSession(stage, output, edition, false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true; graphics.hdDensity.value = density;
    }, density);
});
const { page, report, close } = session;
let failure;
try {
    report.disclosure = 'Accepted faction artwork/state evidence is reused. Only actual remaining-theater filename/member binding, density, publication, budget and release paths are checked on legal native foundations. Controlled stock-building duplicates are removed after each case. No source map, rules, owner masks, animation, construction timing, camera scale, source archive or selected asset is changed. This is not a natural build-order or new artwork acceptance claim.';
    report.authority = { file: authorityFile, sha256: createHash('sha256').update(bytes).digest('hex') };
    report.requestedDensity = density; report.theater = theater; report.factionBindings = [];
    report.sourceSha256 = await page.evaluate(() => window.__ra2debug.game.officialSkirmishSourceSha256);
    await installNativeObjectBindings(page);
    await page.evaluate(() => {
        window.__m24FactionSample = () => {
            const d = window.__ra2debug, w = d.worldView, object = window.__m24FactionObject;
            const renderable = object && d.renderableManager.getRenderableByGameObject(object);
            const aggregate = renderable?.aggregatedImageData;
            const builder = (renderable?.mainObj ?? renderable?.shpRenderable)?.builder;
            const observed = object && window.__m23Binding(object);
            const binding = builder?.hdOverride;
            const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
                + (w.napowrHd?.report.gpuBytes ?? 0)
                + [...(w.rhinoHd?.parts.values() ?? [])].reduce((n, p) => n + p.bitmap.width * p.bitmap.height * 5
                    + p.palette.image.data.byteLength, 0);
            const demand = d.sovietUnitsHd;
            const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !demand.families[name])
                .reduce((n, [, family]) => n + family.report.gpuBytes, 0);
            const allocation = { terrain: d.terrainHd.worldChargeBytes, environment: d.environmentHd.worldChargeBytes,
                baseline, eager, demand: demand.gpuBytes };
            allocation.total = Object.values(allocation).reduce((a, b) => a + b, 0);
            return { name: object?.name, id: object?.id, spawned: object?.isSpawned, frame: builder?.getFrame(),
                tick: d.game.currentTick, hd: observed?.hd ?? binding?.identity,
                members: [...(aggregate?.imageIndexes?.keys() ?? [])].map(image => image.filename),
                pages: binding?.pages?.length ?? (observed?.hd ? 1 : 0), allocation, queued: demand.families[object?.name],
                turret: w.sovietBuildingsHd?.[object?.name]?.turret && {
                    density: w.sovietBuildingsHd[object.name].turret.density,
                    headings: [...w.sovietBuildingsHd[object.name].turret.parts.keys()],
                    disposed: w.sovietBuildingsHd[object.name].turret.disposed,
                    gpuBytes: w.sovietBuildingsHd[object.name].turret.gpuBytes },
                prepared: d.preparedHdCache && { ...d.preparedHdCache },
                glError: d.renderer.renderer.getContext().getError() };
        };
    });
    for (const row of rows) {
        const item = { family: row.family, selection: row.selection };
        report.factionBindings.push(item);
        try {
            item.fixture = await page.evaluate(name => {
                const d = window.__ra2debug;
                d.game.mapShroudTrait.revealMap(d.localPlayer, d.game);
                let object;
                if (['GAWALL', 'NAWALL'].includes(name)) {
                    const tile = d.game.map.tiles.getAll().find(t => d.game.map.isWithinBounds(t)
                        && !t.rampType && d.game.map.getTileZone(t, true) === 0
                        && !d.game.map.getObjectsOnTile(t).length);
                    if (!tile) throw Error('No legal foundation for ' + name);
                    object = d.game.createObject(4, name);
                    object.overlayId = d.game.rules.getOverlayId(name); object.value = 0;
                    d.game.spawnObject(object, tile);
                } else object = window.__allied.building(name);
                window.__m24FactionObject = object;
                d.worldInteraction.minimapHandler.panToTile(object.tile);
                return { id: object.id, name, tile: [object.tile.rx, object.tile.ry],
                    prior: d.sovietUnitsHd.families[name], rulesUntouched: true, diagnosticMapRevealRefreshed: true };
            }, row.family);
        } catch (error) {
            if (!String(error).includes('No legal foundation for ' + row.family)) throw error;
            item.status = 'NO_LEGAL_NATIVE_FOUNDATION_REQUIRES_OTHER_OFFICIAL_MAP';
            item.error = String(error); continue;
        }
        await page.waitForFunction(({ name, members, density }) => {
            const sample = window.__m24FactionSample();
            return sample.name === name && (['GAWALL', 'NAWALL'].includes(name) ? !!sample.hd : sample.hd?.startsWith(name.toLowerCase() + '/'))
                && members.every(member => sample.hd.includes(member.manifestSha256 + '/' + member.sourceSha256 + '/')
                    && (sample.hd.includes('/tiles/' + density) || sample.hd.endsWith('/' + density)));
        }, { name: row.family, members: row.members, density }, { timeout: 45000 });
        item.bound = await page.evaluate(() => window.__m24FactionSample());
        const identities = item.bound.hd.split('|');
        for (const member of row.members) {
            if (!['GAWALL', 'NAWALL'].includes(row.family)) assert(item.bound.members.includes(member.actualMember), `${row.family}: actual member ${member.actualMember}`);
            const stabilized = row.family === 'GAPOWR' && member.canonicalMember === 'ggpowr_a.shp';
            const suffix = stabilized ? '(?:/stable-structure-effects-v1)?' : '';
            assert(identities.some(identity => identity.includes(member.manifestSha256 + '/' + member.sourceSha256 + '/')
                && new RegExp('/(?:tiles/)?' + density + suffix + '$').test(identity)));
        }
        if (row.turret) {
            assert(item.bound.turret && !item.bound.turret.disposed);
            assert.equal(item.bound.turret.density, Math.min(density, row.turret.density));
            assert.equal(item.bound.turret.headings.length, 8);
            assert.deepEqual(item.bound.turret.headings, [0, 45, 90, 135, 180, 225, 270, 315]);
        }
        assert(item.bound.pages > 0); assert.equal(item.bound.glError, 0);
        assert(item.bound.allocation.total <= (density === 4 ? 1280 : 512) * 1024 * 1024);
        assert(item.bound.prepared.bytes + item.bound.prepared.pendingBytes <= 128 * 1024 * 1024);
        if (['GAREFN', 'NAPSIS', 'YAPOWR', 'NAYARD'].includes(row.family)) {
            const png = await page.evaluate(() => {
                const d = window.__ra2debug; d.renderer.render();
                return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
            });
            const file = row.family + '-binding-framebuffer.png';
            await fs.writeFile(path.join(output, file), Buffer.from(png, 'base64'));
            item.capture = { file, rescaled: false, acceptedArtContextOnly: true };
        }
        await page.evaluate(() => {
            const d = window.__ra2debug, object = window.__m24FactionObject;
            if (object.isSpawned) d.game.unspawnObject(object);
        });
        await page.waitForTimeout(80);
        item.removed = await page.evaluate(() => ({ spawned: window.__m24FactionObject.isSpawned,
            renderablePresent: !!window.__ra2debug.renderableManager.getRenderableByGameObject(window.__m24FactionObject) }));
        assert.equal(item.removed.spawned, false);
        item.status = 'PASS_COMPLETE_ACCEPTED_REMAINING_THEATER_BINDING_AND_REMOVAL';
        await fs.writeFile(path.join(output, 'binding-progress.json'), JSON.stringify(report.factionBindings, null, 2) + '\n');
    }
    report.beforeReset = await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__m24OldFactionWorld = d.worldView; window.__m24OldFactionGame = d.game;
        window.__m24OldFactionDemand = d.worldView.sovietUnitsHd;
        window.__m24OldFactionTerrain = d.terrainHd; window.__m24OldFactionEnvironment = d.environmentHd;
        return window.__m24FactionSample();
    });
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
    await page.evaluate(async () => { await window.r.reset; });
    await page.waitForFunction(() => window.__ra2debug.game !== window.__m24OldFactionGame
        && window.__ra2debug.game.status === 1, undefined, { timeout: 90000 });
    report.release = await page.evaluate(() => {
        const d = window.__ra2debug, oldDemand = window.__m24OldFactionDemand;
        return { oldDemandFamilies: oldDemand.families.size, oldDemandGpu: oldDemand.report.gpuBytes,
            oldTerrainGpu: window.__m24OldFactionTerrain.worldChargeBytes,
            oldEnvironmentGpu: window.__m24OldFactionEnvironment.worldChargeBytes,
            originalDemandGpu: d.worldView.sovietUnitsHd.report.gpuBytes,
            originalEnvironmentGpu: d.environmentHd.worldChargeBytes };
    });
    assert(Object.values(report.release).every(value => value === 0));
    await page.evaluate(() => window.__installAlliedFixtures());
    report.bindingStatus = report.factionBindings.every(row => row.status.startsWith('PASS_'))
        ? 'PASS_COMPLETE_ACCEPTED_FACTION_BINDINGS_DENSITY_BUDGET_AND_ORIGINAL_RELEASE'
        : 'PASS_AVAILABLE_BINDINGS_PENDING_OTHER_OFFICIAL_MAP_FOUNDATIONS';
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, density, edition, families: rows.length }));
