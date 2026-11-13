import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], difficulties: [],
    scope: 'Actual Easy/Hard faction slider, original Soviet 05 source opening, human/opposing handicaps, all controlled houses, native trigger difficulty flags and original no-global-AI policy. Normal full objective/restart is separate; these two opening checks do not claim complete Easy/Hard victories.' };
let app, page;
try {
    for (const difficulty of ['easy', 'hard']) {
        const directory = path.join(out, difficulty); await fs.mkdir(directory);
        ({ app, page } = await campaignSession(directory, report, { density: 0 }));
        const range = page.locator('[data-campaign-difficulty]');
        await range.focus(); await range.press(difficulty === 'easy' ? 'Home' : 'End');
        assert.equal(await range.inputValue(), difficulty === 'easy' ? '0' : '2');
        await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov05u.map'));
        await waitWorld(page, 'sov05u.map'); await stepWorld(page, 360);
        const state = await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
            return { launch: c.launch, tick: g.currentTick, failure: c.failure, human: g.localPlayer.handicap,
                enemy: c.houses.get('BadGuy1 House').handicap,
                controlled: g.localPlayer.campaignControlledPlayers.map(owner => ({ name: owner.name, handicap: owner.handicap,
                    country: owner.country.name, neutral: owner.isNeutral })),
                neutral: c.houses.get('Other1 House').isNeutral,
                ignoreGlobal: c.definition.ini.getSection('Basic').getBool('IgnoreGlobalAITriggers'),
                activeAiTriggers: c.definition.aiTriggers.size,
                sourceFlags: [...c.definition.triggers.values()].map(trigger => ({ id: trigger.id, flags: trigger.difficulties,
                    enabled: c.machine.states.get(trigger.id).enabled })),
                sourceOpening: c.trace.filter(action => action.key === '0B00823C') };
        });
        assert.equal(state.launch.difficulty, difficulty); assert.equal(state.launch.semanticsVersion, 7); assert(!state.failure);
        const expected = difficulty === 'easy' ? [[1.2, .8, .8], [.8, 1.2, 1], 3500] : [[.8, 1.2, 1], [1.2, .8, .8], 2000];
        const values = handicap => [handicap.armor, handicap.rof, handicap.buildTime];
        assert.deepEqual(values(state.human), expected[0]); assert.deepEqual(values(state.enemy), expected[1]);
        assert.equal(state.enemy.teamDelay, expected[2]);
        assert.equal(state.controlled.length, 3); assert(state.controlled.every(owner => !owner.neutral));
        for (const owner of state.controlled) assert.deepEqual(values(owner.handicap), expected[0]);
        assert(state.neutral && state.ignoreGlobal); assert.equal(state.activeAiTriggers, 0);
        assert.equal(state.sourceFlags.length, 53);
        assert(state.sourceFlags.every(trigger => Object.values(trigger.flags).every(Boolean)));
        assert(state.sourceOpening.some(action => action.opcode === 100));
        report.difficulties.push(state);
        await page.screenshot({ path: path.join(directory, 'native-original-soviet05-difficulty-opening.png') });
        await app.close(); app = undefined;
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET05_EASY_HARD_PARAMETERS_AND_OPENING';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
