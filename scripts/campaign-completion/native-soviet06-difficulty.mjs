import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], difficulties: [],
    scope: 'Actual Easy/Hard faction slider, original Soviet 06 source opening, human/opposing handicaps, all controlled houses, native trigger difficulty flags and original no-global-AI policy. Normal full objective/restart is separate; these two opening checks do not claim complete Easy/Hard victories.' };
let app, page;
try {
    for (const difficulty of ['easy', 'hard']) {
        const directory = path.join(out, difficulty); await fs.mkdir(directory);
        ({ app, page } = await campaignSession(directory, report, { density: 0 }));
        const range = page.locator('[data-campaign-difficulty]');
        await range.focus(); await range.press(difficulty === 'easy' ? 'Home' : 'End');
        assert.equal(await range.inputValue(), difficulty === 'easy' ? '0' : '2');
        await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov06t.map'));
        await waitWorld(page, 'sov06t.map'); await stepWorld(page, 360);
        const state = await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
            return { launch: c.launch, tick: g.currentTick, failure: c.failure, human: g.localPlayer.handicap,
                enemy: c.houses.get('BadGuy1 House').handicap, credits: g.localPlayer.credits,
                sourceTeamDelays: g.rules.getIni().getSection('General').getNumberArray('TeamDelays'),
                controlled: g.localPlayer.campaignControlledPlayers.map(owner => ({ name: owner.name, handicap: owner.handicap,
                    country: owner.country.name, neutral: owner.isNeutral })),
                neutral: c.houses.get('Neutral House').isNeutral,
                ignoreGlobal: c.definition.ini.getSection('Basic').getBool('IgnoreGlobalAITriggers'),
                activeAiTriggers: c.definition.aiTriggers.size,
                sourceFlags: [...c.definition.triggers.values()].map(trigger => ({ id: trigger.id, flags: trigger.difficulties,
                    enabled: c.machine.states.get(trigger.id).enabled })),
                sourceOpening: c.trace.filter(action => action.key === '0968A9F0') };
        });
        assert.equal(state.launch.difficulty, difficulty); assert.equal(state.launch.semanticsVersion, 8); assert(!state.failure);
        const expected = difficulty === 'easy' ? [[1.2, .8, .8], [.8, 1.2, 1], 900, 15000]
            : [[.8, 1.2, 1], [1.2, .8, .8], 3500, 5000];
        const values = handicap => [handicap.armor, handicap.rof, handicap.buildTime];
        assert.deepEqual(values(state.human), expected[0]); assert.deepEqual(values(state.enemy), expected[1]);
        assert.equal(state.enemy.teamDelay, expected[2]);
        assert.equal(state.credits, expected[3]); assert.deepEqual(state.sourceTeamDelays, [3500, 1800, 900]);
        assert.equal(state.controlled.length, 1); assert(state.controlled.every(owner => !owner.neutral));
        for (const owner of state.controlled) assert.deepEqual(values(owner.handicap), expected[0]);
        assert(state.neutral && state.ignoreGlobal); assert.equal(state.activeAiTriggers, 19);
        assert.equal(state.sourceFlags.length, 43);
        assert.equal(state.sourceFlags.find(trigger => trigger.id === '097137D4').flags.easy, false);
        assert.equal(state.sourceFlags.find(trigger => trigger.id === '097137D4').flags.hard, true);
        assert(state.sourceOpening.some(action => action.opcode === 46));
        report.difficulties.push(state);
        await page.screenshot({ path: path.join(directory, 'native-original-soviet06-difficulty-opening.png') });
        await app.close(); app = undefined;
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET06_EASY_HARD_PARAMETERS_AND_OPENING';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
