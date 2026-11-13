import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const [directory, mission = 'all01umd.map'] = process.argv.slice(2);
const out = path.resolve(directory), report = { status: 'RUNNING', mission, errors: [], failedResources: [], samples: [] };
await fs.mkdir(out, { recursive: false });
let session, failure;
try {
    session = await campaignSession(out, report, { edition: 'yr', density: 4 });
    session.page.on('console', message => {
        const prefix = '[World HD match] ';
        if (message.text().startsWith(prefix)) report.worldHd = JSON.parse(message.text().slice(prefix.length));
    });
    await session.page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), mission);
    await waitWorld(session.page, mission);
    await session.page.evaluate(() => {
        const g = window.__ra2debug.game;
        window.__feedbackEvents = [];
        const unit = u => u && ({ id: u.id, name: u.name, owner: u.owner?.name,
            tile: u.tile && [u.tile.rx, u.tile.ry], hp: u.healthTrait?.hitPoints, zone: u.zone });
        for (const type of [2, 3, 9, 12, 50, 61]) g.events.subscribe(type, event => {
            if (window.__feedbackEvents.length < 12000) window.__feedbackEvents.push({ tick: g.currentTick, type,
                actor: unit(event.gameObject ?? event.target), source: unit(event.source ?? event.attacker?.obj),
                weapon: event.weapon?.rules.name ?? event.attacker?.weapon?.rules.name, soundId: event.soundId });
        });
    });
    const until = Number(process.argv.find(value => value.startsWith('--until='))?.slice(8) ?? 1500);
    const ticks = [...new Set([0, 30, 90, 180, 300, 450, 600, 900, 1500, until])]
        .filter(t => t <= until).sort((a, b) => a - b);
    for (const tick of ticks) {
        const now = await session.page.evaluate(() => window.__ra2debug.game.currentTick);
        if (tick > now) await stepWorld(session.page, tick - now);
        report.samples.push(await session.page.evaluate(() => {
            const g = window.__ra2debug.game;
            const describe = u => ({ id: u.id, name: u.name, owner: u.owner?.name, neutral: u.owner?.isNeutral,
                tile: [u.tile.rx, u.tile.ry], elevation: u.tileElevation, zone: u.zone, spawned: u.isSpawned,
                health: u.healthTrait?.health, sleeping: u.campaignSleeping, armed: !!u.primaryWeapon,
                weapon: u.primaryWeapon?.rules.name, target: u.attackTrait?.currentTarget?.obj?.id,
                tasks: u.unitOrderTrait?.getTasks().map(t => t.constructor.name),
                disabled: u.attackTrait?.isDisabled(), charge: u.poweredTrait?.isPowered,
                passive: u.rules.canPassiveAquire, threat: u.rules.threatPosed, civilian: u.rules.civilian,
                insignificant: u.rules.insignificant, bunkerable: u.rules.bunkerable, turret: u.rules.turret,
                organic: u.rules.organic, buildStatus: u.buildStatus,
                tankBunker: u.bunkerTrait && { unit: u.bunkerTrait.unit?.id,
                    candidates: g.world.getAllObjects().filter(v => v.isVehicle() && v.owner === u.owner
                        && Math.hypot(v.tile.rx - u.tile.rx, v.tile.ry - u.tile.ry) < 8)
                        .map(v => ({ id: v.id, canEnter: u.bunkerTrait.canEnter(v) })) },
                passengers: u.transportTrait?.units.map(v => v.name),
                occupants: u.garrisonTrait?.units?.map(v => v.name), bunker: u.bunker?.id,
                tag: u.tag?.id, team: g.campaign.teams.assignments.get(u)?.type });
            const pairs = [];
            for (const shooter of g.world.getAllObjects().filter(u => u.primaryWeapon && u.attackTrait
                && (u.owner === g.localPlayer || u.name === 'YAGGUN'))) {
                const attack = shooter.attackTrait;
                const near = attack.scanTechnosAround(shooter, 15, g);
                for (const target of g.world.getAllObjects().filter(u => u.isTechno() && !g.areFriendly(shooter, u)
                    && u.isSpawned && Math.hypot(shooter.tile.rx - u.tile.rx, shooter.tile.ry - u.tile.ry) < 10)) {
                    const weapon = attack.selectWeaponVersus(shooter, target, g, false, true);
                    pairs.push({ shooter: shooter.id, target: target.id, indexed: near.includes(target),
                        acquisition: attack.shouldPassiveAcquire(shooter, g), eligible: attack.canPassiveAcquire(target, g),
                        weapon: weapon?.rules.name, valid: g.isValidTarget(target),
                        range: weapon && attack.rangeHelper.isInWeaponRange(shooter, target, weapon, g.rules),
                        rangeData: weapon && attack.rangeHelper.computeWeaponRangeVsTarget(shooter, target, weapon, g.rules),
                        distance: attack.rangeHelper.distance3(shooter, target) / 256,
                        sight: weapon && attack.losHelper.hasLineOfSight(shooter, target, weapon) });
                    const pair = pairs.at(-1);
                    if (pair.range && pair.eligible && !pair.sight) {
                        pair.projectile = { walls: weapon.projectileRules.subjectToWalls,
                            cliffs: weapon.projectileRules.subjectToCliffs, wallDamage: weapon.warhead.rules.wall };
                        pair.rayArea = g.map.tiles.getAll().filter(tile =>
                            tile.rx >= Math.min(shooter.tile.rx, target.tile.rx) && tile.rx <= Math.max(shooter.tile.rx, target.tile.rx)
                            && tile.ry >= Math.min(shooter.tile.ry, target.tile.ry) && tile.ry <= Math.max(shooter.tile.ry, target.tile.ry))
                            .map(tile => ({ xy: [tile.rx, tile.ry], z: tile.z, land: tile.landType,
                                objects: g.map.getGroundObjectsOnTile(tile).map(o => o.name) }));
                    }
                }
            }
            return { tick: g.currentTick, failure: g.campaign.failure, result: g.campaign.result, pairs,
                launch: g.campaign.launch, hdActors: window.__ra2debug.sovietUnitsHd,
                environment: window.__ra2debug.environmentHd,
                objects: g.world.getAllObjects().filter(u => u.isTechno()).map(describe),
                teams: [...g.campaign.teams.instances.values()].map(t => ({ type: t.type, line: t.line, phase: t.phase,
                    members: t.members.map(u => u.id), tasks: t.tasks.map(p => ({ unit: p.unit.id, task: p.task.constructor.name,
                        status: p.task.status, children: p.task.children.map(t => t.constructor.name) })) })),
                media: g.campaign.captureMedia?.(), variables: [...g.campaign.machine.variables] };
        }));
        if ([0, 300, 900].includes(tick)) await session.page.screenshot({ path: path.join(out, `tick-${tick}.png`) });
        await fs.writeFile(path.join(out, 'observation.json'), JSON.stringify(report, null, 2) + '\n');
        if (report.samples.at(-1).result) break;
    }
    report.events = await session.page.evaluate(() => window.__feedbackEvents);
    report.status = 'OBSERVED_UNMODIFIED_SOURCE_BASELINE_NOT_FIX_QUALIFICATION';
    if (process.argv.includes('--expect-corrections')) {
        assert.equal(report.samples[0].launch.semanticsVersion, 46);
        if (mission === 'all01umd.map') {
            report.gattlingShots = report.events.filter(e => e.type === 2 && e.actor?.name === 'YAGGUN').length;
            report.actualGattlingAircraftHits = report.events.filter(e => e.type === 12
                && e.actor?.name === 'ORCA' && e.source?.name === 'YAGGUN').length;
            assert(report.gattlingShots > 0 && report.actualGattlingAircraftHits > 0,
                'Original Gattling defenses must actually shoot and hit the opening aircraft');
        } else if (mission === 'all02umd.map') {
            report.occupiedBunkers = report.samples.at(-1).objects.filter(o => o.bunker).length;
            assert(report.occupiedBunkers >= 9, 'All nine original opening tanks must enter their bunkers');
        } else if (mission === 'all06umd.map') {
            report.parliamentOccupants = report.samples.find(sample => sample.objects.find(o => o.name === 'CALOND04')
                ?.occupants?.filter(name => name === 'PENTGEN').length === 2)?.objects.find(o => o.name === 'CALOND04')?.occupants;
            assert(report.parliamentOccupants?.includes('PRES'), 'The original President must enter Parliament');
            assert(report.parliamentOccupants?.filter(name => name === 'PENTGEN').length === 2,
                'Both original generals must enter Parliament');
            assert.equal(report.parliamentOccupants.length, 15);
        } else throw Error('No reported-opening assertion declared for ' + mission);
        report.status = 'PASS_REPORTED_OPENING_REGRESSIONS_ORIGINAL_MAPS';
    }
} catch (error) { failure = error; report.status = 'FAIL_OBSERVER'; report.failure = error.stack; }
finally {
    if (session) await session.app.close();
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, mission, samples: report.samples.length }));
