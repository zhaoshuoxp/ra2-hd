import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, worldState } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]), mission = process.argv[3], name = process.argv[4], density = Number(process.argv[5] ?? 2);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], mission, name, density,
    scope: 'Explicit frozen diagnostic reveal and camera inspection of an original source actor. No source, actor, health, owner, task, RNG or objective changes; not mission acceptance.' };
let session;
try {
    session = await campaignSession(out, report, { edition: 'yr', density });
    await session.page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), mission);
    await waitWorld(session.page, mission);
    report.before = await worldState(session.page);
    report.binding = await session.page.evaluate(name => {
        const d = window.__ra2debug, g = d.game, w = d.worldScene;
        g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        const actor = g.world.getAllObjects().find(unit => unit.name === name && unit.isSpawned && !unit.isDestroyed);
        if (!actor) throw Error('Original actor absent');
        const free = w.cameraPan.freeCamera, prior = free.value; free.value = true;
        try { d.worldInteraction.minimapHandler.panToTile(actor.tile); } finally { free.value = prior; }
        w.updateCamera(w.cameraPan.getPan(), w.cameraZoom.getZoom());
        d.renderableManager.getRenderableContainer().cullRenderables(w.viewport.width);
        const model = d.renderableManager.getRenderableByGameObject(actor);
        const describe = object => object && { type: object.constructor.name, keys: Object.keys(object),
            builder: object.builder && { type: object.builder.constructor.name, keys: Object.keys(object.builder),
                hd: object.builder.hdOverride?.identity, source: object.builder.getSource?.(), page: !!object.builder.getHdPage?.() } };
        return { id: actor.id, tile: [actor.tile.rx, actor.tile.ry], renderable: describe(model),
            main: describe(model?.mainObj), body: describe(model?.body), children: model?.getChildren?.().map(describe),
            environment: d.environmentHd };
    }, name);
    await session.page.screenshot({ path: path.join(out, 'frozen-binding.png') });
    report.after = await worldState(session.page); assert.deepEqual(report.after, report.before);
    report.status = 'PASS_READ_ONLY_FROZEN_RENDER_BINDING_OBSERVATION';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await session?.app.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
