import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, worldState, stepWorld } from '../m3-2/native-session.mjs';
import { observeProgramLifetime } from '../windows-hd/observe-program-lifetime.mjs';
import { closeCampaignMenuPaused } from '../campaign-completion/named-save-restart.mjs';

const [output, requestedDensity] = process.argv.slice(2);
const out = path.resolve(output), density = Number(requestedDensity);
const guarded = process.argv.includes('--expect-guard');
const mission = process.argv.find(value => value.startsWith('--mission='))?.slice(10) ?? 'all01umd.map';
const identities = (process.argv.find(value => value.startsWith('--identities='))?.slice(13) ?? 'YAPPET').split(',');
const initialTicks = Number(process.argv.find(value => value.startsWith('--initial-ticks='))?.slice(16) ?? 0);
const difficulty = process.argv.find(value => value.startsWith('--difficulty='))?.slice(13) ?? 'normal';
const checkpointFile = process.argv.find(value => value.startsWith('--checkpoint='))?.slice(13);
assert(identities.every(identity => ['YAPPET', 'YAGNTC', 'GACSPH'].includes(identity)));
assert(Number.isSafeInteger(initialTicks) && initialTicks >= 0);
assert(['easy', 'normal', 'hard'].includes(difficulty));
assert([0, 2, 4].includes(density));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mission, identities, initialTicks, difficulty, density, guarded, errors: [], failedResources: [], poses: [],
    scope: 'Fresh original actors; frozen renderer-only normal/damaged animation clocks and visibility. No actor health, owner, simulation, source, task or result edits. Actual source End and animation stop timing remain unchanged.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { edition: 'yr', density }));
    await observeProgramLifetime(page);
    if (checkpointFile) {
        const checkpoint = JSON.parse(await fs.readFile(path.resolve(checkpointFile)));
        assert.equal(checkpoint.identity.edition, 'yr'); assert.equal(checkpoint.identity.mission, mission);
        report.sourceCheckpoint = { file: checkpointFile, tick: checkpoint.tick, policy: checkpoint.options.campaign.semanticsVersion };
        await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22)
            .launchDiagnostic(checkpoint, checkpoint.identity.mission), checkpoint);
        await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
            && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 600000 });
        const restored = await worldState(page);
        assert.deepEqual({ worldHash: restored.hash, rng: restored.rng, mission: restored.mission,
            world: restored.world, pendingCallbacks: restored.pendingCallbacks }, checkpoint.expected);
        report.exactCheckpointRestoration = true;
        await closeCampaignMenuPaused(page);
    } else {
        await page.evaluate(({ mission, difficulty }) => {
            const screen = window.__ra2debug.mainMenuController.screens.get(22); screen.difficulty = difficulty;
            return screen.launchDiagnostic(undefined, mission);
        }, { mission, difficulty });
    }
    await waitWorld(page, mission);
    if (initialTicks) await stepWorld(page, initialTicks);
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        d.gameScreen.pointer.unlock(true); document.querySelector('[data-campaign-diagnostic]')?.remove();
    });
    report.before = await worldState(page);
    for (const identity of identities) {
        await page.evaluate(identity => {
            const d = window.__ra2debug;
            const actor = d.game.world.getAllObjects().find(actor => actor.name === identity && actor.isSpawned && !actor.isDestroyed);
            if (!actor) throw Error('Original source actor absent: ' + identity);
            window.__superFrameActor = actor;
            d.worldInteraction.minimapHandler.panToTile(actor.tile);
        }, identity);
        await page.waitForFunction(density => {
            const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__superFrameActor);
            return r?.mainObj?.builder && (!density || r.mainObj.builder.getHdPage?.());
        }, density, { timeout: 60000 });
        const rows = await page.evaluate(({ identity, density }) => {
            const d = window.__ra2debug, actor = window.__superFrameActor;
            const r = d.renderableManager.getRenderableByGameObject(actor);
            d.gameScreen.gameAnimationLoop.stop();
            window.__superFrameRenderable = r;
            r.get3DObject().visible = true;
            const rows = [];
            for (const [type, data] of r.animArtProps.getAll()) for (const [ordinal, source] of data.entries()) {
                if (!new RegExp('^' + identity + (identity === 'GACSPH' ? '_[EFGH]$' : '_[FH]$')).test(source.name)) continue;
                const sprite = r.animObjects.get(type)[ordinal], animation = r.animations.get(sprite);
                for (const [damaged, art] of [[false, source.art], [true, source.damagedArt]]) {
                    if (!art) throw Error('Original damaged animation art absent');
                    animation.props.setArt(art); animation.reset(); animation.start(0);
                    const frames = animation.props.loopEnd - animation.props.start;
                    if (animation.props.rate > 0)
                        animation.update((frames + 0.1) * 1000 / (animation.props.rate * animation.speed.value));
                    r.onViewCullRestore();
                    const builder = sprite.builder, frame = builder.frameNo, absolute = frame + builder.frameOffset;
                    const members = [...r.aggregatedImageData.imageIndexes].sort((a, b) => a[1] - b[1]);
                    const selected = members.find(([file, first], index) => absolute >= first
                        && absolute < (members[index + 1]?.[1] ?? r.aggregatedImageData.file.numImages / 2));
                    const expected = members.find(([, first]) => first === builder.frameOffset);
                    rows.push({ identity, name: source.name, damaged, nativeBodyFrames: animation.props.frameCount,
                        rate: animation.props.rate, start: animation.props.start, end: animation.props.end, loopEnd: animation.props.loopEnd,
                        animationFrame: animation.getCurrentFrame(), animationState: animation.getState(), displayFrame: frame,
                        expectedMember: expected[0].filename, actualMember: selected?.[0].filename,
                        houseColor: actor.owner.color.asHexString(), paletteHash: builder.palette.hash,
                        paletteIndex: sprite.getShapeMesh()?.paletteIndex,
                        crossMember: selected?.[0] !== expected[0], hd: !!builder.getHdPage?.(),
                        requestedDensity: density, health: actor.healthTrait.health });
                    sprite.get3DObject().visible = true;
                }
            }
            if (rows.length !== (identity === 'GACSPH' ? 8 : 4))
                throw Error('Expected every original normal and damaged superweapon layer');
            d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
            return rows;
        }, { identity, density });
        report.poses.push(...rows);
        await page.screenshot({ path: path.join(out, identity.toLowerCase() + '-source-end.png') });
        await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start());
    }
    for (const row of report.poses) {
        assert.equal(row.hd, density > 0);
        if (guarded) {
            assert.equal(row.crossMember, false);
            assert(row.displayFrame >= 0 && row.displayFrame < row.nativeBodyFrames);
            assert.equal(row.displayFrame, Math.min(row.animationFrame, row.nativeBodyFrames - 1));
        }
        if (row.identity !== 'GACSPH' && row.damaged && row.rate > 0) assert.equal(row.animationFrame, row.nativeBodyFrames);
    }
    report.after = await worldState(page); assert.deepEqual(report.after, report.before);
    if (!guarded) assert.equal(report.poses.filter(row => row.crossMember).length, identities.length * 2);
    report.programCompilation = await page.evaluate(() => window.__programLifetime);
    assert(report.programCompilation.every(span => span.finished && span.materials.every(material => !material.disposals.length)));
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = guarded ? 'PASS_NATIVE_ORIGINAL_AND_HD_SUPERWEAPON_FRAMES_WITH_UNCHANGED_CLOCKS'
        : 'PASS_REPRODUCED_ORIGINAL_SUPERWEAPON_ANIMATION_CROSS_MEMBER_READ';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    report.bindingDiagnostic = await page?.evaluate(() => {
        const d = window.__ra2debug, actor = window.__superFrameActor;
        const r = actor && d.renderableManager.getRenderableByGameObject(actor);
        const family = r?.imageFinder?.sovietUnitsHd;
        return { actor: actor && { id: actor.id, name: actor.name, spawned: actor.isSpawned,
            health: actor.healthTrait.health, destroyed: actor.isDestroyed },
            renderable: r && { visible: r.get3DObject().visible,
                currentAnimType: r.currentAnimType, initialAnimType: r.initialAnimType,
                pendingHd: !!r.pendingBuildingHd, hdDemand: !!r.releaseBuildingHd,
                aggregateMembers: [...r.aggregatedImageData.imageIndexes.keys()].map(image => image.filename),
                loadedMembers: [...(r.imageFinder.sovietBuildingsHd[actor.name]?.overrides.keys() ?? [])]
                    .map(image => image.filename),
                keys: Object.keys(r).filter(key => /hd|demand|view/i.test(key)),
                main: r.mainObj && { visible: r.mainObj.get3DObject().visible, frame: r.mainObj.builder.frameNo,
                    offset: r.mainObj.builder.frameOffset, override: r.mainObj.builder.hdOverride?.identity,
                    page: !!r.mainObj.builder.getHdPage?.() } },
            hd: family && { gpuBytes: family.report.gpuBytes, budget: family.report.budget,
                family: family.report.families[actor.name], viewportDemand: family.viewportBuildingDemand?.has(actor.name) } };
    }).catch(() => undefined);
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
