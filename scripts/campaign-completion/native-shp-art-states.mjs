import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { campaignSession, waitWorld, worldState } from '../m3-2/native-session.mjs';

const [output, mission, identity, requestedDensity, resourceReceipt] = process.argv.slice(2);
const out = path.resolve(output), density = Number(requestedDensity);
const cameraZoom = Number(process.argv.find(value => value.startsWith('--camera-zoom='))?.slice(14) ?? 1);
const rubbleFrame = Number(process.argv.find(value => value.startsWith('--rubble-frame='))?.slice(15) ?? -1);
const destroyAnimation = process.argv.find(value => value.startsWith('--destroy-animation='))?.slice(20);
const activeAnimation = process.argv.find(value => value.startsWith('--active-animation='))?.slice(19);
const activeComposite = process.argv.includes('--active-composite');
const originalRubble = process.argv.includes('--original-rubble');
const replayFile = process.argv.find(value => value.startsWith('--replay-commands='))?.slice(18);
const checkpointFile = process.argv.find(value => value.startsWith('--checkpoint='))?.slice(13);
const removedSourceMembers = process.argv.find(value => value.startsWith('--removed-source-members='))?.slice(25).split(',') ?? [];
const compoundCameraZoom = Number(process.argv.find(value => value.startsWith('--compound-camera-zoom='))?.slice(23) ?? cameraZoom);
assert([1, 2].includes(cameraZoom));
assert([1, 2].includes(compoundCameraZoom));
assert([2, 4].includes(density));
assert(!(replayFile && checkpointFile));
assert(!activeComposite || activeAnimation);
if (!replayFile && !checkpointFile) await fs.mkdir(out, { recursive: false });
const resources = JSON.parse(await fs.readFile(resourceReceipt));
const edition = resources.mission.edition ?? 'ra2';
const preparedSource = JSON.parse(await fs.readFile(path.join(resources.stage, 'prepared/source.json')));
let sharedSourceScope;
if (resources.mission.mission !== mission) {
    assert(process.argv.includes('--allow-declared-mission'));
    const contract = JSON.parse(await fs.readFile(path.join(resources.stage, 'contract.json')));
    sharedSourceScope = contract.families[resources.family].sourceScope.campaignSources
        .find(source => source.edition === edition && source.mission === mission);
    assert(sharedSourceScope, 'The complete exact-source family must declare this original mission');
    const map = await fs.readFile(path.join('.local/campaign', edition, mission.slice(0, -4), mission));
    assert.equal(createHash('sha256').update(map).digest('hex'), sharedSourceScope.sha256);
}
const bodySources = preparedSource.sources.filter(source => !source.bindingRole);
const drawableBodySources = bodySources.filter(source => !removedSourceMembers.includes(source.identity));
const multipleBodies = bodySources.length > 1;
const inspectedSource = destroyAnimation
    ? preparedSource.sources.find(source => source.bindingRole === 'DESTROY_ANIMATION'
        && (source.identity === destroyAnimation || source.artIdentity === destroyAnimation))
    : bodySources.find(source => source.identity === identity);
assert(!multipleBodies || inspectedSource, 'A compound family needs an original body for the inspected identity');
const sourceHash = inspectedSource?.sha256 ?? resources.preparation.sourceSha256;
const displayFrames = inspectedSource?.bodyFrames ?? resources.sourceVerification.counts.densityFrames / 2;
const report = { status: 'RUNNING', mission, identity, density, errors: [], failedResources: [], frames: [],
    scope: 'Fresh original source placement, revealed only for explicit art inspection. Only native SHP display frames and their original shadow frames change. Frozen world, tick, RNG, teams and source objectives remain unchanged. These are diagnostic art poses, not original mission events or objective completion.' };
if (sharedSourceScope) report.sharedSourceScope = { registration: resources.mission, target: sharedSourceScope,
    qualification: 'This exact shared body, art and palette already has a complete source-scoped binding for the launched mission.' };
let app, page, pilot;
try {
    if (removedSourceMembers.length) {
        assert(!removedSourceMembers.includes(identity));
        const map = await fs.readFile(path.join('.local/campaign', edition, mission.slice(0, -4), mission));
        assert.equal(createHash('sha256').update(map).digest('hex'), preparedSource.missionSha256);
        const text = map.toString(), section = text.match(/(?:^|\r?\n)\[Structures\]\r?\n([\s\S]*?)(?=\r?\n\[|$)/)?.[1];
        assert(section, 'Original structure section required');
        report.removedSourceMembers = removedSourceMembers.map(identity => {
            const source = bodySources.find(source => source.identity === identity);
            assert(source && !/^(yes|true|1)$/i.test(source.nativeRules.LeaveRubble ?? 'no'));
            const placements = section.split(/\r?\n/).filter(line => line.includes('=')).map(line => line.slice(line.indexOf('=') + 1).split(','))
                .filter(fields => fields[1] === identity);
            assert(placements.length && placements.every(fields => Number(fields[2]) === 0));
            assert(!text.includes(',125,10,' + identity + ','), 'Script-created members need a live source phase');
            return { identity, sourceSha256: source.sha256, placements: placements.map(fields => ({ health: Number(fields[2]),
                tile: [Number(fields[3]), Number(fields[4])] })), status: 'ORIGINAL_ZERO_HEALTH_NO_RUBBLE_PLACEMENT_REMOVED_BEFORE_DRAW' };
        });
        report.scope += ' Explicitly pinned zero-health/no-rubble source members remain removed; no diagnostic actor is created for them. Their authored states retain separate export and complete-family admission evidence.';
    }
    if (replayFile || checkpointFile) {
        assert.equal(edition, 'yr', 'Historical ordinary-input replay is scoped to the authorized YR observer');
        assert(process.argv.includes(`--density=${density}`));
        assert(process.argv.includes('--trace-programs'));
        const { NativeCampaignPilot } = await import('../yr-campaign/native-pilot.mjs');
        pilot = new NativeCampaignPilot(out, mission);
        pilot.report.errors = report.errors; pilot.report.failedResources = report.failedResources;
        pilot.report.consoleErrors = report.consoleErrors = [];
        await pilot.open(); ({ app, page } = pilot.session);
        report.campaignSessionGraphics = pilot.report.campaignSessionGraphics;
        report.originalInputReplay = pilot.report.ordinaryInputReplay;
        report.originalCreationIdentity = pilot.report.originalCreationIdentity;
        report.sourceCheckpoint = pilot.report.sourceCheckpoint;
        report.scope = replayFile
            ? 'Historical ordinary inputs enter a fresh original YR source world at its recorded creation identity. Renderer-only SHP poses inspect the actual original mission phase after that replay. No saved world, running RNG, health, task or result is assigned. This is source-event/art evidence, separate from fresh public initialization.'
            : 'Exact legitimate original-source checkpoint restoration with its stored interpreter policy. Frozen diagnostic SHP states inspect the actual original mission phase. Original world, health, tick, RNG, tasks and objectives remain unchanged. This is source-phase/art evidence, separate from fresh public initialization.';
    } else {
        ({ app, page } = await campaignSession(out, report, { density, edition }));
        if (process.argv.includes('--trace-programs')) {
            const { observeProgramLifetime } = await import('../windows-hd/observe-program-lifetime.mjs');
            await observeProgramLifetime(page);
        }
        await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, mission), mission);
        await waitWorld(page, mission);
    }
    report.originalActor = await page.evaluate(({ identity, originalRubble }) => {
        const d = window.__ra2debug, g = d.game;
        const object = g.world.getAllObjects().find(object => object.name === identity && (originalRubble
            ? object.isDestroyed && object.isBuilding() && object.rules.leaveRubble
            : object.isSpawned && !object.isDestroyed));
        if (!object) throw Error('Original source actor absent: ' + identity);
        window.__sourceArtActor = object;
        g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        d.gameScreen.pointer.unlock(true); document.querySelector('[data-campaign-diagnostic]')?.remove();
        d.worldInteraction.minimapHandler.panToTile(object.tile);
        return { id: object.id, health: object.healthTrait?.health, destroyed: object.isDestroyed,
            originalRubble, tile: [object.tile.rx, object.tile.ry] };
    }, { identity, originalRubble });
    if (originalRubble) {
        assert.equal(report.originalActor.health, 0); assert.equal(report.originalActor.destroyed, true);
        report.scope += ' The original map places this building at zero health. Its retained rubble, health and destroyed state are unchanged; additional body poses are renderer-only inspection.';
    }
    report.environmentHd = await page.evaluate(() => window.__ra2debug.environmentHd);
    await page.waitForFunction(() => window.__ra2debug.renderableManager.getRenderableByGameObject(window.__sourceArtActor)
        ?.mainObj?.builder?.getHdPage?.(), undefined, { timeout: 30000 });
    if (multipleBodies) {
        if (removedSourceMembers.length) assert.deepEqual(await page.evaluate(names => window.__ra2debug.game.world.getAllObjects()
            .filter(actor => names.includes(actor.name)).map(actor => actor.name), removedSourceMembers), []);
        report.groupBindings = await page.evaluate(sources => {
            const d = window.__ra2debug;
            return sources.map(source => {
                const actor = d.game.world.getAllObjects().find(actor => actor.name === source.identity && actor.isSpawned && !actor.isDestroyed);
                const model = actor && d.renderableManager.getRenderableByGameObject(actor)?.mainObj;
                return { identity: source.identity, member: source.member, sourceSha256: source.sha256,
                    actor: actor?.id, override: model?.builder?.hdOverride?.identity, page: !!model?.builder?.getHdPage?.() };
            });
        }, drawableBodySources.map(source => ({ identity: source.identity, member: source.member, sha256: source.sha256 })));
        assert(report.groupBindings.every(binding => binding.page && binding.override?.includes(binding.sourceSha256)));
        if (removedSourceMembers.length) {
            report.completeFamilyAdmission = await page.evaluate(family => {
                const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__sourceArtActor);
                const members = r.imageFinder.theater.environmentHd.families.get(family);
                return [...members].map(([source, override]) => ({ member: source.filename,
                    frames: override.frames.length, uploaded: override.pages.every(page =>
                        !!d.renderer.renderer.properties.get(page.base).__webglTexture
                        && !!d.renderer.renderer.properties.get(page.data).__webglTexture) }));
            }, resources.family);
            assert.deepEqual(report.completeFamilyAdmission.map(row => row.member).sort(), bodySources.map(source => source.member).sort());
            assert(report.completeFamilyAdmission.every(row => row.uploaded));
        }
    }
    report.before = await worldState(page);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.mapRenderable.shroudLayer?.update(0);
        d.gameScreen.gameAnimationLoop.stop();
    });
    if (process.argv.includes('--isolate-actor')) {
        report.isolatedActor = await page.evaluate(() => {
            const d = window.__ra2debug, hidden = [];
            if (!window.__sourceArtActor.isBuilding()) throw Error('Full actor isolation requires an original building');
            for (const actor of d.game.world.getAllObjects()) {
                if (actor === window.__sourceArtActor) continue;
                const renderable = d.renderableManager.getRenderableByGameObject(actor);
                if (!renderable?.get3DObject()) continue;
                renderable.get3DObject().visible = false;
                hidden.push({ id: actor.id, name: actor.name });
            }
            const staticTerrain = d.mapRenderable.terrainLayer.get3DObject();
            staticTerrain.visible = false;
            d.worldScene.meshBatchManager.updateMeshes();
            return { actor: window.__sourceArtActor.id, hidden, hiddenStaticTerrainLayer: staticTerrain.name };
        });
        report.scope += ' All other actor renderers, including the separate static terrain sprite batch, are hidden only for complete diagnostic silhouette inspection. Original TMP tiles and every world actor, health, position and task remain unchanged.';
    }
    const hiddenNames = process.argv.find(value => value.startsWith('--hide-renderers='))?.slice(17).split(',');
    if (hiddenNames?.length) {
        report.hiddenRenderers = await page.evaluate(names => {
            const d = window.__ra2debug, hidden = [];
            for (const actor of d.game.world.getAllObjects()) if (names.includes(actor.name)) {
                const renderable = d.renderableManager.getRenderableByGameObject(actor);
                if (!renderable?.get3DObject()) continue;
                renderable.get3DObject().visible = false;
                hidden.push({ id: actor.id, name: actor.name, health: actor.healthTrait?.health });
            }
            d.worldScene.meshBatchManager.updateMeshes();
            return hidden;
        }, hiddenNames);
        assert(hiddenNames.every(name => report.hiddenRenderers.some(actor => actor.name === name)));
        report.scope += ' Named neighboring renderers are hidden only to expose the source-occluded actor. All original world objects, health, ownership and task state remain unchanged.';
    }
    if (destroyAnimation) {
        report.destroyAnimationRoute = await page.evaluate(name => {
            const d = window.__ra2debug, manager = d.renderableManager, container = manager.getRenderableContainer();
            const building = manager.getRenderableByGameObject(window.__sourceArtActor);
            const before = new Set(container.getChildren());
            building.createDestructionAnims(manager);
            const created = container.getChildren().filter(child => !before.has(child));
            const animation = created.find(child => child.name === name);
            if (!animation || created.filter(child => child.name === name).length !== 1)
                throw Error('The actual building death renderer did not create its original animation once');
            const count = container.getChildren().length;
            building.createDestructionAnims(manager);
            if (container.getChildren().length !== count) throw Error('Duplicate source destruction animation');
            container.processRenderQueue();
            building.get3DObject().visible = false;
            for (const child of created) if (child !== animation) child.get3DObject().visible = false;
            window.__sourceArtAnimation = animation;
            const scene = d.worldScene.scene, automatic = scene.matrixWorldAutoUpdate;
            scene.matrixWorldAutoUpdate = true;
            try { scene.updateMatrixWorld(true); } finally { scene.matrixWorldAutoUpdate = automatic; }
            d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
            return { name, createdExactlyOnce: true, props: animation.getAnimProps(), gameSpeed: animation.gameSpeed.value,
                originalPosition: building.getPosition(), animationPosition: animation.getPosition(),
                scope: 'The real building destruction renderer creates this visual effect. The original source actor remains alive in the frozen inspection world.' };
        }, destroyAnimation);
    }
    if (cameraZoom !== 1) {
        report.cameraZoom = await page.evaluate(zoom => {
            const d = window.__ra2debug, world = d.worldScene;
            const before = world.cameraZoom.getZoom();
            world.cameraZoom.zoom = world.lastCameraZoom = zoom; world.camera.zoom = zoom;
            world.camera.updateProjectionMatrix(); world.updateCamera(world.cameraPan.getPan(), zoom);
            d.renderableManager.getRenderableContainer().cullRenderables(world.viewport.width);
            const automatic = world.scene.matrixWorldAutoUpdate; world.scene.matrixWorldAutoUpdate = true;
            try { world.scene.updateMatrixWorld(true); } finally { world.scene.matrixWorldAutoUpdate = automatic; }
            world.meshBatchManager.updateMeshes(); d.renderer.render();
            return { before, after: world.cameraZoom.getZoom(),
                scope: 'Renderer-only source-actor close-up; original world, placement and objectives are unchanged.' };
        }, cameraZoom);
    }
    report.framing = await page.evaluate(cameraZoom => {
        const d = window.__ra2debug, w = d.worldScene;
        const model = window.__sourceArtAnimation?.mainObj
            ?? d.renderableManager.getRenderableByGameObject(window.__sourceArtActor).mainObj;
        const mesh = model.getShapeMesh(), positions = mesh.geometry.getAttribute('position'), v = w.viewport;
        if (cameraZoom === 2) {
            const free = w.cameraPan.freeCamera, previous = free.value, observations = [];
            free.value = true;
            try {
                for (let pass = 0; pass < 3; pass++) {
                    w.updateCamera(w.cameraPan.getPan(), cameraZoom);
                    d.renderableManager.getRenderableContainer().cullRenderables(v.width);
                    const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
                    try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
                    const points = Array.from({ length: positions.count }, (_, index) => w.camera.position.clone()
                        .set(positions.getX(index), positions.getY(index), positions.getZ(index))
                        .applyMatrix4(mesh.matrixWorld).project(w.camera));
                    const x = (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) * v.width / 4;
                    const y = -(Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) * v.height / 4;
                    const pan = w.cameraPan.getPan(); observations.push({ x, y, pan });
                    w.cameraPan.setPan({ x: pan.x + x, y: pan.y + y });
                }
            } finally { free.value = previous; }
            w.updateCamera(w.cameraPan.getPan(), cameraZoom);
            d.renderableManager.getRenderableContainer().cullRenderables(v.width);
            if (!window.__sourceArtAnimation) d.renderableManager.getRenderableByGameObject(window.__sourceArtActor).update(0);
            d.renderer.render();
            return { observations, scope: 'Renderer-only source-actor close-up and complete map-edge framing.' };
        }
        const points = Array.from({ length: positions.count }, (_, index) => w.camera.position.clone()
            .set(positions.getX(index), positions.getY(index), positions.getZ(index))
            .applyMatrix4(mesh.matrixWorld).project(w.camera));
        const center = {
            x: (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) * v.width / 4,
            y: -(Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) * v.height / 4,
        };
        const before = w.cameraPan.getPan(), zoom = w.cameraZoom.getZoom();
        const freeCamera = w.cameraPan.freeCamera, previous = freeCamera.value;
        freeCamera.value = true;
        try { w.cameraPan.setPan({ x: before.x + center.x / zoom, y: before.y + center.y / zoom }); }
        finally { freeCamera.value = previous; }
        const after = w.cameraPan.getPan(); w.updateCamera(after, zoom); d.renderer.render();
        return { before, after, scope: 'Diagnostic camera framing permits the complete native sprite beyond ordinary map-edge pan limits. No actor, simulation or objective changes.' };
    }, cameraZoom);
    await page.screenshot({ path: path.join(out, 'diagnostic-full-scene.png') });
    for (let frame = 0; frame < displayFrames; frame++) {
        const result = await page.evaluate(({ frame, rubbleFrame, activeAnimation }) => {
            const d = window.__ra2debug, w = d.worldScene, object = window.__sourceArtActor;
            const renderable = window.__sourceArtAnimation ?? d.renderableManager.getRenderableByGameObject(object);
            const rubble = frame === rubbleFrame, model = rubble ? renderable.rubbleObj : renderable.mainObj;
            if (!model) throw Error('Requested native display object is unavailable');
            if (activeAnimation) for (const [type, list] of renderable.animArtProps.getAll()) {
                const ordinal = list.findIndex(source => source.name === activeAnimation);
                if (ordinal < 0) continue;
                const source = list[ordinal], sprite = renderable.animObjects.get(type)[ordinal];
                const animation = renderable.animations.get(sprite);
                animation.props.setArt(frame === 1 && source.damagedArt ? source.damagedArt : source.art);
                sprite.get3DObject().visible = !rubble;
                sprite.setFrame(animation.props.start);
            }
            renderable.mainObj.get3DObject().visible = !rubble;
            if (renderable.rubbleObj) renderable.rubbleObj.get3DObject().visible = rubble;
            model.setFrame(frame);
            const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
            try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
            w.meshBatchManager.updateMeshes(); d.renderer.render();
            const mesh = model.getShapeMesh(), b = model.builder, hd = b.getHdPage?.();
            const sample = b.hdOverride?.frames[frame + b.frameOffset]?.sampleRect;
            const logical = b.getSpriteGeometryOptions(frame).logicalSize;
            const shadow = model.shadowRenderable;
            const gl = d.renderer.renderer, v = w.viewport, ratio = gl.domElement.width / d.renderer.width;
            const positions = mesh.geometry.getAttribute('position');
            const points = Array.from({ length: positions.count }, (_, index) => {
                const p = w.camera.position.clone().set(positions.getX(index), positions.getY(index), positions.getZ(index))
                    .applyMatrix4(mesh.matrixWorld).project(w.camera);
                return [(v.x + (p.x + 1) * v.width / 2) * ratio, (v.y + (1 - p.y) * v.height / 2) * ratio];
            });
            const bounds = [Math.floor(Math.min(...points.map(p => p[0]))), Math.floor(Math.min(...points.map(p => p[1]))),
                Math.ceil(Math.max(...points.map(p => p[0]))), Math.ceil(Math.max(...points.map(p => p[1])))];
            if (bounds[0] < 0 || bounds[1] < 0 || bounds[2] > gl.domElement.width || bounds[3] > gl.domElement.height)
                throw Error('Original complete actor bounds exceed viewport: ' + JSON.stringify(bounds));
            const left = Math.max(0, bounds[0] - 24), top = Math.max(0, bounds[1] - 24);
            const width = Math.min(gl.domElement.width, bounds[2] + 24) - left;
            const height = Math.min(gl.domElement.height, bounds[3] + 24) - top;
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(gl.domElement, left, top, width, height, 0, 0, width, height);
            return { frame, displayObject: rubble ? 'rubbleObj' : 'mainObj',
                flat: b.flat, id: object.id, tick: d.game.currentTick, hash: d.game.getHash(), bounds,
                override: b.hdOverride?.identity, sample: sample && [sample.width, sample.height],
                logical: [logical.width, logical.height],
                gpuHd: !!hd && mesh.material.type === 'HdSpriteMaterial' && mesh.material.map === hd.base,
                shadowFrame: shadow?.builder?.frameNo, expectedShadowFrame: shadow?.computeShadowFrameNo(frame),
                originalShadowHdOverride: !!shadow?.builder?.hdOverride,
                glError: gl.getContext().getError(), png: canvas.toDataURL('image/png') };
        }, { frame, rubbleFrame, activeAnimation });
        assert.equal(result.tick, report.before.tick); assert.equal(result.hash, report.before.hash);
        assert(result.override.includes(sourceHash)); assert(result.gpuHd); assert.equal(result.glError, 0);
        assert.deepEqual(result.sample, result.logical.map(size => size * density));
        assert.equal(result.shadowFrame, result.expectedShadowFrame);
        assert.equal(result.originalShadowHdOverride, false);
        const file = `diagnostic-native-frame-${frame}.png`;
        await fs.writeFile(path.join(out, file), Buffer.from(result.png.split(',')[1], 'base64'));
        delete result.png; report.frames.push({ ...result, file });
    }
    if (process.argv.includes('--compound-poses')) {
        assert(multipleBodies, 'Compound poses require separately pinned original building bodies');
        const previousCompoundCamera = await page.evaluate(() => {
            const w = window.__ra2debug.worldScene;
            return { pan: w.cameraPan.getPan(), zoom: w.camera.zoom };
        });
        report.compoundCameraZoom = compoundCameraZoom;
        if (compoundCameraZoom !== cameraZoom)
            report.scope += ' The complete compound overview uses the recorded camera zoom to fit the viewport; individual source states retain the requested camera zoom and independent resource density.';
        report.compoundPoses = [];
        for (let frame = 0; frame < displayFrames; frame++) {
            const pose = await page.evaluate(({ sources, frame, rubbleFrame, compoundCameraZoom }) => {
                const d = window.__ra2debug, w = d.worldScene, gl = d.renderer.renderer;
                w.cameraZoom.zoom = w.lastCameraZoom = compoundCameraZoom;
                w.camera.zoom = compoundCameraZoom; w.camera.updateProjectionMatrix();
                const ratio = gl.domElement.width / d.renderer.width, v = w.viewport, models = [];
                for (const source of sources) {
                    const actor = d.game.world.getAllObjects().find(actor => actor.name === source.identity
                        && actor.isSpawned && !actor.isDestroyed);
                    const renderable = d.renderableManager.getRenderableByGameObject(actor);
                    renderable.get3DObject().visible = true;
                    renderable.mainObj.get3DObject().visible = frame !== rubbleFrame;
                    if (renderable.rubbleObj) renderable.rubbleObj.get3DObject().visible = frame === rubbleFrame;
                    const model = frame === rubbleFrame ? renderable.rubbleObj : renderable.mainObj;
                    model.setFrame(frame); models.push({ source, actor, model });
                }
                const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
                try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
                const free = w.cameraPan.freeCamera, previousFree = free.value; free.value = true;
                try {
                    for (let pass = 0; pass < 3; pass++) {
                        w.updateCamera(w.cameraPan.getPan(), compoundCameraZoom);
                        const projected = models.flatMap(({ model }) => {
                            const mesh = model.getShapeMesh(), positions = mesh.geometry.getAttribute('position');
                            return Array.from({ length: positions.count }, (_, index) => w.camera.position.clone()
                                .set(positions.getX(index), positions.getY(index), positions.getZ(index))
                                .applyMatrix4(mesh.matrixWorld).project(w.camera));
                        });
                        const pan = w.cameraPan.getPan();
                        w.cameraPan.setPan({ x: pan.x + (Math.min(...projected.map(p => p.x)) + Math.max(...projected.map(p => p.x))) * v.width / 4,
                            y: pan.y - (Math.min(...projected.map(p => p.y)) + Math.max(...projected.map(p => p.y))) * v.height / 4 });
                    }
                } finally { free.value = previousFree; }
                w.updateCamera(w.cameraPan.getPan(), compoundCameraZoom);
                w.meshBatchManager.updateMeshes(); d.renderer.render();
                const points = [], bindings = [];
                for (const { source, actor, model } of models) {
                    const mesh = model.getShapeMesh(), positions = mesh.geometry.getAttribute('position');
                    for (let index = 0; index < positions.count; index++) {
                        const point = w.camera.position.clone().set(positions.getX(index), positions.getY(index), positions.getZ(index))
                            .applyMatrix4(mesh.matrixWorld).project(w.camera);
                        points.push([(v.x + (point.x + 1) * v.width / 2) * ratio,
                            (v.y + (1 - point.y) * v.height / 2) * ratio]);
                    }
                    const hd = model.builder.getHdPage(), logical = model.builder.getSpriteGeometryOptions(frame).logicalSize;
                    const sample = model.builder.hdOverride.frames[frame + model.builder.frameOffset].sampleRect;
                    bindings.push({ identity: source.identity, actor: actor.id, override: model.builder.hdOverride.identity,
                        gpuHd: mesh.material.type === 'HdSpriteMaterial' && mesh.material.map === hd.base,
                        logical: [logical.width, logical.height], sample: [sample.width, sample.height] });
                }
                const bounds = [Math.floor(Math.min(...points.map(p => p[0]))), Math.floor(Math.min(...points.map(p => p[1]))),
                    Math.ceil(Math.max(...points.map(p => p[0]))), Math.ceil(Math.max(...points.map(p => p[1])))];
                if (bounds[0] < 0 || bounds[1] < 0 || bounds[2] > gl.domElement.width || bounds[3] > gl.domElement.height)
                    throw Error('Complete original compound exceeds viewport: ' + JSON.stringify(bounds));
                const left = Math.max(0, bounds[0] - 24), top = Math.max(0, bounds[1] - 24);
                const width = Math.min(gl.domElement.width, bounds[2] + 24) - left;
                const height = Math.min(gl.domElement.height, bounds[3] + 24) - top;
                const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(gl.domElement, left, top, width, height, 0, 0, width, height);
                return { frame, bounds, bindings, tick: d.game.currentTick, hash: d.game.getHash(),
                    glError: gl.getContext().getError(), png: canvas.toDataURL('image/png') };
            }, { sources: drawableBodySources.map(source => ({ identity: source.identity, sha256: source.sha256 })), frame,
                rubbleFrame, compoundCameraZoom });
            assert.equal(pose.tick, report.before.tick); assert.equal(pose.hash, report.before.hash);
            assert.equal(pose.glError, 0);
            for (const binding of pose.bindings) {
                assert(binding.gpuHd);
                assert(binding.override.includes(bodySources.find(source => source.identity === binding.identity).sha256));
                assert.deepEqual(binding.sample, binding.logical.map(size => size * density));
            }
            const file = `diagnostic-native-compound-${frame}.png`;
            await fs.writeFile(path.join(out, file), Buffer.from(pose.png.split(',')[1], 'base64'));
            delete pose.png; report.compoundPoses.push({ ...pose, file });
        }
        await page.evaluate(({ camera, isolated }) => {
            const d = window.__ra2debug, w = d.worldScene;
            w.cameraZoom.zoom = w.lastCameraZoom = camera.zoom; w.camera.zoom = camera.zoom;
            w.camera.updateProjectionMatrix(); w.cameraPan.setPan(camera.pan); w.updateCamera(camera.pan, camera.zoom);
            if (isolated) for (const actor of d.game.world.getAllObjects()) {
                if (actor !== window.__sourceArtActor)
                    d.renderableManager.getRenderableByGameObject(actor)?.get3DObject()?.visible
                        && (d.renderableManager.getRenderableByGameObject(actor).get3DObject().visible = false);
            }
            w.meshBatchManager.updateMeshes(); d.renderer.render();
        }, { camera: previousCompoundCamera, isolated: process.argv.includes('--isolate-actor') });
    }
    const ownerFrame = process.argv.find(value => value.startsWith('--owner-colors='))?.slice(15);
    if (ownerFrame !== undefined) {
        const frame = Number(ownerFrame), posed = report.frames.find(row => row.frame === frame);
        assert(posed, 'Owner-color probe needs an existing native display frame');
        const source = JSON.parse(await fs.readFile(path.join(resources.stage, 'prepared/source.json'))).sources
            .find(source => source.sha256 === sourceHash);
        const indices = await fs.readFile(path.join(resources.stage, 'prepared/native', source.frames[frame].indexFile));
        const nativeOwnerPixels = indices.filter(index => index >= 16 && index <= 31).length;
        const fixedMaterial = process.argv.includes('--expect-no-owner');
        assert(fixedMaterial ? nativeOwnerPixels === 0 : nativeOwnerPixels > 0,
            fixedMaterial ? 'Fixed-material probe requires an original frame without owner indices'
                : 'The original display frame must contain a house-color region');
        const captures = await page.evaluate(({ frame, bounds }) => {
            const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__sourceArtActor);
            const model = r.mainObj, original = model.builder.palette, w = d.worldScene;
            model.get3DObject().visible = true;
            if (r.rubbleObj) r.rubbleObj.get3DObject().visible = false;
            model.setFrame(frame);
            const [left, top, right, bottom] = bounds;
            const canvas = document.createElement('canvas'); canvas.width = right - left; canvas.height = bottom - top;
            const context = canvas.getContext('2d'), captures = [];
            const score = (palette, channel) => {
                const color = palette.getColor(16); return channel === 'red' ? color.r - color.b : color.b - color.r;
            };
            const palettes = ['red', 'blue'].map(channel => [...r.paletteRemaps]
                .sort((a, b) => score(b, channel) - score(a, channel))[0]);
            if (palettes[0].hash === palettes[1].hash) throw Error('Two original registered house palettes are required');
            try {
                for (const palette of palettes) {
                    model.setPalette(palette);
                    w.meshBatchManager.updateMeshes(); d.renderer.render();
                    context.clearRect(0, 0, canvas.width, canvas.height);
                    context.drawImage(d.renderer.renderer.domElement, left, top, canvas.width, canvas.height,
                        0, 0, canvas.width, canvas.height);
                    captures.push(canvas.toDataURL('image/png'));
                }
            } finally { model.setPalette(original); w.meshBatchManager.updateMeshes(); d.renderer.render(); }
            return captures;
        }, { frame, bounds: posed.bounds });
        const images = captures.map(capture => PNG.sync.read(Buffer.from(capture.split(',')[1], 'base64')));
        let changedPixels = 0, changedAlphaPixels = 0;
        for (let i = 0; i < images[0].data.length; i += 4) {
            if ([0, 1, 2].some(channel => images[0].data[i + channel] !== images[1].data[i + channel])) changedPixels++;
            if (images[0].data[i + 3] !== images[1].data[i + 3]) changedAlphaPixels++;
        }
        report.ownerColors = { frame, nativeOwnerPixels, changedPixels, changedAlphaPixels, fixedMaterial,
            scope: 'Diagnostic renderer palettes only. Original actor ownership, simulation and source objectives remain unchanged.' };
        for (const [index, color] of ['red', 'blue'].entries())
            await fs.writeFile(path.join(out, `diagnostic-owner-${color}.png`), PNG.sync.write(images[index]));
        assert(fixedMaterial ? changedPixels === 0 : changedPixels > 0,
            fixedMaterial ? 'Original fixed material changes under a diagnostic house palette'
                : 'Native house-color region does not respond to renderer palette changes');
        assert.equal(changedAlphaPixels, 0);
    }
    if (activeAnimation) {
        const [source] = preparedSource.sources.filter(source => source.bindingRole === 'ACTIVE');
        assert(source && source.identity === identity);
        const profile = JSON.parse(await fs.readFile(path.join(resources.stage, 'material-profile.json')));
        const markers = profile.nativePaletteMarkerFrames?.[source.member]?.frames ?? {};
        report.activeFrames = [];
        await page.evaluate(({ name, composite }) => {
            const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__sourceArtActor);
            for (const [type, list] of r.animArtProps.getAll()) for (const [ordinal, art] of list.entries()) {
                if (art.name !== name) continue;
                const sprite = r.animObjects.get(type)[ordinal];
                window.__sourceActiveArt = { r, art, sprite, animation: r.animations.get(sprite) };
            }
            if (!window.__sourceActiveArt) throw Error('Original declared active animation is absent');
            r.mainObj.setFrame(0);
            r.mainObj.get3DObject().visible = composite;
            if (r.rubbleObj) r.rubbleObj.get3DObject().visible = false;
        }, { name: activeAnimation, composite: activeComposite });
        for (let frame = 0; frame < source.bodyFrames; frame++) {
            if (Object.hasOwn(markers, frame)) continue;
            const result = await page.evaluate(({ frame, composite }) => {
                const d = window.__ra2debug, w = d.worldScene, { r, sprite } = window.__sourceActiveArt;
                sprite.get3DObject().visible = true; sprite.setFrame(frame);
                const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
                try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
                w.meshBatchManager.updateMeshes(); d.renderer.render();
                const b = sprite.builder, mesh = sprite.getShapeMesh(), hd = b.getHdPage?.();
                const sample = b.hdOverride?.frames[frame + b.frameOffset]?.sampleRect;
                const logical = b.getSpriteGeometryOptions(frame).logicalSize;
                const gl = d.renderer.renderer, viewport = w.viewport;
                const ratio = gl.domElement.width / d.renderer.width;
                const points = [sprite, ...(composite ? [r.mainObj] : [])].flatMap(model => {
                    const part = model.getShapeMesh(), positions = part.geometry.getAttribute('position');
                    return Array.from({ length: positions.count }, (_, index) => {
                    const p = w.camera.position.clone().set(positions.getX(index), positions.getY(index),
                        positions.getZ(index)).applyMatrix4(part.matrixWorld).project(w.camera);
                    return [(viewport.x + (p.x + 1) * viewport.width / 2) * ratio,
                        (viewport.y + (1 - p.y) * viewport.height / 2) * ratio];
                    });
                });
                const bounds = [Math.floor(Math.min(...points.map(p => p[0]))),
                    Math.floor(Math.min(...points.map(p => p[1]))),
                    Math.ceil(Math.max(...points.map(p => p[0]))), Math.ceil(Math.max(...points.map(p => p[1])))];
                if (bounds[0] < 0 || bounds[1] < 0 || bounds[2] > gl.domElement.width || bounds[3] > gl.domElement.height)
                    throw Error('Original active sprite exceeds the diagnostic viewport');
                const left = Math.max(0, bounds[0] - 24), top = Math.max(0, bounds[1] - 24);
                const width = Math.min(gl.domElement.width, bounds[2] + 24) - left;
                const height = Math.min(gl.domElement.height, bounds[3] + 24) - top;
                const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(gl.domElement, left, top, width, height, 0, 0, width, height);
                return { frame, tick: d.game.currentTick, hash: d.game.getHash(), bounds,
                    composite, bodyFrame: composite ? r.mainObj.builder.getFrame() : undefined,
                    bodyGpuHd: composite ? !!r.mainObj.builder.getHdPage?.() : undefined,
                    bodyShadowFrame: composite ? r.mainObj.shadowRenderable?.builder?.frameNo : undefined,
                    expectedBodyShadowFrame: composite ? r.mainObj.shadowRenderable?.computeShadowFrameNo(0) : undefined,
                    originalBodyShadowHdOverride: composite ? !!r.mainObj.shadowRenderable?.builder?.hdOverride : undefined,
                    override: b.hdOverride?.identity, sample: sample && [sample.width, sample.height],
                    logical: [logical.width, logical.height],
                    gpuHd: !!hd && mesh.material.type === 'HdSpriteMaterial' && mesh.material.map === hd.base,
                    shadowFrame: sprite.shadowRenderable?.builder?.frameNo,
                    expectedShadowFrame: sprite.shadowRenderable?.computeShadowFrameNo(frame),
                    originalShadowHdOverride: !!sprite.shadowRenderable?.builder?.hdOverride,
                    glError: gl.getContext().getError(), png: canvas.toDataURL('image/png') };
            }, { frame, composite: activeComposite });
            assert.equal(result.tick, report.before.tick); assert.equal(result.hash, report.before.hash);
            assert(result.override.includes(source.sha256)); assert(result.gpuHd); assert.equal(result.glError, 0);
            assert.deepEqual(result.sample, result.logical.map(size => size * density));
            assert.equal(result.shadowFrame, result.expectedShadowFrame); assert(!result.originalShadowHdOverride);
            if (activeComposite) {
                assert.equal(result.bodyFrame, 0); assert(result.bodyGpuHd);
                assert.equal(result.bodyShadowFrame, result.expectedBodyShadowFrame);
                assert(!result.originalBodyShadowHdOverride);
            }
            const file = `diagnostic-active-frame-${frame}.png`;
            await fs.writeFile(path.join(out, file), Buffer.from(result.png.split(',')[1], 'base64'));
            const { png, ...observation } = result; report.activeFrames.push({ ...observation, file });
        }
        report.activeClockPlayback = await page.evaluate(() => {
            const { r, art, sprite, animation } = window.__sourceActiveArt, rows = [];
            for (const [damaged, original] of [[false, art.art], [true, art.damagedArt]]) {
                if (!original) continue;
                animation.props.setArt(original); animation.reset(); animation.start(0);
                const props = animation.props, rate = props.rate * animation.speed.value;
                const frames = [], initialLength = props.loopEnd - props.start + 1;
                const loopLength = props.loopEnd - props.loopStart + 1;
                for (let i = 0; i < initialLength + loopLength + 2; i++) {
                    animation.update((i + .001) * 1000 / rate); r.onViewCullRestore();
                    frames.push({ clock: animation.getCurrentFrame(), display: sprite.builder.frameNo,
                        expected: i < initialLength ? props.start + i
                            : props.loopStart + (i - initialLength) % loopLength });
                }
                rows.push({ damaged, start: props.start, loopStart: props.loopStart, loopEnd: props.loopEnd,
                    loopCount: props.loopCount, rate, frames });
            }
            r.mainObj.get3DObject().visible = true;
            return { rows, scope: 'Actual source healthy/damaged animation props and native clocks; '
                + 'renderer-only phase selection leaves simulation, actor health and objectives unchanged.' };
        });
        for (const row of report.activeClockPlayback.rows) {
            assert.equal(row.loopCount, -1);
            for (const frame of row.frames) {
                assert.equal(frame.clock, frame.expected); assert.equal(frame.display, frame.expected);
                assert(!Object.hasOwn(markers, frame.display));
            }
        }
    }
    if (destroyAnimation) {
        report.rendererClockPlayback = await page.evaluate(() => {
            const d = window.__ra2debug, animation = window.__sourceArtAnimation;
            const props = animation.getAnimProps(), rate = props.rate * animation.gameSpeed.value;
            const time = performance.now(), frames = [];
            animation.reset();
            for (let i = 0; i <= props.frameCount + 2; i++) {
                animation.update(time + i * 1000 / rate + .001);
                frames.push(animation.mainObj?.builder.getFrame());
            }
            const removed = !d.renderableManager.getRenderableContainer().getChildren().includes(animation);
            d.renderableManager.getRenderableByGameObject(window.__sourceArtActor).get3DObject().visible = true;
            return { rate, sourceFrames: props.frameCount, frames, removed,
                scope: 'The native animation and transient lifecycle consume an explicit renderer clock while simulation remains frozen.' };
        });
        assert(report.rendererClockPlayback.removed);
    }
    report.after = await worldState(page);
    assert.deepEqual(report.after, report.before);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    if (process.argv.includes('--trace-programs')) {
        report.programCompilation = await page.evaluate(() => window.__programLifetime);
        assert(report.programCompilation.every(span => span.finished
            && span.materials.every(material => !material.disposals.length)), 'Pending shader materials must remain alive');
    }
    if (process.argv.includes('--exit-scene')) {
        await page.evaluate(() => {
            const d = window.__ra2debug;
            window.__sourceArtOldWorld = { environment: d.environmentHd, terrain: d.terrainHd };
            d.gameScreen.controller.goToScreen(0);
        });
        await page.waitForFunction(() => window.__sourceArtOldWorld.environment.disposed
            && window.__sourceArtOldWorld.terrain.disposed, undefined, { timeout: 30000 });
        report.release = await page.evaluate(() => window.__sourceArtOldWorld);
        for (const kind of ['environment', 'terrain']) {
            assert.equal(report.release[kind].worldChargeBytes, 0);
            assert.equal(report.release[kind].disposed, true);
        }
    }
    report.status = 'PASS_NATIVE_FROZEN_COMPLETE_SHP_DISPLAY_STATES_AND_BOTH_AXES_HD_DENSITY';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    page ??= pilot?.session?.page; app ??= pilot?.session?.app;
    if (page) report.bindingFailure = await page.evaluate(() => {
        const d = window.__ra2debug, r = window.__sourceArtActor
            && d?.renderableManager?.getRenderableByGameObject(window.__sourceArtActor);
        const describe = model => model && ({ type: model.constructor.name, image: model.builder?.shpFile?.filename,
            builderKeys: Object.keys(model.builder ?? {}), override: model.builder?.hdOverride?.identity,
            page: !!model.builder?.getHdPage?.() });
        return { main: describe(r?.mainObj), rubble: describe(r?.rubbleObj),
            renderableKeys: Object.keys(r ?? {}), hdReport: d?.environmentHd };
    }).catch(() => undefined);
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    if (process.argv.includes('--trace-programs') && page) {
        report.programCompilation = await page.evaluate(() => window.__programLifetime).catch(() => undefined);
    }
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await (app ?? pilot?.session?.app)?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
