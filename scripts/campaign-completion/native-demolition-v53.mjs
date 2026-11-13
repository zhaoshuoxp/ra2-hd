import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

const out = path.resolve(process.argv[2]), mission = process.argv[3] ?? 'all01t.map';
const attempts = Number(process.argv.find(value => value.startsWith('--attempts='))?.slice(11) ?? 4);
const delay = Number(process.argv.find(value => value.startsWith('--delay='))?.slice(8) ?? 0);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], observations: [],
    mission, scope: 'Fresh original campaign, ordinary visible-target C4 orders and accelerated turns. Damage callbacks are observed without changing their arguments or outcomes.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), mission);
    await waitWorld(page, mission); await stepWorld(page, 1);
    for (let ticks = 0; ticks < 6000 && await page.evaluate(() => window.__ra2debug.game.campaign.inputLocked); ticks += 150)
        await stepWorld(page, 150);
    report.start = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, tanya = g.world.getAllObjects().find(u => u.name === 'TANY' && u.owner === g.localPlayer);
        if (!tanya) throw Error('Original Tanya is missing');
        window.__demolitionDamage = []; window.__demolitionDeaths = [];
        const create = g.createObject;
        g.createObject = function(...args) {
            const object = create.apply(this, args);
            const parent = window.__demolitionParent;
            if (typeof object.detonate === 'function') {
                const detonate = object.detonate;
                object.detonate = function(...args) {
                    const previous = window.__demolitionCause;
                    window.__demolitionCause = { type: object.type, id: object.id, name: object.name,
                        damage: object.rules.damage, warhead: object.rules.warhead, parent };
                    try { return detonate.apply(this, args); } finally { window.__demolitionCause = previous; }
                };
            }
            return object;
        };
        const inflict = tanya.healthTrait.inflictDamage;
        tanya.healthTrait.inflictDamage = function(amount, source, world) {
            window.__demolitionDamage.push({ tick: g.currentTick, amount, hp: this.getHitPoints(),
                cause: window.__demolitionCause,
                source: { name: source?.name, obj: source?.obj?.name, weapon: source?.weapon?.name,
                    warhead: source?.weapon?.warhead?.rules.name }, stack: new Error().stack });
            return inflict.call(this, amount, source, world);
        };
        const destroy = g.destroyObject;
        g.destroyObject = function(obj, ...args) {
            if (obj.isBuilding() && obj.deathType === 2 && args[0]?.obj === tanya) window.__demolitionDeaths.push({ tick: g.currentTick,
                id: obj.id, name: obj.name, tanyaHP: tanya.healthTrait.getHitPoints(), deathType: obj.deathType,
                explodes: obj.explodes, deathWeapon: obj.armedTrait?.deathWeapon?.name });
            const previous = window.__demolitionParent;
            window.__demolitionParent = { id: obj.id, name: obj.name, tick: g.currentTick,
                deathType: obj.deathType, killer: args[0]?.obj?.id };
            try { return destroy.call(this, obj, ...args); } finally { window.__demolitionParent = previous; }
        };
        return { tick: g.currentTick, id: tanya.id, tile: [tanya.tile.rx, tanya.tile.ry], health: tanya.healthTrait.getHitPoints() };
    });
    if (delay) await stepWorld(page, delay);
    const commands = new OrdinaryCampaignCommands(page, report);
    for (let attempt = 0; attempt < attempts; attempt++) {
        const target = await page.evaluate(() => {
            const g = window.__ra2debug.game, u = g.world.getAllObjects().find(x => x.name === 'TANY' && x.owner === g.localPlayer);
            const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            return g.world.getAllObjects().filter(x => x.isBuilding() && !x.isDestroyed && x.isSpawned && x.c4ChargeTrait
                && !x.invulnerableTrait.isActive() && !g.areFriendly(x, u)
                && g.map.tileOccupation.calculateTilesForGameObject(x.tile, x).some(t => !shroud.isShrouded(t, x.tileElevation)))
                .sort((a, b) => Math.hypot(a.tile.rx - u.tile.rx, a.tile.ry - u.tile.ry) - Math.hypot(b.tile.rx - u.tile.rx, b.tile.ry - u.tile.ry))
                .map(x => ({ id: x.id, name: x.name }))[0];
        });
        if (!target) break;
        await commands.order(['TANY'], 2, target.id);
        await stepWorld(page, 1200);
        report.observations.push(await page.evaluate(() => {
            const g = window.__ra2debug.game;
            return { tick: g.currentTick, damage: window.__demolitionDamage, deaths: window.__demolitionDeaths,
                planes: g.world.getAllObjects().filter(x => x.isAircraft() && x.isSpawned).map(x => ({ id: x.id, name: x.name,
                    tile: [x.tile.rx, x.tile.ry], tasks: x.unitOrderTrait.getTasks().map(t => t.constructor.name) })),
                cargoTeams: [...g.campaign.teams.instances.values()].filter(t => t.members.some(u => u.name === 'CARGOPLANE'))
                    .map(t => ({ id: t.id, type: t.type, phase: t.phase, line: t.line, target: [t.target?.rx, t.target?.ry],
                        members: t.members.map(u => ({ id: u.id, spawned: u.isSpawned, tile: [u.tile.rx, u.tile.ry],
                            tasks: u.unitOrderTrait.getTasks().map(task => ({ type: task.constructor.name,
                                fields: Object.keys(task), children: task.children.map(x => x.constructor.name) })) })) })) };
        }));
    }
    await page.screenshot({ path: path.join(out, 'native-demolition.png') });
    assert(report.observations.some(o => o.deaths.length > 0), 'No actual C4 demolition occurred; this observer does not establish damage behavior');
    report.status = 'PASS_NATIVE_DEMOLITION_DAMAGE_OBSERVATION';
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
