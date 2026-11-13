import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { closeCampaignMenuPaused } from './named-save-restart.mjs';
import { requiredNativeHd } from './native-required-hd.mjs';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]);
const mission = process.argv.find(value => value.startsWith('--mission='))?.slice(10) ?? 'sov03u.map';
const edition = process.argv.find(value => value.startsWith('--edition='))?.split('=')[1] ?? 'ra2';
const checkpointPath = process.argv.find(value => value.startsWith('--checkpoint='))?.slice(13);
const checkpoint = checkpointPath && JSON.parse(await fs.readFile(path.resolve(checkpointPath)));
const density = Number(process.argv.find(value => value.startsWith('--density='))?.split('=')[1] ?? 4);
const liveWarmupOnly = process.argv.includes('--live-warmup-only');
const difficulty = process.argv.find(value => value.startsWith('--difficulty='))?.split('=')[1] ?? 'normal';
const focus = process.argv.find(value => value.startsWith('--focus='))?.slice(8).split(',')
    ?? ['NAPSYB', 'GATECH', 'NACNST', 'NAPSIS', 'CAWASH14', 'CAWASH17', 'CANWY05', 'CANEWY10', 'CANEWY17'];
const requiredHd = process.argv.find(value => value.startsWith('--require-hd='))?.slice(13).split(',') ?? [];
const requiredShpParts = process.argv.find(value => value.startsWith('--require-shp-parts='))?.split('=')[1].split(',') ?? [];
assert(!requiredShpParts.length || requiredHd.length);
assert([2, 4].includes(density));
assert(['ra2', 'yr'].includes(edition));
assert(['easy', 'normal', 'hard'].includes(difficulty));
await fs.mkdir(out, { recursive: true });
const profile = path.join(out, 'profile'); await fs.mkdir(profile, { recursive: true });
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.join(root, '.local') }));
const report = { status: 'RUNNING', edition, mission, density, difficulty, liveWarmupOnly,
    warmupPolicy: liveWarmupOnly ? 'Only spawned live actors acquire temporary verification leases; complete source/potential production rows are still inventoried. No product budget, density or resource selection change.'
        : 'Temporary verification leases cover every inventoried candidate, including units absent from this world; this deliberate reservation stress differs from ordinary gameplay demand.',
    scope: 'Native campaign resource inventory: original placements, base nodes, task forces, legal production and related actors. Optional source checkpoint is compared before diagnostic reveal. Inventory alone is not coverage or mission acceptance.',
    screenshots: [], errors: [], failedResources: [] };
let app, page;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); }
try {
    ({ app, page } = await campaignSession(out, report, { edition, density }));
    await page.evaluate(async ({ density, difficulty, mission, checkpoint }) => { const d = window.__ra2debug; d.generalOptions.graphics.hdEnabled.value = true; d.generalOptions.graphics.hdDensity.value = density;
        const screen = d.mainMenuController.screens.get(22); screen.difficulty = difficulty;
        await screen.launchDiagnostic(checkpoint || undefined, mission); }, { density, difficulty, mission, checkpoint });
    if (checkpoint) {
        await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
            && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
        report.restored = await page.evaluate(() => { const g = window.__ra2debug.game;
            return JSON.parse(JSON.stringify({ worldHash: g.getHash(), rng: g.prng.snapshot(), mission: g.campaign.checkpointState(),
                world: g.debugGetState(), pendingCallbacks: g.afterTickCallbacks.length })); });
        assert.deepEqual(report.restored, checkpoint.expected);
        await closeCampaignMenuPaused(page);
    } else await page.waitForFunction(mission => window.__ra2debug.game?.campaign?.launch.mission === mission
        && window.__ra2debug.gameScreen?.playerUi, mission, { timeout: 180000 });
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true);
        d.game.campaign.inspectionModified = true; d.game.mapShroudTrait.revealMap(d.game.localPlayer, d.game);
        document.querySelector('[data-campaign-diagnostic]')?.remove(); });
    await page.waitForTimeout(200);
    report.parameters = await page.evaluate(() => { const d = window.__ra2debug, g = d.game, m = d.gameScreen.gameTurnMgr;
        m.setCampaignPaused(false); try { for (let i = 0; i < 30; i++) m.doGameTurn(performance.now()); } finally { m.setCampaignPaused(true); }
        return { tick: g.currentTick, human: g.localPlayer.handicap, houses: [...g.campaign.houses].map(([name, owner]) => [name, owner.handicap]),
            arrivals: g.campaign.trace.filter(a => a.opcode === 80), originalGeneral: Object.fromEntries(['TeamDelays', 'AIHateDelays'].map(key =>
                [key, g.rules.getIni().getSection('General').getNumberArray(key)])) }; });
    const names = await page.evaluate(({ rows, liveWarmupOnly }) => {
        const d = window.__ra2debug, g = d.game, list = new Map(rows.map(row => [row.name, { ...row, references: [...row.references] }]));
        const add = (name, type, reason) => {
            if (!name) return;
            if (!list.has(name)) list.set(name, { name, type, placements: [], references: [] });
            list.get(name).references.push(reason);
        };
        const initial = g.map.getInitialMapObjects();
        for (const object of initial.technos) add(object.name, object.type, { section: 'OriginalPlacement',
            owner: object.owner, tile: [object.rx, object.ry] });
        for (const [key, type] of [['terrains', 6], ['smudges', 5]]) {
            for (const object of initial[key]) add(object.name, type, { section: 'OriginalPlacement', tile: [object.rx, object.ry] });
        }
        for (const overlay of initial.overlays) add(g.rules.getOverlayName(overlay.id), 4,
            { section: 'OriginalOverlay', id: overlay.id, tile: [overlay.rx, overlay.ry] });
        for (const force of g.campaign.definition.taskForces.values()) for (const unit of force.units) add(unit.type, 0, { section: 'OriginalTaskForce', taskForce: force.id });
        for (const trigger of g.campaign.definition.triggers.values()) for (const action of trigger.actions) {
            if (g.campaign.yr && action.opcode === 125) add(action.params[1], 2,
                { section: 'OriginalCreateBuildingAction', trigger: trigger.id, action: action.index });
        }
        for (const object of g.world.getAllObjects()) if ([1, 2, 3, 4, 6, 7].includes(object.type)) {
            add(object.name, object.type, { section: 'NativeInitialWorld' });
        }
        for (const node of g.campaign.baseBuilder?.nodes ?? []) {
            const known = g.rules.hasObject(node.type, 2);
            add(node.type, known ? 2 : 0, { section: 'OriginalBaseNode', house: node.house, node: node.index,
                ...(!known ? { qualification: 'Retained source name has no native building definition; not a fabricated art identity' } : {}) });
            if (!known && node.type === 'GARADR' && g.campaign.launch.semanticsVersion >= 12) {
                for (const key of ['BuildDefense', 'BuildPDefense', 'BuildAA', 'BuildDummy']) {
                    for (const name of g.rules.getIni().getSection('AI')?.getArray(key) ?? []) {
                        if (g.rules.hasObject(name, 2)) add(name, 2, { section: 'OriginalAutomaticDefenseCandidate',
                            sourceNode: node.type, key, qualification: 'Potential source planner output; not proof of an actual spawn' });
                    }
                }
            }
        }
        const plane = g.rules.general.paradrop.paradropPlane;
        if ([...g.campaign.definition.teams.values()].some(team => ['yes', '1'].includes(team.properties.Droppod?.toLowerCase()))) {
            add(plane, 1, { section: 'ImplicitParadropAircraft' });
        }
        for (const rule of d.localPlayer.production.allAvailableObjects) {
            if (rule.isAvailableTo(d.localPlayer.country) && rule.techLevel >= 0
                && rule.techLevel <= d.localPlayer.production.maxTechLevel && rule.buildLimit !== 0) {
                add(rule.name, rule.type, { section: 'MissionTechProductionCandidate', techLevel: rule.techLevel,
                    availableNow: d.localPlayer.production.isAvailableForProduction(rule), prerequisites: rule.prerequisite });
            }
        }
        for (const item of [...list.values()]) {
            if (item.type && !g.rules.hasObject(item.name, item.type)) {
                item.references.push({ section: 'OriginalUnregisteredIdentity', declaredType: item.type,
                    qualification: 'Original placement is retained but has no registered rules identity; retail-source qualification required' });
                item.type = 0;
            }
            if (!item.type) item.type = [3, 7, 1, 2, 6].find(type => g.rules.hasObject(item.name, type)) ?? 0;
            if (!item.type) continue;
            const rule = g.rules.getObject(item.name, item.type);
            for (const key of ['DeploysInto', 'UndeploysInto', 'FreeUnit']) {
                const name = rule.ini?.getString(key); if (!name) continue;
                const type = [2, 7, 3, 1].find(type => g.rules.hasObject(name, type));
                if (type) add(name, type, { section: 'NativeRelatedActor', parent: item.name, key });
            }
        }
        window.__coverageRows = [...list.values()];
        window.__coverageWarmReleases = [];
        const units = d.worldView.sovietUnitsHd;
        const live = new Set(g.world.getAllObjects().filter(o => o.isSpawned && !o.isDestroyed).map(o => o.name));
        for (const item of list.values()) if ([1, 3, 7].includes(item.type) && (!liveWarmupOnly || live.has(item.name))) {
            window.__coverageWarmReleases.push(units.prewarm(item.name));
        }
        return [...list.values()].map(row => ({ name: row.name, type: row.type }));
    }, { rows: [], liveWarmupOnly });
    await page.evaluate(() => window.__ra2debug.worldView.sovietUnitsHd.idle());
    if (requiredHd.length) {
        report.requiredNativeHd = await requiredNativeHd(page, requiredHd, density);
        for (const member of requiredShpParts) {
            const parts = report.requiredNativeHd.flatMap(row => row.instances.flatMap(instance => instance.parts))
                .filter(part => (part.sourceMember ?? part.member)?.toLowerCase() === member.toLowerCase());
            assert(parts.length, 'Required native SHP dependency is absent: ' + member);
            assert(parts.every(part => part.gpu && part.density === density && part.verticalDensity === density),
                'Required complete SHP dependency falls back or uses a lower density: ' + member);
        }
    }
    report.rows = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, manager = d.renderableManager, finder = manager.renderableFactory.imageFinder;
        const serialize = model => {
            const builder = model.builder; if (!builder) return null;
            const page = builder.getHdPage?.(), mesh = model.getShapeMesh?.(), override = builder.hdOverride;
            const index = builder.frameNo + builder.frameOffset;
            const original = builder.shpFile?.images[index], sample = override?.frames[index]?.sampleRect;
            return { member: builder.shpFile?.filename ?? 'aggregate', frame: builder.frameNo, frameOffset: builder.frameOffset,
                override: override?.identity ?? null, declaredHdFrames: override?.frames.filter(Boolean).length ?? 0,
                effectiveDensity: original?.width && sample ? sample.width / original.width : null,
                frameHasHdPage: !!page, material: mesh?.material?.type,
                gpuHd: !!page && mesh?.material?.type === 'HdSpriteMaterial' && mesh.material.map === page.base,
                visible: !!model.get3DObject?.()?.visible };
        };
        return window.__coverageRows.map(row => {
            const type = row.type, rule = type && g.rules.getObject(row.name, type), art = type && g.art.getObject(row.name, type);
            const invisible = !!rule?.invisibleInGame;
            let member = null, resolutionError = null;
            if (art?.isVoxel) member = art.imageName.toLowerCase() + '.vxl';
            else if (art && !invisible) {
                try { member = finder.findByObjectArt(art).filename; } catch (error) { resolutionError = error.message; }
            }
            const objects = g.world.getAllObjects().filter(object => object.name === row.name);
            const instances = objects.map(object => {
                const r = manager.getRenderableByGameObject(object);
                const models = [...new Set([r?.mainObj, r?.mainRenderable, r?.shpRenderable, r?.bib,
                    ...[...(r?.animObjects?.values?.() ?? [])].flat()])].filter(model => model?.builder);
                const layer = r?.terrainLayer ?? r?.mapOverlayLayer ?? r?.mapSmudgeLayer;
                const spec = layer?.batchShpSpecsByObject?.get(object)?.main;
                const batch = spec && [...layer.batchShpBuilders.values()].flat().find(builder => builder.specIndexes.has(spec));
                const page = batch?.hdOverride?.pages[batch.hdOverride.frames[spec.frameNo]?.page];
                return { id: object.id, house: object.owner?.name ?? null, tile: [object.tile.rx, object.tile.ry],
                    spawned: object.isSpawned, destroyed: object.isDestroyed, renderable: !!r, invisibleOverlay: !!r?.isInvisible,
                    vxlBound: !!r?.unitVxlHd, vxlActive: !!r?.unitVxlHd?.active,
                    vxlParts: r?.unitVxlHd?.family?.parts.map(part => ({ member: part.member, identity: part.override.identity,
                        effectiveDensity: part.frames[0].rect[2] / part.frames[0].logicalSize[0] })) ?? [],
                    rhinoBound: !!r?.rhinoHd, parts: models.map(serialize).filter(Boolean),
                    batch: spec ? { bound: !!batch, member: spec.shpFile.filename, frame: spec.frameNo,
                        override: batch?.hdOverride?.identity ?? null, frameHasHdPage: !!page,
                        gpuHd: !!page && batch.mesh?.material?.type === 'HdSpriteMaterial' && batch.mesh.material.map === page.base } : null };
            });
            let preparedOverride = null;
            if (art && !art.isVoxel && !invisible && member) {
                const image = finder.findByObjectArt(art);
                preparedOverride = finder.getUnitHdOverride(row.name, image)?.identity ?? null;
            }
            return { ...row, invisible, member, resolutionError, ruleName: rule?.ini?.getString('Name'), uiName: rule?.uiName,
                techLevel: rule?.techLevel, isVoxel: !!art?.isVoxel, preparedOverride, instances };
        });
    });
    report.world = await page.evaluate(async () => {
        const d = window.__ra2debug, g = d.game;
        const response = await fetch('/local-environment/selection.json');
        return { tick: g.currentTick, worldHash: g.getHash(), diagnostic: g.campaign.launch.diagnostic,
            inspectionModified: g.campaign.inspectionModified, missionSourceSha256: g.campaign.launch.sourceSha256,
            terrain: structuredClone(d.terrainHd), environment: structuredClone(d.environmentHd), actors: structuredClone(d.sovietUnitsHd),
            dedicated: { conscript: structuredClone(d.conscriptHd), rhino: structuredClone(d.rhinoHd),
                powerPlant: structuredClone(d.powerPlantHd), napowr: structuredClone(d.napowrHd), buildings: structuredClone(d.sovietBuildingsHd) },
            selectedEnvironment: await response.json(), glError: d.renderer.renderer.getContext().getError() };
    });
    for (const name of requiredHd) {
        const row = report.rows.find(row => row.name === name);
        const visible = row?.instances.filter(instance => instance.spawned) ?? [];
        assert(visible.length, 'Required spawned native HD actor is absent: ' + name);
        assert(visible.every(instance => instance.vxlActive || instance.rhinoBound
            || instance.parts.some(part => part.gpuHd) || instance.batch?.gpuHd), 'Required native HD actor falls back: ' + name);
        for (const instance of visible.filter(instance => instance.vxlActive)) {
            assert(instance.vxlParts.every(part => Math.abs(part.effectiveDensity - density) < 1e-8),
                'Required native VXL actor uses a lower density: ' + name);
        }
    }
    report.parachutes = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        return g.world.getAllObjects().filter(unit => unit.campaignParadropping).map(unit => {
            const renderable = d.renderableManager.getRenderableByGameObject(unit);
            const plugin = renderable?.plugins.find(plugin => 'descending' in plugin && 'animationName' in plugin);
            return { id: unit.id, name: unit.name, elevation: unit.tileElevation, attackDisabled: unit.attackTrait.isDisabled(),
                animation: !!plugin?.animation, attached: plugin?.animation?.get3DObject().parent === renderable?.posObj,
                shadowVisible: plugin?.shadow?.get3DObject()?.visible };
        });
    });
    for (const unit of report.parachutes.slice(0, 2)) {
        assert(unit.attackDisabled && unit.animation && unit.attached && unit.shadowVisible);
        await page.evaluate(id => { const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.getObjectById(id).tile); }, unit.id);
        await page.waitForTimeout(100); await shot('source-vehicle-paradrop-' + unit.name.toLowerCase() + '-' + unit.id);
    }
    for (const name of focus) {
        const object = report.rows.find(row => row.name === name)?.instances[0]; if (!object) continue;
        await page.evaluate(id => { const d = window.__ra2debug, object = d.game.world.getAllObjects().find(o => o.id === id);
            d.worldInteraction.minimapHandler.panToTile(object.tile); }, object.id);
        await page.waitForTimeout(100); await shot(name.toLowerCase());
    }
    assert.equal(report.world.glError, 0); assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOURCE_RESOURCE_INVENTORY_NOT_COVERAGE_ACCEPTANCE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (error.nativeHdRows) report.requiredHd = error.nativeHdRows;
    if (page) {
        report.failedBindingContext = await page.evaluate(() => { const d = window.__ra2debug;
            return { environment: structuredClone(d?.environmentHd), actors: structuredClone(d?.sovietUnitsHd),
                actualSelections: d?.worldView?.sovietUnitsHd?.report }; }).catch(() => null);
        await shot('failure').catch(() => {});
    }
}
finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, rows: report.rows?.length, error: report.error, out }));
