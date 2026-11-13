import assert from 'node:assert/strict';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov01umd.map');
let failure;
try {
    await pilot.open();
    await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        window.__jurassicShots = [];
        g.events.subscribe(2, e => window.__jurassicShots.push({ tick: g.currentTick,
            id: e.gameObject?.id, name: e.gameObject?.name, target: e.target?.obj?.name,
            owner: e.gameObject?.owner.name, weapon: e.weapon?.rules.name }));
    });
    await pilot.commands.order(['BORIS', 'HTNK', 'HTK', 'E2', 'SHK'], 11);
    await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const dinosaur = g.world.getAllObjects().find(u => u.name === 'DNOB' && u.isSpawned);
        const free = d.worldScene.cameraPan.freeCamera;
        const previous = free.value; free.value = true;
        try { d.worldInteraction.minimapHandler.panToTile(dinosaur.tile); }
        finally { free.value = previous; }
    });
    pilot.report.acquisition = [];
    for (let i = 0; i < 18; i++) {
        await pilot.commands.step(45, { defend: false });
        await pilot.page.waitForTimeout(150);
        pilot.report.acquisition.push(await pilot.page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, dinosaurs = g.world.getAllObjects()
                .filter(u => /^DNO/.test(u.name) && u.isSpawned && !u.isDestroyed);
            return { tick: g.currentTick, dinosaurs: dinosaurs.map(u => ({ id: u.id, name: u.name,
                owner: u.owner.name, neutral: u.owner.isNeutral, tile: [u.tile.rx, u.tile.ry], threat: u.rules.threatPosed,
                civilian: u.rules.civilian, insignificant: u.rules.insignificant, legal: g.isValidTarget(u) })),
                pairs: g.localPlayer.getOwnedObjects().filter(u => u.primaryWeapon && u.isSpawned).flatMap(u =>
                    dinosaurs.filter(v => Math.hypot(u.tile.rx - v.tile.rx, u.tile.ry - v.tile.ry) < 16).map(v => {
                        const a = u.attackTrait, w = a.selectWeaponVersus(u, v, g, false, true);
                        return { id: u.id, name: u.name, target: v.id, friendly: g.areFriendly(u, v),
                            tile: [u.tile.rx, u.tile.ry], tasks: u.unitOrderTrait.getTasks().map(t => t.constructor.name),
                            sleeping: u.campaignSleeping, disabled: a.isDisabled(), canAcquire: a.shouldPassiveAcquire(u, g),
                            eligible: a.canPassiveAcquire(v, g), weapon: w?.rules.name,
                            range: w && a.rangeHelper.isInWeaponRange(u, v, w, g.rules),
                            los: w && a.losHelper.hasLineOfSight(u, v, w),
                            indexed: a.scanTechnosAround(u, 16, g).includes(v) };
                    })),
                brontosaurus: dinosaurs.filter(u => u.name === 'DNOB').map(u => {
                    const r = d.renderableManager.getRenderableByGameObject(u), s = r?.shpRenderable;
                    const b = s?.builder, mesh = s?.getShapeMesh();
                    return { id: u.id, frame: b?.frameNo, sequence: r?.currentSequenceParams?.type,
                        facing: r?.computedDirection, actualDirection: u.direction, moving: u.isMoving, firing: u.isFiring,
                        opacity: mesh?.material?.opacity, visible: mesh?.visible, hd: !!b?.hdOverride,
                        layer: mesh?.renderOrder, zone: u.zone, art: [...u.art.sequences.keys()] };
                }) };
        }));
        if ([0, 4, 8, 12, 17].includes(i))
            await pilot.page.screenshot({ path: path.join(pilot.out, 'native-jurassic-' + i + '.png') });
    }
    pilot.report.shots = await pilot.page.evaluate(() => window.__jurassicShots);
    if (process.argv.includes('--expect-corrections')) {
        assert.equal(pilot.report.launch.semanticsVersion, 46);
        assert(pilot.report.acquisition.some(s => s.dinosaurs.some(u => u.owner === 'Nod' && !u.neutral)));
        assert(pilot.report.shots.some(s => ['HTNK', 'HTK', 'E2', 'SHK', 'BORIS'].includes(s.name)),
            'Source troops must fire autonomously at incoming hostile dinosaurs');
        const moving = pilot.report.acquisition.flatMap(s => s.brontosaurus).filter(u => u.moving && !u.firing);
        assert(moving.length > 0, 'The original water dinosaur must exercise its movement animation');
        assert(moving.every(u => u.sequence === 3 && u.frame >= 48 && u.frame < 96 && u.visible && u.opacity === 1),
            'The moving water dinosaur must continuously use its original Walk frames without opacity or visibility toggles');
    }
    pilot.report.status = process.argv.includes('--expect-corrections')
        ? 'PASS_SOURCE_JURASSIC_AUTONOMOUS_FIRE_AND_NATIVE_WATER_DINOSAUR_WALK_FRAMES'
        : 'OBSERVED_SOURCE_JURASSIC_PASSIVE_ACQUISITION_AND_BRONTOSAURUS_FRAMES';
} catch (error) { failure = error; }
await pilot.finish(failure);
