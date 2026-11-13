import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], difficulties: [],
    scope: 'Native source Easy/Hard selection, opposing retail handicaps, source global/local AI flags and timer opening. Normal has a separate full original objective/restart proof. These two parameter/opening checks do not claim Easy/Hard victories or public Soviet 04 routing.' };
let app, page;
try {
    for (const difficulty of ['easy', 'hard']) {
        const directory = path.join(out, difficulty); await fs.mkdir(directory);
        ({ app, page } = await campaignSession(directory, report, { density: 0 }));
        const range = page.locator('[data-campaign-difficulty]');
        await range.focus(); await range.press(difficulty === 'easy' ? 'Home' : 'End');
        assert.equal(await range.inputValue(), difficulty === 'easy' ? '0' : '2');
        await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov04s.map'));
        await waitWorld(page, 'sov04s.map'); await stepWorld(page, 360);
        const state = await page.evaluate(() => {
            const g = window.__ra2debug.game, c = g.campaign, enemy = c.houses.get('BadGuy1 House');
            return { launch: c.launch, tick: g.currentTick, failure: c.failure, human: g.localPlayer.handicap,
                enemy: enemy.handicap, sourceTimer: g.countdownTimer.snapshot(),
                globalFlags: [...c.definition.aiTriggers.values()].filter(trigger => trigger.global && trigger.enabled
                    && trigger.difficulties[c.launch.difficulty] && c.teams.sourceAi.ownerMatches(trigger, enemy))
                    .map(trigger => ({ id: trigger.id, team: trigger.team, raw: trigger.raw,
                        force: c.definition.taskForces.get(c.definition.teams.get(trigger.team).taskForce).units })),
                localFlags: [...c.definition.aiTriggers.values()].filter(trigger => !trigger.global && trigger.enabled
                    && trigger.difficulties[c.launch.difficulty]).map(trigger => trigger.id),
                sourceTimerTrace: c.trace.filter(action => action.key === '0B454A10') };
        });
        assert.equal(state.launch.difficulty, difficulty); assert.equal(state.launch.semanticsVersion, 6); assert(!state.failure);
        const expected = difficulty === 'easy' ? [[1.2, .8, .8], [.8, 1.2, 1], 3500] : [[.8, 1.2, 1], [1.2, .8, .8], 2000];
        assert.deepEqual([state.human.armor, state.human.rof, state.human.buildTime], expected[0]);
        assert.deepEqual([state.enemy.armor, state.enemy.rof, state.enemy.buildTime], expected[1]);
        assert.equal(state.enemy.teamDelay, expected[2]);
        assert(state.sourceTimer.running && state.sourceTimer.ticks > 8800 && state.sourceTimer.ticks < 9000);
        assert(state.sourceTimerTrace.some(action => action.opcode === 27)); assert(state.globalFlags.length > 0);
        report.difficulties.push(state);
        await page.screenshot({ path: path.join(directory, 'native-original-difficulty-timer.png') });
        await app.close(); app = undefined;
    }
    assert.notDeepEqual(report.difficulties[0].globalFlags, report.difficulties[1].globalFlags);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET04_EASY_HARD_PARAMETERS_AND_TIMER_OPENING';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
