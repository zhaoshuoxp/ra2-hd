import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all07smd.map');
let failure;
try {
    await pilot.open();
    pilot.report.baseAudit = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, own = g.localPlayer.getOwnedObjects();
        const point = unit => unit.tile && [unit.tile.rx, unit.tile.ry];
        const buildings = own.filter(unit => unit.isBuilding() && unit.isSpawned && !unit.isDestroyed);
        const armies = g.world.getAllObjects().filter(unit => unit.isUnit() && unit.isSpawned && !unit.isDestroyed
            && !unit.owner.isNeutral && unit.owner !== g.localPlayer && !g.alliances.areAllied(g.localPlayer, unit.owner));
        const power = g.localPlayer.powerTrait;
        const worker = g.getConstructionWorker(g.localPlayer);
        const placementModes = {};
        for (const [label, options] of [['normal', {}], ['shroud-independent-inspection', { ignoreShroud: true }],
            ['adjacency-independent-inspection', { ignoreAdjacent: true }],
            ['terrain-only-inspection', { ignoreAdjacent: true, ignoreShroud: true }]]) {
            const tiles = g.map.tiles.getAll().filter(tile => worker.canPlaceAt('NAYARD', tile, { normalizedTile: true, ...options }))
                .sort((a, b) => Math.hypot(a.rx - 101, a.ry - 185) - Math.hypot(b.rx - 101, b.ry - 185));
            placementModes[label] = { count: tiles.length, nearest: tiles.slice(0, 12).map(tile => [tile.rx, tile.ry]) };
        }
        return { tick: g.currentTick, power: { supply: power.power, drain: power.drain,
                level: power.level, low: power.isLowPower(), blackoutFrames: power.getBlackoutDuration(),
                externalBlackouts: [...power.externalBlackouts].map(unit => unit.id) },
            sourceSuperWeaponTrace: g.campaign.superWeapons?.trace,
            activeSuperWeapons: g.traits.getAll().flatMap(trait => Array.isArray(trait.effects) ? trait.effects : [])
                .filter(effect => effect.tile && effect.owner).map(effect => ({ type: effect.type, owner: effect.owner.name,
                    status: effect.status, delay: effect.delay, tile: [effect.tile.rx, effect.tile.ry] })),
            mobileYards: own.filter(unit => unit.name === 'AMCV').map(unit => ({ id: unit.id, tile: point(unit),
                waypoint: unit.moveTrait.currentWaypoint && [unit.moveTrait.currentWaypoint.rx, unit.moveTrait.currentWaypoint.ry],
                moving: unit.moveTrait.isMoving(),
                tasks: unit.unitOrderTrait?.getCurrentOrder?.(),
                deployCell: worker.canPlaceAt('GACNST', unit.tile, { ignoreAdjacent: true, ignoreObjects: [unit] }) })),
            placementModes, navalRule: { adjacent: g.rules.getBuilding('NAYARD').adjacent,
                waterBound: g.rules.getBuilding('NAYARD').waterBound },
            superWeapons: g.localPlayer.superWeaponsTrait.getAll().map(weapon => ({ type: weapon.rules.type,
                name: weapon.rules.name, status: weapon.status })),
            buildings: buildings.map(unit => ({ id: unit.id, name: unit.name, tile: point(unit),
                health: unit.healthTrait.health, powered: unit.poweredTrait?.isPoweredOn(),
                drainedBy: [...unit.drainedBy ?? []].map(unit => unit.id),
                traits: unit.traits.getAll().filter(trait => /Power|Drain|Attack|Repair/.test(trait.constructor.name))
                    .map(trait => ({ name: trait.constructor.name, disabled: trait.isDisabled?.(),
                        draining: trait.isDraining?.() })) })),
            enemies: armies.filter(unit => buildings.some(building => Math.hypot(unit.tile.rx - building.tile.rx,
                unit.tile.ry - building.tile.ry) < 30)).map(unit => ({ id: unit.id, name: unit.name,
                    owner: unit.owner.name, tile: point(unit), health: unit.healthTrait.health,
                    drain: unit.drainTrait?.target?.id })),
            miners: own.filter(unit => unit.rules.harvester).map(unit => ({ id: unit.id, name: unit.name,
                tile: point(unit), status: unit.harvesterTrait.status, state: unit.harvesterTrait.debugGetState() })),
            ore: g.world.getAllObjects().filter(unit => unit.isOverlay() && unit.isTiberium() && unit.value > 0)
                .map(unit => ({ tile: point(unit), value: unit.value })) };
    });
    pilot.report.status = 'PASS_NATIVE_READ_ONLY_ORIGINAL_ALLIED07_BASE_POWER_ARMIES_AND_MINING_INSPECTION';
} catch (error) { failure = error; }
await pilot.finish(failure);
