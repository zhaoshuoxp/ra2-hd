import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { readFeedbackSource, replayFeedbackOpening, advanceFeedbackSource } from './feedback-source-replay-v53.mjs';
const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
const source = await readFeedbackSource(path.join(import.meta.dirname, 'fixtures/all12-source-commands-v26.json'));
const modern = process.argv.includes('--modern');
if (modern)
    source.samples = [];
const report = {
    status: 'RUNNING', errors: [], failedResources: [], samples: [], modern, scope: 'Original Allied12 legacy26 ordinary-command route with an optional current retaliation policy. Observe all four tagged elite Apocalypse tanks and their weapons/damage. No world, rules, placement, health, objectives or post-creation RNG edits.'
};
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    report.start = await replayFeedbackOpening(page, source, 0, modern ? { retaliationVersion: 1 } : {});
    report.guards = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        window.__guardAudit = { shots: [], hits: [] };
        const guards = g.world.getAllObjects().filter(u => u.name === 'APOC' && u.owner.name === 'BadGuy3 House');
        for (const u of guards) {
            for (const w of [u.primaryWeapon, u.secondaryWeapon]) {
                if (!w)
                    continue;
                const fire = w.fire;
                w.fire = function (target, ...args) { window.__guardAudit.shots.push({ tick: g.currentTick, id: u.id, weapon: w.name, target: target.obj?.id }); return fire.call(this, target, ...args); };
            }
            const damage = u.healthTrait.inflictDamage;
            u.healthTrait.inflictDamage = function (amount, source, world) { window.__guardAudit.hits.push({
                tick: g.currentTick, id: u.id, amount, source: source?.obj?.id, weapon: source?.weapon?.name, sourceTile: source?.obj && [source.obj.tile.rx, source.obj.tile.ry]
            }); return damage.call(this, amount, source, world); };
        }
        const dispatch = g.events.dispatch;
        g.events.dispatch = function (event) { if (event.gameObject && guards.some(u => u.id === event.gameObject.id) && event.weapon)
            window.__guardAudit.shots.push({ tick: g.currentTick, id: event.gameObject.id, weapon: event.weapon.name, event: event.type }); return dispatch.call(this, event); };
        window.__kremlinGuards = guards;
        return guards.map(u => ({ id: u.id, hp: u.healthTrait.getHitPoints(), tile: [u.tile.rx, u.tile.ry], rank: u.veteranLevel }));
    });
    for (const tick of [7926, 12676, 12900, 13100, 13300, 13500, 14200]) {
        const state = await advanceFeedbackSource(page, tick);
        const sample = await page.evaluate(() => { const d = window.__ra2debug, g = d.game; return {
            ...window.__guardAudit, guards: window.__kremlinGuards.map(u => ({
                id: u.id, hp: u.isDestroyed ? 0 : u.healthTrait.getHitPoints(), destroyed: u.isDestroyed, tile: [u.tile.rx, u.tile.ry], facing: u.direction, turret: u.turretTrait?.facing, disabled: u.attackTrait.isDisabled(), guard: u.guardMode, neutral: u.owner.isNeutral, defeated: u.owner.defeated, weapon: u.primaryWeapon?.name, range: u.primaryWeapon?.range, taskCount: u.unitOrderTrait.getTasks().length, target: u.attackTrait.currentTarget?.obj?.id
            })), players: g.localPlayer.getOwnedObjects().filter(u => u.isUnit() && u.isSpawned).map(u => ({ id: u.id, name: u.name, tile: [u.tile.rx, u.tile.ry] }))
        }; });
        report.samples.push({ ...state, ...sample });
    }
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ACTUAL_ORIGINAL_GUARD_ENGAGEMENT_OBSERVATION';
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
