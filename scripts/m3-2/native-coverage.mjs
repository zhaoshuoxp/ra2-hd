import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]);
const density = Number(process.argv.find(value => value.startsWith('--density='))?.split('=')[1] ?? 4);
const difficulty = process.argv.find(value => value.startsWith('--difficulty='))?.split('=')[1] ?? 'normal';
assert([2, 4].includes(density));
assert(['easy', 'normal', 'hard'].includes(difficulty));
await fs.mkdir(out, { recursive: true });
const profile = path.join(out, 'profile'); await fs.mkdir(profile, { recursive: true });
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.join(root, '.local') }));
const report = { status: 'RUNNING', density, difficulty, scope: 'Soviet 02 diagnostic asset inspection: original placements, task forces, production and native related actors; revealed paused world, not mission completion.',
    screenshots: [], errors: [], failedResources: [] };
let app, page;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); }
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(root, 'desktop/main.mjs')], cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))), RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' } });
    page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push([response.url(), response.status()]); });
    await page.locator('[data-edition=ra2]').click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController && document.documentElement.lang.includes('-'), undefined, { timeout: 90000 });
    const language = await page.evaluate(() => document.documentElement.lang);
    const labels = JSON.parse(await fs.readFile(path.join(root, 'public/res/locale', language + '.json')));
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    await page.evaluate(async ({ density, difficulty }) => { const d = window.__ra2debug; d.generalOptions.graphics.hdEnabled.value = true; d.generalOptions.graphics.hdDensity.value = density;
        const screen = d.mainMenuController.screens.get(22); screen.difficulty = difficulty;
        await screen.launchDiagnostic(undefined, 'sov02t.map'); }, { density, difficulty });
    await page.waitForFunction(() => window.__ra2debug.game?.campaign?.launch.mission === 'sov02t.map' && window.__ra2debug.gameScreen?.playerUi, undefined, { timeout: 180000 });
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true);
        d.game.campaign.inspectionModified = true; d.game.mapShroudTrait.revealMap(d.game.localPlayer, d.game);
        document.querySelector('[data-campaign-diagnostic]').style.display = 'none'; });
    await page.waitForTimeout(200);
    report.parameters = await page.evaluate(() => { const d = window.__ra2debug, g = d.game, m = d.gameScreen.gameTurnMgr;
        m.setCampaignPaused(false); try { for (let i = 0; i < 30; i++) m.doGameTurn(performance.now()); } finally { m.setCampaignPaused(true); }
        return { tick: g.currentTick, human: g.localPlayer.handicap, houses: [...g.campaign.houses].map(([name, owner]) => [name, owner.handicap]),
            arrivals: g.campaign.trace.filter(a => a.opcode === 80), originalGeneral: Object.fromEntries(['TeamDelays', 'AIHateDelays'].map(key =>
                [key, g.rules.getIni().getSection('General').getNumberArray(key)])) }; });
    assert.equal(report.parameters.arrivals.length, difficulty === 'hard' ? 4 : 7);
    const names = await page.evaluate(rows => {
        const d = window.__ra2debug, g = d.game, list = new Map(rows.map(row => [row.name, { ...row, references: [...row.references] }]));
        const add = (name, type, reason) => {
            if (!name) return;
            if (!list.has(name)) list.set(name, { name, type, placements: [], references: [] });
            list.get(name).references.push(reason);
        };
        for (const force of g.campaign.definition.taskForces.values()) for (const unit of force.units) add(unit.type, 0, { section: 'OriginalTaskForce', taskForce: force.id });
        for (const object of g.world.getAllObjects()) add(object.name, object.type, { section: 'NativeInitialWorld' });
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
        for (const item of list.values()) if ([1, 3, 7].includes(item.type)) window.__coverageWarmReleases.push(units.prewarm(item.name));
        return [...list.values()].map(row => ({ name: row.name, type: row.type }));
    }, []);
    await page.evaluate(() => window.__ra2debug.worldView.sovietUnitsHd.idle());
    report.rows = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, manager = d.renderableManager, finder = manager.renderableFactory.imageFinder;
        const serialize = model => {
            const builder = model.builder; if (!builder) return null;
            const page = builder.getHdPage?.(), mesh = model.getShapeMesh?.(), override = builder.hdOverride;
            return { member: builder.shpFile?.filename ?? 'aggregate', frame: builder.frameNo, frameOffset: builder.frameOffset,
                override: override?.identity ?? null, declaredHdFrames: override?.frames.filter(Boolean).length ?? 0,
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
                const layer = r?.terrainLayer ?? r?.mapOverlayLayer;
                const spec = layer?.batchShpSpecsByObject?.get(object)?.main;
                const batch = spec && [...layer.batchShpBuilders.values()].flat().find(builder => builder.specIndexes.has(spec));
                const page = batch?.hdOverride?.pages[batch.hdOverride.frames[spec.frameNo]?.page];
                return { id: object.id, house: object.owner?.name ?? null, tile: [object.tile.rx, object.tile.ry],
                    spawned: object.isSpawned, renderable: !!r, invisibleOverlay: !!r?.isInvisible,
                    vxlBound: !!r?.unitVxlHd, vxlActive: !!r?.unitVxlHd?.active,
                    vxlParts: r?.unitVxlHd?.family?.parts.map(part => ({ member: part.member, identity: part.override.identity })) ?? [],
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
    for (const name of ['CAMIAM01', 'CAMIAM02', 'CAMIAM03', 'CAMIAM05', 'CAMIAM06', 'CAMIAM07', 'CAMSC07', 'CAMSC08', 'CAMSC09', 'CAPARS10', 'CAPARS13', 'CAPARS14', 'CATECH01', 'VLAD']) {
        const object = report.rows.find(row => row.name === name)?.instances[0]; if (!object) continue;
        await page.evaluate(id => { const d = window.__ra2debug, object = d.game.world.getAllObjects().find(o => o.id === id); d.worldInteraction.minimapHandler.panToTile(object.tile); }, object.id);
        await page.waitForTimeout(80); await shot(name.toLowerCase());
    }
    assert.equal(report.world.glError, 0); assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    const vlad = report.world.actors.families.VLAD;
    assert.equal(vlad.status, 'READY'); assert.equal(vlad.density, density);
    for (const name of ['CIVBFM', 'CIVBF', 'CIVBTM', 'GASAND', 'CAMIAM06', 'CAMIAM05', 'CAMIAM07', 'CAHSE06', 'CAUSFGL', 'CAHSE04']) {
        const row = report.rows.find(row => row.name === name);
        assert(row?.instances.some(instance => instance.batch?.gpuHd || instance.parts.some(part => part.gpuHd)), `No actual HD binding for ${name}`);
    }
    report.status = 'PASS_NATIVE_SOURCE_INVENTORY_NEW_HD_BINDINGS_AND_DIFFICULTY_OPENING';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; if (page) await shot('failure').catch(() => {}); }
finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, rows: report.rows?.length, error: report.error, out }));
