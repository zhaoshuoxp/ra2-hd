// Verify native outpost service activates all three related mechanical animations.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function validateNativeTechnologyService(session) {
    const { page, report, out } = session;
    const result = report.newNativeTechnologyService = {};
    const id = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        const object = d.game.getWorld().getAllObjects().find(o => o.name === 'CAOUTP'
            && o.isSpawned && !o.isDestroyed && o.owner.isNeutral);
        if (!object?.unitRepairTrait) throw Error('Original map lacks a functioning native repair outpost');
        f.serviceOutpost = object;
        f.serviceEngineer = f.spawn('ENGINEER', 3, object.tile);
        d.actionsApi.orderUnits([f.serviceEngineer.id], 7, object.id);
        return object.id;
    });
    await page.waitForFunction(id => window.__ra2debug.game.getWorld().getAllObjects()
        .find(o => o.id === id)?.owner === window.__allied.player, id, { timeout: 45000 });
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        const vehicle = f.serviceVehicle = f.spawn('MTNK', 7, f.serviceOutpost.tile);
        vehicle.healthTrait.inflictDamage(Math.floor(vehicle.healthTrait.maxHitPoints * .4), vehicle, d.game);
        window.__m24ServiceTrace = [];
        window.__m24ServiceTimer = setInterval(() => {
            const r = d.renderableManager.getRenderableByGameObject(f.serviceOutpost);
            window.__m24ServiceTrace.push({ tick: d.game.currentTick, health: vehicle.healthTrait.health,
                docked: f.serviceOutpost.dockTrait.isDocked(vehicle),
                parts: [...r.animObjects.values()].flat().map(part => {
                    const file = [...r.aggregatedImageData.imageIndexes.entries()]
                        .find(([, offset]) => offset === part.builder.frameOffset)?.[0];
                    return { sourceImage: r.animations.get(part)?.props.getArt().getString('Image')
                        || file?.filename.toUpperCase().replace(/\.SHP$/, ''),
                        sourceMember: file?.filename, frame: part.builder.getFrame(),
                        visible: !!part.get3DObject()?.visible, hd: part.builder.hdOverride?.identity };
                }) });
        }, 60);
        d.worldInteraction.minimapHandler.panToTile(f.serviceOutpost.tile);
        d.actionsApi.orderUnits([vehicle.id], 13, f.serviceOutpost.id);
    });
    const phases = ['CAOUTP_A', 'CAOUTP_B', 'CAOUTP_C'];
    result.phases = [];
    for (const sourceImage of phases) {
        try {
            await page.waitForFunction(name => window.__m24ServiceTrace.at(-1)?.parts
                .some(p => p.sourceImage === name && p.visible && p.hd), sourceImage, { timeout: 45000 });
        } catch (error) {
            result.trace = await page.evaluate(() => {
                clearInterval(window.__m24ServiceTimer);
                return window.__m24ServiceTrace;
            });
            throw error;
        }
        const captured = await page.evaluate(name => {
            const d = window.__ra2debug;
            d.renderer.render();
            return { pixels: d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1],
                sample: window.__m24ServiceTrace.at(-1), sourceImage: name };
        }, sourceImage);
        assert(captured.sample.parts.some(p => p.sourceImage === sourceImage && p.visible && p.hd));
        const file = `${sourceImage.toLowerCase()}-native-service-framebuffer.png`;
        await fs.writeFile(path.join(out, file), Buffer.from(captured.pixels, 'base64'));
        result.phases.push({ sourceImage, capture: { file, rescaled: false }, sample: captured.sample });
    }
    await page.waitForFunction(() => window.__allied.serviceVehicle.healthTrait.health === 100,
        undefined, { timeout: 45000 });
    result.trace = await page.evaluate(() => {
        clearInterval(window.__m24ServiceTimer);
        return window.__m24ServiceTrace;
    });
    assert(result.trace.some(s => s.docked && s.health < 100));
    assert(result.trace.at(-1).health === 100);
    for (const sourceImage of phases) {
        const samples = result.trace.flatMap(s => s.parts.filter(p => p.sourceImage === sourceImage && p.visible));
        assert(samples.length && samples.every(p => p.hd));
        assert(new Set(samples.map(p => p.frame)).size > 1, `${sourceImage}: original motion must advance`);
    }
    result.status = 'PASS_NATIVE_OUTPOST_VEHICLE_REPAIR_AND_ALL_THREE_MECHANICAL_PHASES';
    result.policy = 'Original placed outpost, legal engineer/vehicle fixtures, native Capture and Dock orders, original repair rates and animation timing; no map/rule/frame edits.';
}
