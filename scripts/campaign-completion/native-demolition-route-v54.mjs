import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { readFeedbackSource, replayFeedbackOpening, advanceFeedbackSource } from './feedback-source-replay-v53.mjs';
const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
const input = process.argv.slice(3).find(argument => !argument.startsWith('--'));
const source = await readFeedbackSource(path.resolve(input ?? path.join(import.meta.dirname, 'fixtures/all01-source-commands-v15.json')));
const identity = process.argv.find(x => x.startsWith('--actor='))?.slice(8) ?? 'TANY';
const end = Number(process.argv.find(x => x.startsWith('--end='))?.slice(6) ?? 2827);
const legacy = process.argv.includes('--legacy');
const sealFixture = process.argv.includes('--seal-fixture');
source.samples = [];
const report = {
    status: 'RUNNING', errors: [], failedResources: [], samples: [], identity, legacy,
    scope: 'Fresh original map with the retained creation seed and ordinary serialized player commands. Observe real naval/building demolition and escape. No hidden save, health/rule/objective edit, immunity, forced result or post-creation RNG edit. Changed execution policies do not claim the former route hash.'
};
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    if (sealFixture) {
        report.scope = 'Explicit standalone naval compatibility scene derived from the hash-checked original Allied01 map before world creation. Replace its one Tanya placement with a native SEAL, preserve all source rules/triggers/ships, and replay ordinary naval attack orders. This is not original mission or victory evidence; progress recording is disabled.';
        await page.evaluate(() => {
            const screen = window.__ra2debug.mainMenuController.screens.get(22), loader = screen.rootController.screens.get(1).gameLoader, create = loader.createGame;
            const notice = document.createElement('div');
            notice.textContent = 'SPECIALIZED SEAL NAVAL DEMOLITION SCENE — NOT AN ORIGINAL MISSION';
            Object.assign(notice.style, {
                position: 'fixed', top: '0', left: '0', right: '0', zIndex: '100000', background: '#092a3b', color: '#fff', padding: '8px', font: 'bold 18px sans-serif', textAlign: 'center'
            });
            document.body.append(notice);
            loader.createGame = async function (...args) { loader.createGame = create; const text = args[3].toString().replaceAll(',TANY,', ',GHOST,'); const map = new args[3].constructor(); map.campaignFilename = 'all01t.map'; map.fromString(text); args[3] = map; const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); const hash = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join(''); Object.assign(args[2].campaign, { sourceSha256: hash, provenanceDigest: 'standalone-seal-' + hash, diagnostic: true }); const result = await create.apply(this, args); result.game.campaign.inspectionModified = true; return result; };
        });
    }
    report.start = await replayFeedbackOpening(page, source, 0, legacy ? {} : { demolitionSafetyVersion: 1, civilianTargetingVersion: 2, neutralStructureTargetingVersion: 1 });
    report.setup = await page.evaluate(identity => {
        const g = window.__ra2debug.game;
        window.__demoRoute = { damage: [], deaths: [], shots: [], escapes: 0 };
        const observe = unit => {
            if (unit.name !== identity)
                return;
            const inflict = unit.healthTrait.inflictDamage;
            unit.healthTrait.inflictDamage = function (amount, source, world) { window.__demoRoute.damage.push({
                tick: g.currentTick, id: unit.id, amount, hp: this.getHitPoints(), cause: window.__demoCause, attacker: source?.obj?.name, weapon: source?.weapon?.name
            }); return inflict.call(this, amount, source, world); };
        };
        g.world.getAllObjects().filter(u => u.isInfantry()).forEach(observe);
        const create = g.createObject;
        g.createObject = function (...args) {
            const u = create.apply(this, args), parent = window.__demoParent;
            if (u.isInfantry())
                observe(u);
            if (typeof u.detonate === 'function') {
                const detonate = u.detonate;
                u.detonate = function (...args) { const before = window.__demoCause; window.__demoCause = { id: u.id, name: u.name, parent }; try {
                    return detonate.apply(this, args);
                }
                finally {
                    window.__demoCause = before;
                } };
            }
            return u;
        };
        const destroy = g.destroyObject;
        g.destroyObject = function (u, ...args) {
            const previous = window.__demoParent;
            window.__demoParent = { id: u.id, name: u.name, killer: args[0]?.obj?.id, tick: g.currentTick };
            if (u.name === 'DRED' || u.isBuilding() && u.deathType === 2)
                window.__demoRoute.deaths.push({ ...window.__demoParent });
            try {
                return destroy.call(this, u, ...args);
            }
            finally {
                window.__demoParent = previous;
            }
        };
        const dispatch = g.events.dispatch;
        g.events.dispatch = function (event) { if (event.gameObject?.name === identity && event.weapon)
            window.__demoRoute.shots.push({ tick: g.currentTick, id: event.gameObject.id, weapon: event.weapon.name, target: event.gameObject.attackTrait.currentTarget?.obj?.id }); return dispatch.call(this, event); };
        window.__demoShips = g.world.getAllObjects().filter(u => u.name === 'DRED');
        return {
            launch: g.campaign.launch, ships: window.__demoShips.map(u => u.id), actors: g.world.getAllObjects().filter(u => u.name === identity).map(u => ({ id: u.id, hp: u.healthTrait.getHitPoints() }))
        };
    }, identity);
    for (let tick = 0; tick < end;) {
        tick = Math.min(end, tick + 30);
        const state = await advanceFeedbackSource(page, tick);
        const sample = await page.evaluate(identity => {
            const g = window.__ra2debug.game;
            const escape = t => t.demolitionRetreat || t.children?.some(escape);
            const actors = g.world.getAllObjects().filter(u => u.name === identity).map(u => ({ id: u.id, hp: u.healthTrait.getHitPoints(), tile: [u.tile.rx, u.tile.ry], escaping: u.unitOrderTrait.getTasks().some(escape) }));
            if (actors.some(u => u.escaping))
                window.__demoRoute.escapes++;
            return {
                actors, damageCount: window.__demoRoute.damage.length, deadShips: window.__demoShips.filter(u => u.isDestroyed || u.isCrashing || !u.isSpawned).length
            };
        }, identity);
        report.samples.push({ ...state, ...sample });
    }
    report.final = await page.evaluate(() => window.__demoRoute);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedResources, []);
    assert(report.final.deaths.length > 0, 'No actual demolition occurred');
    if (report.setup.ships.length)
        assert.equal(report.final.deaths.filter(d => d.name === 'DRED').length, report.setup.ships.length, 'The complete original four-ship route must execute');
    if (!legacy) {
        assert(report.final.escapes > 0, 'No actual retreat movement observed');
        assert(!report.final.damage.some(hit => hit.amount > 0 && (!hit.attacker || hit.weapon === 'Sapper' || hit.weapon === 'FakeC4' || hit.cause?.parent?.killer === hit.id)), 'Demolition damage still reached the commando');
    }
    await page.screenshot({ path: path.join(out, 'native-source-demolition-route.png') });
    report.status = legacy ? 'PASS_LEGACY_ORIGINAL_DEMOLITION_DAMAGE_OBSERVATION' : 'PASS_CURRENT_ORIGINAL_DEMOLITION_RETREAT_AND_NO_OWN_BLAST_DAMAGE';
}
catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
}
finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
