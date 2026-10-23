// Exercise original placed technology buildings through native capture and repair orders.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { recordOilMotion } from './record-oil-motion.mjs';
import { validateLinkedBuildingCycle } from './native-linked-building-cycle.mjs';

export async function recordTechnologyLinkedCycles(session, id, members, state, originalRenderer = false) {
    assert(['normal', 'damaged'].includes(state) && members.length);
    const declarations = await session.page.evaluate(({ id, members }) => {
        const d = window.__ra2debug;
        const object = d.game.getWorld().getAllObjects().find(object => object.id === id);
        if (object?.owner !== window.__allied.player) throw Error('Linked technology cycles require native captured ownership');
        const r = d.renderableManager.getRenderableByGameObject(object);
        return members.map(expected => {
            const candidates = [...r.animObjects.values()].flat().filter(part => {
                const source = [...r.aggregatedImageData.imageIndexes].find(([, offset]) => offset === part.builder.frameOffset)?.[0];
                return source?.filename === expected.member;
            });
            if (candidates.length !== 1) throw Error('Ambiguous captured linked source: ' + expected.member);
            const part = candidates[0], art = r.animations.get(part).props.getArt();
            return { member: expected.member, frameCount: expected.frameCount,
                sourceImage: art.getString('Image'), loopStart: art.getNumber('LoopStart', 0),
                loopEnd: art.getNumber('LoopEnd') - 1, rate: art.getNumber('Rate'),
                ownerIsLocalPlayer: true, powered: r.powered, health: object.healthTrait.health,
                needsEngineer: object.rules.needsEngineer, visible: part.get3DObject().visible };
        });
    }, { id, members });
    assert(declarations.every(row => row.ownerIsLocalPlayer && row.powered && row.visible));
    for (const declaration of declarations) {
        assert(Number.isInteger(declaration.loopStart) && declaration.loopEnd < declaration.frameCount);
        await validateLinkedBuildingCycle(session, declaration.member, declaration.frameCount,
            { loopStart: declaration.loopStart, loopEnd: declaration.loopEnd, objectId: id, state, originalRenderer });
        const cycle = session.report.linkedBuildingCycles.at(-1);
        cycle.fixture = false;
        cycle.originalCapturedPlacement = true;
        cycle.nativeArtObservation = declaration;
        cycle.disclosure = 'Original map placement captured by an ordinary engineer; unchanged actual normal/damaged Art INI loop, original native clock and rendering. No forced phase, power, frame, rate or rule.';
    }
}

export async function validateNativeTechnology(session, names, options = {}) {
    const { page, report, out } = session;
    assert(names.length && new Set(names).size === names.length
        && names.every(n => ['CAOILD', 'CAHOSP', 'CATHOSP', 'CAAIRP', 'CAOUTP', 'CAMACH'].includes(n)));
    const result = report.newNativeTechnology = { cases: [],
        policy: 'Original placed objects; legal engineer fixtures and native Capture/Repair orders. Native damage is a controlled fixture. No map or rule edits.' };
    const sample = id => page.evaluate(id => {
        const d = window.__ra2debug;
        const object = d.game.getWorld().getAllObjects().find(o => o.id === id);
        const renderable = d.renderableManager.getRenderableByGameObject(object);
        const parts = [renderable.mainObj, renderable.bib, ...[...renderable.animObjects.values()].flat()].filter(Boolean);
        return { ...window.__m23Binding(object), ownerName: object.owner.name,
            ownedByPlayer: object.owner === window.__allied.player, powered: renderable.powered,
            parts: parts.map(part => {
                const animation = renderable.animations.get(part);
                const sourceImage = animation?.props.getArt().getString('Image');
                return { aggregateMember: part.builder.shpFile?.filename ?? part.builder.image?.filename,
                    sourceImage, member: sourceImage && `${sourceImage.toLowerCase()}.shp`,
                    frame: part.builder.getFrame(), hd: part.builder.hdOverride?.identity,
                    visible: !!part.get3DObject()?.visible };
            }) };
    }, id);
    const capture = async (name, state, id) => {
        await page.evaluate(id => {
            const d = window.__ra2debug;
            const object = d.game.getWorld().getAllObjects().find(o => o.id === id);
            d.worldInteraction.minimapHandler.panToTile(object.tile);
        }, id);
        await page.waitForTimeout(120);
        const png = await page.evaluate(() => {
            const d = window.__ra2debug;
            d.renderer.render();
            return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
        });
        const file = `${name}-${state}-framebuffer.png`;
        await fs.writeFile(path.join(out, file), Buffer.from(png, 'base64'));
        return { file, rescaled: false };
    };
    for (const name of names) {
        const original = await page.evaluate(name => {
            const d = window.__ra2debug;
            const object = d.game.getWorld().getAllObjects().find(o => o.type === 2 && o.name === name
                && o.isSpawned && !o.isDestroyed && o.owner.isNeutral);
            if (!object) throw Error(`Missing original neutral technology object: ${name}`);
            return { id: object.id, health: object.healthTrait.health, tile: [object.tile.rx, object.tile.ry] };
        }, name);
        const record = { name, original, neutral: await sample(original.id),
            neutralCapture: await capture(name, 'neutral', original.id) };
        result.cases.push(record);
        assert(record.neutral.hd, `${name}: original placement must bind complete HD`);
        await page.evaluate(id => {
            const d = window.__ra2debug, f = window.__allied;
            const object = d.game.getWorld().getAllObjects().find(o => o.id === id);
            f.actor = object;
            f.technologyEngineer = f.spawn('ENGINEER', 3, object.tile);
            d.actionsApi.orderUnits([f.technologyEngineer.id], 7, id);
        }, original.id);
        await page.waitForFunction(id => window.__ra2debug.game.getWorld().getAllObjects()
            .find(o => o.id === id)?.owner === window.__allied.player, original.id, { timeout: 45000 });
        await page.waitForTimeout(180);
        record.captured = await sample(original.id);
        record.captureEngineerConsumed = await page.evaluate(() => !window.__allied.technologyEngineer.isSpawned);
        assert(record.captureEngineerConsumed && record.captured.ownedByPlayer && record.captured.hd);
        assert(record.captured.parts.some(p => /_f\.shp$/i.test(p.member ?? '') && p.visible && p.hd),
            `${name}: native captured flag must bind HD`);
        record.capturedCapture = await capture(name, 'captured', original.id);
        const cycles = options.linkedCycles?.[name];
        if (cycles) await recordTechnologyLinkedCycles(session, original.id, cycles, 'normal');
        if (name === 'CAMACH') {
            const before = await page.evaluate(id => {
                const d = window.__ra2debug, f = window.__allied;
                const shop = d.game.getWorld().getAllObjects().find(o => o.id === id);
                if (shop.owner !== f.player || shop.rules.unitsGainSelfHeal !== 1) {
                    throw Error('Captured original Machine Shop must grant native vehicle self-healing');
                }
                const vehicle = f.machineShopProbeVehicle = f.spawn('MTNK', 7, f.center);
                if (vehicle.rules.selfHealing) throw Error('Probe vehicle has intrinsic self-healing');
                vehicle.healthTrait.inflictDamage(Math.floor(vehicle.healthTrait.maxHitPoints * .4), vehicle, d.game);
                const general = d.game.rules.getIni().getSection('General');
                return { tick: d.game.currentTick, health: vehicle.healthTrait.health,
                    owner: vehicle.owner.name, shopId: shop.id, unitsGainSelfHeal: shop.rules.unitsGainSelfHeal,
                    period: general.getNumber('SelfHealUnitFrames', 75),
                    amount: general.getNumber('SelfHealUnitAmount', 5) };
            }, original.id);
            assert(before.health > 0 && before.health < 100 && before.period > 0 && before.amount > 0);
            await page.waitForFunction(health => window.__allied.machineShopProbeVehicle.healthTrait.health > health,
                before.health, { timeout: 20000 });
            const after = await page.evaluate(() => {
                const d = window.__ra2debug, vehicle = window.__allied.machineShopProbeVehicle;
                const sample = { tick: d.game.currentTick, health: vehicle.healthTrait.health, owner: vehicle.owner.name };
                d.game.unspawnObject(vehicle);
                return sample;
            });
            assert(after.tick > before.tick && after.health > before.health && after.owner === before.owner);
            record.passiveVehicleHealing = { before, after,
                policy: 'Captured original shop, wounded native vehicle fixture, unchanged TechBuildingsTrait and ordinary native ticks. No healing calls, rule edits or timer overrides.' };
        }
        if (name === 'CAOILD') await recordOilMotion(session, 'oil-player-normal', 5000);
        await page.evaluate(id => {
            const d = window.__ra2debug;
            const object = d.game.getWorld().getAllObjects().find(o => o.id === id);
            object.healthTrait.inflictDamage(Math.floor(object.healthTrait.maxHitPoints * .75), object, d.game);
        }, original.id);
        await page.waitForTimeout(180);
        record.damaged = await sample(original.id);
        assert(record.damaged.health < record.captured.health && record.damaged.frame === 1 && record.damaged.hd);
        record.damagedCapture = await capture(name, 'captured-damaged', original.id);
        if (cycles) await recordTechnologyLinkedCycles(session, original.id, cycles, 'damaged');
        if (name === 'CAOILD') await recordOilMotion(session, 'oil-player-damaged', 5000);
        await page.evaluate(id => {
            const d = window.__ra2debug, f = window.__allied;
            const object = d.game.getWorld().getAllObjects().find(o => o.id === id);
            f.technologyEngineer = f.spawn('ENGINEER', 3, object.tile);
            d.actionsApi.orderUnits([f.technologyEngineer.id], 15, id);
        }, original.id);
        await page.waitForFunction(id => window.__ra2debug.game.getWorld().getAllObjects()
            .find(o => o.id === id)?.healthTrait.health === 100, original.id, { timeout: 45000 });
        record.repaired = await sample(original.id);
        record.repairEngineerConsumed = await page.evaluate(() => !window.__allied.technologyEngineer.isSpawned);
        assert(record.repairEngineerConsumed && record.repaired.frame === 0 && record.repaired.hd);
        record.repairedCapture = await capture(name, 'engineer-repaired', original.id);
        console.log(`PASS native technology capture, damage and engineer repair: ${name}`);
    }
    result.status = 'PASS_ORIGINAL_PLACEMENTS_NATIVE_CAPTURE_REPAIR_AND_OWNED_ANIMATION';
}
