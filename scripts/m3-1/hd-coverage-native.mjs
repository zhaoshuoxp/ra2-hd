import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);
const receipt = JSON.parse(await fs.readFile(path.join(root, '.artifacts/m3-1/feedback-r6/extracted.json')));
const inventory = JSON.parse(await fs.readFile(path.join(base, 'inventory.json')));
const out = path.join(base, process.argv[3] ?? 'native'); await fs.mkdir(out, { recursive: false });
await fs.copyFile(import.meta.filename, path.join(out, 'harness.mjs'));
const metadata = JSON.parse(await fs.readFile(path.join(receipt.app, 'Contents/Resources/app/package.json')));
const report = { status: 'RUNNING', app: receipt.app, runtimeSourceHead: metadata.sourceHead, screenshots: [], errors: [], failedResources: [],
    harnessSha256: createHash('sha256').update(await fs.readFile(import.meta.filename)).digest('hex'),
    scope: 'Accepted R6 app, isolated profile, diagnostic-only reveal and paused simulation. All placed objects, declared task-force identities, implicit aircraft and mission-tech production candidates are inspected. Demand prewarming tests available resources without spawning actors. No game rules, maps, authored art, saves or user profile are changed; this is not mission completion proof.' };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app, page;
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
try {
    app = await electron.launch({ executablePath: path.join(receipt.app, 'Contents/MacOS', receipt.executable), cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))), RA2_DESKTOP_USER_DATA: path.join(out, 'profile') } });
    app.process().stderr?.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    const browserWindow = await app.browserWindow(page);
    await browserWindow.evaluate(window => { window.unmaximize(); window.setContentSize(1280, 960); });
    await page.evaluate(() => { const options = window.__ra2debug.generalOptions.graphics;
        options.hdEnabled.value = true; options.hdDensity.value = 4;
        window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(); });
    await page.waitForFunction(() => window.__ra2debug.game?.campaign && window.__ra2debug.gameScreen?.playerUi
        && document.querySelector('[data-campaign-diagnostic]'), undefined, { timeout: 180000 });
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true); });
    const reveal = await page.evaluate(() => window.__ra2debug.gameScreen.strings.get('HD:CampaignReveal'));
    await page.getByRole('button', { name: reveal, exact: true }).click();
    await page.evaluate(() => { document.querySelector('[data-campaign-diagnostic]').style.display = 'none'; });
    await page.waitForTimeout(500);
    const names = await page.evaluate(rows => {
        const d = window.__ra2debug, g = d.game, list = new Map(rows.map(row => [row.name, { ...row, references: [...row.references] }]));
        const add = (name, type, reason) => {
            if (!name) return;
            if (!list.has(name)) list.set(name, { name, type, placements: [], references: [] });
            list.get(name).references.push(reason);
        };
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
    }, inventory.rows);
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
        const response = await fetch('/local-environment/urban/selection.json');
        return { tick: g.currentTick, worldHash: g.getHash(), diagnostic: g.campaign.launch.diagnostic,
            inspectionModified: g.campaign.inspectionModified, missionSourceSha256: g.campaign.launch.sourceSha256,
            terrain: structuredClone(d.terrainHd), environment: structuredClone(d.environmentHd), actors: structuredClone(d.sovietUnitsHd),
            dedicated: { conscript: structuredClone(d.conscriptHd), rhino: structuredClone(d.rhinoHd),
                powerPlant: structuredClone(d.powerPlantHd), napowr: structuredClone(d.napowrHd), buildings: structuredClone(d.sovietBuildingsHd) },
            selectedEnvironment: await response.json(), glError: d.renderer.renderer.getContext().getError() };
    });
    await save();
    for (const name of ['CAWA2A', 'CAWA2C', 'CAWASH19', 'CAMOV01', 'CANEWY21', 'CRUISE', 'TUG', 'CIV1', 'CIV2', 'CIV3']) {
        const object = report.rows.find(row => row.name === name)?.instances[0]; if (!object) continue;
        await page.evaluate(id => { const d = window.__ra2debug, object = d.game.world.getAllObjects().find(object => object.id === id);
            d.worldInteraction.minimapHandler.panToTile(object.tile); }, object.id);
        await page.waitForTimeout(160); await shot(name.toLowerCase());
    }
    // Advance only the opening until its genuine cargo plane appears; no object is injected.
    for (let attempt = 0; attempt < 24; attempt++) {
        await page.evaluate(() => { const d = window.__ra2debug, manager = d.gameScreen.gameTurnMgr;
            manager.setCampaignPaused(false);
            try { for (let i = 0; i < 30; i++) manager.doGameTurn(performance.now()); }
            finally { manager.setCampaignPaused(true); }
        });
        await page.waitForTimeout(30);
        const plane = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, name = g.rules.general.paradrop.paradropPlane;
            const object = g.world.getAllObjects().find(object => object.name === name); if (!object) return null;
            const r = d.renderableManager.getRenderableByGameObject(object);
            return { name, id: object.id, tick: g.currentTick, tile: [object.tile.rx, object.tile.ry],
                sourceArt: object.art.imageName, vxlBound: !!r?.unitVxlHd, hasNativeModel: !!r?.mainObj,
                familyReport: structuredClone(d.sovietUnitsHd.families[name] ?? null) };
        });
        if (plane) { report.openingAircraft = plane; break; }
    }
    assert.equal(report.world.missionSourceSha256, inventory.map.sha256); assert(report.world.diagnostic && report.world.inspectionModified);
    assert.equal(report.world.glError, 0); assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_DIAGNOSTIC_HD_COVERAGE_INSPECTION_WITH_EXPLICIT_GAPS';
    report.inspectedIdentities = names.length;
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; await shot('failure').catch(() => {}); }
finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, identities: report.rows?.length, screenshots: report.screenshots.length, error: report.error, out }));
