import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';
import { replaySourcePrefix, continueRecordedSource } from './replay-source.mjs';

const out = path.resolve(process.argv[2]);
const directory = process.argv.find(value => value.startsWith('--replay='))?.slice(9);
assert(directory, 'Provide the retained ordinary-command source report with --replay=');
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
assert.equal(source.identity.launch.mission, 'sov05u.map');
assert.equal(source.identity.launch.semanticsVersion, 7);
assert.equal(source.result.result, 'victory');
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], samples: [], commands: [],
    scope: 'Fresh original Soviet 05 re-executes the retained ordinary player opening, performs a named-save/full application restart during the real final rush, then executes the remaining ordinary commands to the exact original goal and complete score. No hidden save initializes a mission; source, rules, triggers, health, ownership, objectives and RNG are not edited. Public route, media review and HD acceptance are separate.' };
let app, page, labels, journal;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function inspect(label) {
    const state = await new OrdinaryCampaignCommands(page, report).inspect(label);
    state.tower = await page.evaluate(() => {
        const g = window.__ra2debug.game, c = g.campaign;
        const tower = g.world.getAllObjects().find(unit => unit.name === 'CAPARS01' && unit.isSpawned && !unit.isDestroyed);
        return tower && { id: tower.id, owner: tower.owner.name, health: tower.healthTrait.health,
            chargers: [...tower.overpoweredTrait.chargers].map(unit => unit.id),
            powered: tower.poweredTrait.isPoweredOn(), overpowered: tower.overpoweredTrait.isOverpowered(),
            primary: tower.primaryWeapon?.rules.name, secondary: tower.secondaryWeapon?.rules.name,
            weapon: tower.overpoweredTrait.getWeapon()?.rules.name, approach: c.machine.states.get('0897D490').fired,
            energized: c.machine.states.get('0AD6A15C').fired, winTimer: c.machine.states.get('08AB8750').fired };
    });
    report.samples.push(state); await save(); assert(!state.failure, state.failure); return state;
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    report.replay = await replaySourcePrefix(page, source, 'original-final-rush-and-rear-defense');
    report.identity = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, options: g.gameOpts }; });
    const initial = await inspect('original-final-rush-before-named-save');
    assert(initial.tower.approach && initial.tower.energized && !initial.tower.winTimer);
    assert(initial.tower.chargers.length >= 3 && initial.tower.powered);
    assert.equal(initial.tower.weapon, 'EiffelBolt'); assert.equal(initial.tower.secondary, undefined);
    assert(await page.evaluate(() => window.__ra2debug.game.campaign.houses.get('Other1 House').isNeutral));
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report, 'Original Soviet 05 charged tower and final French rush'));
    await inspect('original-final-rush-after-full-restart');
    report.continuation = await continueRecordedSource(page, source, 'original-final-rear-garrison-sortie');
    const state = await inspect('final'); assert.equal(state.result, 'victory');
    assert.equal(state.tick, source.result.tick); assert.equal(state.hash, source.result.hash);
    report.goal = await page.evaluate(() => { const c = window.__ra2debug.game.campaign;
        return { sourceEvent: c.definition.triggers.get('08AB8750').events,
            states: ['0897D490', '0AD6A15C', '08978F40', '08AB8750', '0CB2164C', '0A67AC6C']
                .map(id => ({ id, fired: c.machine.states.get(id).fired })),
            remainingFrenchUnits: c.houses.get('BadGuy1 House').getOwnedObjects(true).filter(unit => unit.isUnit()).length,
            remainingFrenchBuildings: c.houses.get('BadGuy1 House').getOwnedObjects().filter(unit => unit.isBuilding()).length };
    });
    assert(report.goal.states.every(state => state.fired > 0)); assert.equal(report.goal.remainingFrenchUnits, 0);
    assert(report.goal.remainingFrenchBuildings > 0, 'The actual source goal counts French units, not every building');
    journal = await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands);
    await page.evaluate(() => { const manager = window.__ra2debug.gameScreen.gameTurnMgr;
        manager.setCampaignPaused(false); manager.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=victory][data-score-phase=complete]', { timeout: 120000 });
    report.score = await page.locator('body').innerText(); report.result = { tick: state.tick, hash: state.hash, result: state.result };
    await page.screenshot({ path: path.join(out, 'native-original-soviet05-victory.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET05_OBJECTIVE_CHAIN_AND_RESTART';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally {
    if (journal) await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(journal));
    await save(); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
