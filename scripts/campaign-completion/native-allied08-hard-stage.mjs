import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';
import { escortCommando } from './ordinary-commando-escort.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const attemptEntry = process.argv.includes('--attempt-factory-entry');
const cityEscort = attemptEntry || process.argv.includes('--city-escort');
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [],
    scope: 'Fresh original Allied08 Hard airborne landing and actual nine-team Hard patrol branch. The default opening has zero player commands. Optional city escort and factory-entry tactics remain separately labeled, including failed attempts. No map/rule/actor/goal/RNG edits; no complete Hard victory, completed IFV boarding or native excluded-bonus factory entry is inferred from this opening check.', attemptEntry, cityEscort };
let app, page, journal;
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    const slider = page.locator('[data-campaign-difficulty]'); await slider.focus(); await slider.press('End');
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('all08u.map'));
    await waitWorld(page, 'all08u.map');
    const commands = new OrdinaryCampaignCommands(page, report);
    report.identity = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, options: g.gameOpts }; });
    await commands.step(750, { defend: false });
    report.samples.push(await commands.inspect('original-hard-airborne-opening'));
    report.escort = [];
    for (const [tile, ticks] of cityEscort ? [[[104, 68], 1600], [[108, 110], 1600]] : []) {
        report.escort.push(await escortCommando(page, commands, tile, ticks));
        assert.notEqual(report.escort.at(-1).status, 'ACTOR_GONE');
    }
    report.patrols = await page.evaluate(() => { const c = window.__ra2debug.game.campaign;
        return { source: c.trace.filter(a => ['09AB895C', '0844203C'].includes(a.key)),
            hard: c.machine.states.get('09AB895C'), normal: c.machine.states.get('0844203C'),
            ifvs: c.houses.get('BadGuy2 House').getOwnedObjects().filter(o => o.name === 'FV' && o.isSpawned)
                .map(o => ({ id: o.id, tile: [o.tile.rx, o.tile.ry], passengers: o.transportTrait.units.map(p => p.name) })) };
    });
    assert.equal(report.patrols.source.filter(a => a.key === '09AB895C' && a.opcode === 7).length, 9);
    assert.equal(report.patrols.hard.fired, 1); assert.equal(report.patrols.normal.fired, 0);
    assert.equal(report.patrols.ifvs.length, 2);
    assert(report.patrols.ifvs.every(o => o.passengers.length <= 1));
    report.samples.push(await commands.inspect('original-hard-source-patrol-stage'));
    if (attemptEntry) {
        const entry = await page.evaluate(() => { const g = window.__ra2debug.game;
            const factory = g.world.getAllObjects().find(o => o.name === 'GAWEAP' && o.tile.rx === 103 && o.tile.ry === 120);
            const engineer = g.localPlayer.campaignControlledPlayers.flatMap(p => p.getOwnedObjects())
                .filter(o => o.name === 'ENGINEER' && o.isSpawned && !o.isDestroyed)
                .sort((a, b) => Math.hypot(a.tile.rx - 103, a.tile.ry - 120) - Math.hypot(b.tile.rx - 103, b.tile.ry - 120))[0];
            if (!engineer || !factory) throw Error('Original escort did not preserve an engineer and factory');
            return { engineer: engineer.id, factory: factory.id, owner: factory.owner.name, health: factory.healthTrait.health };
        });
        assert.equal(entry.owner, 'Civie1 House'); assert(entry.health < 100); report.beforeEntry = entry;
        await commands.order([entry.engineer], 15, entry.factory);
        report.entryEscort = await escortCommando(page, commands, [104, 118], 700, { manageEngineers: false });
        const after = await commands.inspect('original-hard-factory-entry-no-bonus'); report.samples.push(after);
        const original = await page.evaluate(id => { const g = window.__ra2debug.game, c = g.campaign;
            const factory = g.world.getAllObjects().find(o => o.id === id);
            return { factory: { owner: factory.owner.name, health: factory.healthTrait.health }, timer: g.countdownTimer.snapshot(),
                starts: c.trace.filter(a => a.opcode === 27), bonuses: c.trace.filter(a => a.opcode === 25),
                hardEntry: c.machine.states.get('09AB895C'), excludedBonus: c.machine.states.get('087966DC'),
                human: g.localPlayer.handicap, enemy: c.houses.get('BadGuy1 House').handicap };
        }, entry.factory);
        report.afterEntry = original;
        assert.equal(report.identity.launch.difficulty, 'hard'); assert.equal(report.identity.launch.semanticsVersion, 22);
        assert.equal(original.factory.owner, 'Player House'); assert.equal(original.factory.health, 100);
        assert.equal(original.bonuses.length, 0); assert(original.hardEntry.fired > 0); assert.equal(original.excludedBonus.fired, 0);
        assert.equal(original.starts.length, 1);
        assert.equal(original.timer.ticks, 18000 - (after.tick - original.starts[0].tick)); assert(original.timer.running);
        assert.equal(original.human.armor, .8); assert.equal(original.enemy.armor, 1.2); assert.equal(original.enemy.teamDelay, 1500);
    }
    journal = await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands);
    await page.screenshot({ path: path.join(out, attemptEntry ? 'native-original-hard-factory-entry.png' : 'native-original-hard-patrol-stage.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = attemptEntry ? 'PASS_NATIVE_ORIGINAL_HARD_AIRBORNE_ESCORT_FACTORY_ENTRY_AND_EXCLUDED_BONUS'
        : 'PASS_NATIVE_ORIGINAL_HARD_AIRBORNE_AND_NINE_PATROL_BRANCH';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    if (!journal && page) journal = await page.evaluate(() => window.__ra2debug?.game?.campaign?.journal.commands).catch(() => undefined);
    if (journal) await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(journal));
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
